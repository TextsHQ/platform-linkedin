import { InboxName, MessageContent } from '@textshq/platform-sdk'
import got from 'got'
import { promises as fs } from 'fs'
import { groupBy } from 'lodash'
import type { CookieJar } from 'tough-cookie'

import { REQUEST_HEADERS, LinkedInURLs, LinkedInAPITypes } from '../constants'
import { mapConversationsResponse } from '../mappers'
import type { SendMessageResolveFunction } from '../api'

export default class LinkedInAPI {
  cookieJar: CookieJar

  setLoginState = async (cookieJar: CookieJar) => {
    if (!cookieJar) throw TypeError()
    this.cookieJar = cookieJar
  }

  getCSRFToken = () => {
    const csrfToken = this.cookieJar
      .getCookiesSync(LinkedInURLs.HOME)
      .find(c => c.key === 'JSESSIONID')
      ?.value
      // @ts-expect-error
      .replaceAll('"', '')

    if (!csrfToken) throw Error('could not find csrf token')
    return csrfToken
  }

  fetch = async ({ headers = {}, ...rest }) => {
    if (!this.cookieJar) throw new Error('LinkedIn cookie jar not found')

    const res = await got({
      throwHttpErrors: false,
      cookieJar: this.cookieJar,
      headers: {
        'csrf-token': this.getCSRFToken(),
        ...REQUEST_HEADERS,
        ...headers,
      },
      ...rest,
    })

    if (res.body) return JSON.parse(res.body)
  }

  fetchStream = ({ headers = {}, ...rest }) => {
    if (!this.cookieJar) throw new Error('LinkedIn cookie jar not found')

    return got.stream({
      throwHttpErrors: false,
      cookieJar: this.cookieJar,
      headers: {
        'csrf-token': this.getCSRFToken(),
        ...REQUEST_HEADERS,
        ...headers,
      },
      ...rest,
    })
  }

  getCurrentUser = async () => {
    const url = LinkedInURLs.API_ME

    const response = await this.fetch({ method: 'GET', url })

    const miniProfile = response?.included?.find(r => r.$type === LinkedInAPITypes.miniProfile)

    return miniProfile
  }

  getMessages = async (threadID: string, createdBefore: number) => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events`
    const queryParams = { keyVersion: 'LEGACY_INBOX', createdBefore }

    const response = await this.fetch({ url, method: 'GET', searchParams: queryParams })
    const { included = [] } = response
    const grouped = groupBy(included, '$type')

    const { miniProfile: miniProfileType, member: memberType, event: eventType } = LinkedInAPITypes

    return {
      members: grouped[memberType] || [],
      entities: grouped[miniProfileType] || [],
      events: grouped[eventType] || [],
    }
  }

  getThreads = async (createdBefore = Date.now(), inboxType: InboxName = InboxName.NORMAL) => {
    const url = LinkedInURLs.API_CONVERSATIONS
    const queryParams = {
      createdBefore,
      ...(inboxType === InboxName.REQUESTS ? { q: 'systemLabel', type: 'MESSAGE_REQUEST_PENDING' } : {}),
    }

    const inbox = await this.fetch({ method: 'GET', url, searchParams: queryParams })
    const archive = await this.fetch({
      method: 'GET',
      // This is done this way and not using 'searchParams' because using the searchParams it'll serialize
      // them and LinkedIn receives it with the ().
      url: `${url}?folders=List(ARCHIVED)&createdBefore=${createdBefore}&q=search`,
    })

    const parsed = [...mapConversationsResponse(inbox), ...mapConversationsResponse(archive)]

    return parsed.filter((x: any) => {
      const { entityUrn: threadId } = x?.conversation || {}
      const { entityUrn: entityId, $type } = x?.entity || {}

      return Boolean(threadId && entityId && $type === 'com.linkedin.voyager.identity.shared.MiniProfile')
    })
  }

  markThreadRead = async (threadID: string, read: boolean = true) => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodedEndpoint}`
    const payload = { patch: { $set: { read } } }

