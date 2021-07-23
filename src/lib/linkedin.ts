import { FetchOptions, InboxName, Message, MessageContent, MessageSendOptions, texts } from '@textshq/platform-sdk'
import { promises as fs } from 'fs'
import { groupBy } from 'lodash'
import type { CookieJar } from 'tough-cookie'

import { REQUEST_HEADERS, LinkedInURLs, LinkedInAPITypes } from '../constants'
import { mapConversationsResponse } from '../mappers'
import type { SendMessageResolveFunction } from '../api'
import { urnID } from '../util'

export default class LinkedInAPI {
  cookieJar: CookieJar

  httpClient = texts.createHttpClient()

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

  fetch = async ({ url, json, headers = {}, ...rest }: FetchOptions & { url: string, json?: any }) => {
    if (!this.cookieJar) throw new Error('LinkedIn cookie jar not found')

    const opts: FetchOptions = {
      ...rest,
      body: json ? JSON.stringify(json) : rest.body,
      cookieJar: this.cookieJar,
      headers: {
        'csrf-token': this.getCSRFToken(),
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...REQUEST_HEADERS,
        ...headers,
      },
    }

    const res = await this.httpClient.requestAsString(url, opts)
    if (!res.body?.length) return

    return JSON.parse(res.body)
  }

  fetchStream = ({ url, headers = {}, ...rest }: FetchOptions & { url: string }) => {
    if (!this.cookieJar) throw new Error('LinkedIn cookie jar not found')

    return texts.fetchStream(url, {
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

  getProfile = async (publicId: string): Promise<any> => {
    const url = `${LinkedInURLs.API_BASE}/identity/dash/profiles`
    const queryParams = {
      q: 'memberIdentity',
      memberIdentity: publicId,
      decorationId: 'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-35',
    }

    const { included } = await this.fetch({
      method: 'GET',
      url,
      searchParams: queryParams,
    })

    return included?.find(({ $type }) => $type === 'com.linkedin.voyager.dash.identity.profile.Profile') || {}
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

  uploadBuffer = async (buffer: Buffer, filename: string) => {
    const data = await this.fetch({
      url: 'https://www.linkedin.com/voyager/api/voyagerMediaUploadMetadata',
      method: 'POST',
      json: {
        fileSize: buffer.byteLength,
        filename,
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
        'Content-Type': 'image/png',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-dest': 'image',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US',
      },
    })
    return data
  }

  sendMessage = async (threadID: string, message: MessageContent, options: MessageSendOptions, sendMessageResolvers: Map<string, SendMessageResolveFunction> = null) => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events`
    const attachments = []

    if (message.mimeType) {
      const buffer = message.fileBuffer ?? await fs.readFile(message.filePath)
      const data = await this.uploadBuffer(buffer, message.fileName)

      attachments.push({
        id: data.data.value.urn,
        reference: { string: buffer.toString() },
        mediaType: message.mimeType,
        byteSize: buffer.byteLength,
        name: message.fileName,
      })
    }

    const payload = {
      dedupeByClientGeneratedToken: false,
      eventCreate: {
        originToken: options.pendingMessageID,
        // trackingId: '',
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
    }

    const promise = new Promise<Message[]>(resolve => {
      sendMessageResolvers.set(options.pendingMessageID, resolve)
    })
    const res = await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: { action: 'create' },
    })
    if (!res?.data?.value?.createdAt) throw Error(JSON.stringify(res))
    return promise
  }

  deleteMessage = async (threadID: string, messageID: string): Promise<boolean> => {
    const messageEventId = urnID(messageID)

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
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events/${encodeURIComponent(urnID(messageID))}`
    const queryParams = { action: react ? 'reactWithEmoji' : 'unreactWithEmoji' }
    const payload = { emoji }

    await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: queryParams,
    })
  }

  sendTypingState = async (threadID: string) => {
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

  editMessage = async (threadID: string, messageID: string, content: MessageContent): Promise<boolean> => {
    // https://www.linkedin.com/voyager/api/messaging/conversations/2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg%3D%3D/events/2-MTYyMzIwNDQ2NzkxNGI5NTg4OC0wMDEmZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg%3D%3D
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodeURIComponent(threadID)}/events/${encodeURIComponent(urnID(messageID))}`
    const payload = { patch: { eventContent: { 'com.linkedin.voyager.messaging.event.MessageEvent': { attributedBody: { $set: { text: content.text, attributes: [] } } } } } }

    const res = await this.fetch({
      url,
      method: 'POST',
      json: payload,
    })

    // res will be { data: { status: 422 }, included: [] } if message could not be edited
    return res === undefined
  }

  renameThread = async (threadID: string, name: string): Promise<void> => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodeURIComponent(threadID)}`
    const payload = { patch: { $set: { name } } }

    await this.fetch({
      url,
      method: 'POST',
      json: payload,
    })
  }

  logout = async (): Promise<void> => {
    const url = LinkedInURLs.LOGOUT
    await this.fetch({ url, method: 'GET' })
  }
}
