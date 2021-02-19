import { MessageContent } from '@textshq/platform-sdk'
import axios, { AxiosInstance } from 'axios'
import got from 'got'
import fs from 'fs'
import { CookieJar } from 'tough-cookie'

import { LinkedInURLs } from '../constants'
import { filterByType, parseConversationResponse, createRequestHeaders, paramsSerializer } from './helpers'

export default class LinkedInAPI {
  private requestHeaders: any = null

  private linkedInRequest: AxiosInstance | null = null

  setLoginState = async (cookieJar: CookieJar) => {
    if (!cookieJar) throw TypeError()
    const { cookies = [] } = { ...cookieJar.toJSON() }

    this.requestHeaders = createRequestHeaders(cookies)
    this.linkedInRequest = axios.create({ paramsSerializer, withCredentials: true })
  }

  getCurrentUser = async () => {
    const url = LinkedInURLs.API_ME

    const { body } = await got(url, { headers: this.requestHeaders })
    const response = JSON.parse(body)

    const miniProfileType = 'com.linkedin.voyager.identity.shared.MiniProfile'
    const miniProfile = response?.included?.find(r => r.$type === miniProfileType)

    return miniProfile
  }

  getMessages = async (threadID: string, createdBefore: number) => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events`
    const queryParams = { keyVersion: 'LEGACY_INBOX', createdBefore }

    const { body } = await got(url, { headers: this.requestHeaders, searchParams: queryParams })

    const res = JSON.parse(body)
    const { included = [] } = res

    const entities = filterByType(
      included,
      'com.linkedin.voyager.identity.shared.MiniProfile',
    )

    const events = filterByType(included, 'com.linkedin.voyager.messaging.Event')

    const members = filterByType(
      included,
      'com.linkedin.voyager.messaging.MessagingMember',
    )

    return {
      members,
      entities,
      events,
    }
  }

  getThreads = async (createdBefore = Date.now()) => {
    const url = LinkedInURLs.API_CONVERSATIONS
    const queryParams = { createdBefore }
    const { body } = await got(url, { headers: this.requestHeaders, searchParams: queryParams })
    const firstResponseParsed = parseConversationResponse(JSON.parse(body))

    return firstResponseParsed
      .sort(
        (a, b) => b?.conversation?.lastActivityAt - a?.conversation?.lastActivityAt,
      ).filter((x: any) => {
        const threadId = x?.conversation?.entityUrn?.split(':').pop()
        return Boolean(threadId)
      })
  }

  markThreadRead = async (threadID: string, read: boolean = true) => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodedEndpoint}`
    const payload = { patch: { $set: { read } } }

    await this.linkedInRequest.post(url, payload, { headers: this.requestHeaders })
  }

  searchUsers = async (keyword: string) => {
    const url = `${LinkedInURLs.API_BASE}/voyagerMessagingTypeaheadHits`
    const queryParams = {
      keyword,
      q: 'typeaheadKeyword',
      types: 'List(CONNECTIONS,GROUP_THREADS,PEOPLE,COWORKERS)',
    }

    const { data } = await this.linkedInRequest.get(url, {
      headers: {
        ...this.requestHeaders,
        referer: 'https://www.linkedin.com/messaging/thread/new/',
      },
      params: queryParams,
    })

    return data?.included ?? []
  }

  sendMessage = async (message: MessageContent, threadID: string) => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events`
    const queryParams = { action: 'create' }
    const attachments = []

    if (message.mimeType) {
      const buffer = message.fileBuffer ?? fs.readFileSync(message.filePath)

      const { data } = await this.linkedInRequest.post(
        'https://www.linkedin.com/voyager/api/voyagerMediaUploadMetadata',
        {
          fileSize: buffer.byteLength,
          filename: message.fileName,
          mediaUploadType: 'MESSAGING_PHOTO_ATTACHMENT',
        },
        {
          params: { action: 'upload' },
          headers: this.requestHeaders,
        },
      )

      await this.linkedInRequest.put(
        data.data.value.singleUploadUrl,
        buffer,
        {
          headers: {
            ...this.requestHeaders,
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
        },
      )

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

    const res = await this.linkedInRequest.post(url, payload, {
      params: queryParams,
      headers: this.requestHeaders,
    })
    return res.status === 201
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

    const { data } = await this.linkedInRequest.post(url, payload, {
      params: queryParams,
      headers: this.requestHeaders,
    })

    return data?.data?.value
  }

  deleteThread = async (threadID: string): Promise<void> => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodedEndpoint}`

    await this.linkedInRequest.delete(url, { headers: this.requestHeaders })
  }

  toggleReaction = async (emoji: string, messageID: string, threadID: string) => {
    const parsedMessageId = messageID.split(':').pop()
    const encodedEndpoint = encodeURIComponent(`${parsedMessageId}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${threadID}/events/${encodedEndpoint}`
    const queryParams = { action: 'reactWithEmoji' }
    const payload = { emoji }

    await this.linkedInRequest.post(url, payload, {
      params: queryParams,
      headers: this.requestHeaders,
    })
  }

  toggleTypingState = async (threadID: string) => {
    const url = LinkedInURLs.API_CONVERSATIONS
    const queryParams = { action: 'typing' }
    const payload = { conversationId: threadID }

    await this.linkedInRequest.post(url, payload, {
      params: queryParams,
      headers: this.requestHeaders,
    })
  }

  getRequestHeaders = () => this.requestHeaders

  logout = async (): Promise<void> => {
    const url = LinkedInURLs.LOGOUT
    await this.linkedInRequest.get(url, { headers: this.requestHeaders })
  }
}