    await this.fetch({ method: 'POST', url, json: payload })
  }

  toggleArchiveThread = async (threadID: string, archived: boolean = true) => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodedEndpoint}`
    const payload = { patch: { $set: { archived } } }

    await this.fetch({ method: 'POST', url, json: payload })
  }

  searchUsers = async (keyword: string) => {
    const url = `${LinkedInURLs.API_BASE}/voyagerMessagingTypeaheadHits`
    const queryParams = {
      keyword,
      q: 'typeaheadKeyword',
      types: 'List(CONNECTIONS,GROUP_THREADS,PEOPLE,COWORKERS)',
    }

    const { data } = await this.fetch({
      method: 'GET',
      url,
      headers: {
        referer: 'https://www.linkedin.com/messaging/thread/new/',
      },
      searchParams: queryParams,
    })

    return data?.included ?? []
  }

  sendMessage = async (message: MessageContent, threadID: string, sendMessageResolvers: Map<number, SendMessageResolveFunction> = null) => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events`
    const queryParams = { action: 'create' }
    const attachments = []

    if (message.mimeType) {
      const buffer = message.fileBuffer ?? await fs.readFile(message.filePath)

      const data = await this.fetch({
        url: 'https://www.linkedin.com/voyager/api/voyagerMediaUploadMetadata',
        method: 'POST',
        json: {
          fileSize: buffer.byteLength,
          filename: message.fileName,
          mediaUploadType: 'MESSAGING_PHOTO_ATTACHMENT',
        },
        searchParams: { action: 'upload' },
      })

      await this.fetch({
        url: data.data.value.singleUploadUrl,
        method: 'PUT',
        body: buffer,
        headers: {
          Connection: 'keep-alive',
          'sec-ch-ua': '"Chromium";v="88", "Google Chrome";v="88", ";Not A Brand";v="99"',
          'Content-Type': 'image/png',
          accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'sec-fetch-site': 'cross-site',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-dest': 'image',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': 'en-US',
        },
      })

      attachments.push({
        id: data.data.value.urn,
        reference: { string: buffer.toString() },
        mediaType: message.mimeType,
        byteSize: buffer.byteLength,
        name: message.fileName,
      })
    }

    const payload = {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: {
              text: message.text ?? '',
              attributes: [],
            },
            attachments,
          },
        },
      },
      dedupeByClientGeneratedToken: false,
    }

    const response = await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: queryParams,
    })

    return new Promise<boolean>(resolve => {
      const { backendEventUrn } = response?.data.value || {}

      if (sendMessageResolvers) sendMessageResolvers.set(backendEventUrn, resolve)
      else resolve(Boolean(response?.data))
    })
  }

  deleteMessage = async (threadID: string, messageID: string): Promise<boolean> => {
    // urn:li:fsd_message:2-MTYxNzY2ODAyODc1N2IyNjY1MC0wMDQmZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==
    const messageEventId = messageID.split(':').pop()

    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodeURIComponent(threadID)}/events/${encodeURIComponent(messageEventId)}`
    const queryParams = { action: 'recall' }
    const payload = {}

    const res = await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: queryParams,
    })
    // In case this works this should be an empty response, in case this throws an error it includes a 'data' field
    // with information of the error
    return !res?.data
  }

  createThread = async (profileIds: string[]) => {
    const url = LinkedInURLs.API_CONVERSATIONS
    const queryParams = { action: 'create' }

    const payload = {
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: {
                text: '',
                attributes: [],
              },
              attachments: [],
            },
          },
        },
        recipients: profileIds,
        subtype: 'MEMBER_TO_MEMBER',
      },
    }

    const response = await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: queryParams,
    })

    return response?.data?.value
  }

  deleteThread = async (threadID: string): Promise<void> => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodedEndpoint}`

    await this.fetch({
      url,
      method: 'DELETE',
    })
  }

  toggleReaction = async (emoji: string, messageID: string, threadID: string, react: boolean) => {
    const parsedMessageId = messageID.split(':').pop()
    const encodedEndpoint = encodeURIComponent(`${parsedMessageId}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events/${encodedEndpoint}`
    const queryParams = { action: react ? 'reactWithEmoji' : 'unreactWithEmoji' }
    const payload = { emoji }

    await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: queryParams,
    })
  }

  toggleTypingState = async (threadID: string) => {
    const url = LinkedInURLs.API_CONVERSATIONS
    const queryParams = { action: 'typing' }
    const payload = { conversationId: threadID }

    await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: queryParams,
    })
  }

  logout = async (): Promise<void> => {
    const url = LinkedInURLs.LOGOUT
    await this.fetch({ url, method: 'GET' })
  }
}
