import { MessageContent } from '@textshq/platform-sdk'
import axios, { AxiosInstance } from 'axios'
import got from 'got'
import fs from 'fs'
import { CookieJar } from 'tough-cookie'

import { LINKEDIN_API_CONVERSATIONS_ENDPOINT, LINKEDIN_API_ME_ENDPOINT, LINKEDIN_API_URL } from '../constants/linkedin'
import { filterByType } from './helpers/filter-by-type'
import { parseConversationResponse } from './helpers/parse-conversation-response'
import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/params-serializer'

export default class LinkedInAPI {
  private requestHeaders: any = null

  private linkedInRequest: AxiosInstance | null = null

  setLoginState = async (cookieJar: CookieJar): Promise<void> => {
    if (!cookieJar) throw TypeError()
    const { cookies = [] } = { ...cookieJar.toJSON() }

    this.requestHeaders = createRequestHeaders(cookies)
    this.linkedInRequest = axios.create({ paramsSerializer, withCredentials: true })
  }

  getCurrentUser = async (): Promise<unknown> => {
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_ME_ENDPOINT}`

    const { body } = await got(url, { headers: this.requestHeaders })
    const response = JSON.parse(body)

    const miniProfileType = 'com.linkedin.voyager.identity.shared.MiniProfile'
    const miniProfile = response?.included?.find(r => r.$type === miniProfileType)

    return miniProfile
  }

  getMessages = async (threadID: string): Promise<any> => {
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_CONVERSATIONS_ENDPOINT}/${threadID}/events`
    const queryParams = { keyVersion: 'LEGACY_INBOX' }

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

  getThreads = async (): Promise<any> => {
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_CONVERSATIONS_ENDPOINT}`
    // FIXME: Add pagination
    // After 01 Jan 2020
    const queryParams = { createdAfter: '1577847600000' }
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

  markThreadAsRead = async (threadID: string): Promise<void> => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_CONVERSATIONS_ENDPOINT}/${encodedEndpoint}`
    const payload = { patch: { $set: { read: true } } }

    await this.linkedInRequest.post(url, payload, { headers: this.requestHeaders })
  }

  searchUsers = async (keyword: string): Promise<unknown[]> => {
    const url = `${LINKEDIN_API_URL}/voyagerMessagingTypeaheadHits`
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

  sendMessage = async (message: MessageContent, threadID: string): Promise<void> => {
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_CONVERSATIONS_ENDPOINT}/${threadID}/events`
    const queryParams = { action: 'create' }
    const attachments = []

    if (message.mimeType) {
      const { data } = await this.linkedInRequest.post(
        'https://www.linkedin.com/voyager/api/voyagerMediaUploadMetadata',
        {
          fileSize: 2426,
          filename: message.fileName,
          mediaUploadType: 'MESSAGING_PHOTO_ATTACHMENT',
        },
        {
          params: { action: 'upload' },
          headers: this.requestHeaders,
        },
      )

      const buffer = message.fileBuffer ?? fs.readFileSync(message.filePath)
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
        byteSize: 1667,
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

    await this.linkedInRequest.post(url, payload, {
      params: queryParams,
      headers: this.requestHeaders,
    })
  }

  createThread = async (profileIds: string[]): Promise<any> => {
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_CONVERSATIONS_ENDPOINT}`
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

  toggleReaction = async (emoji: string, messageID: string, threadID: string): Promise<void> => {
    const parsedMessageId = messageID.split(':').pop()
    const encodedEndpoint = encodeURIComponent(`${parsedMessageId}`)
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_CONVERSATIONS_ENDPOINT}/${threadID}/events/${encodedEndpoint}`
    const queryParams = { action: 'reactWithEmoji' }
    const payload = { emoji }

    await this.linkedInRequest.post(url, payload, {
      params: queryParams,
      headers: this.requestHeaders,
    })
  }

  toggleTypingState = async (threadID:string): Promise<void> => {
    const url = `${LINKEDIN_API_URL}/${LINKEDIN_API_CONVERSATIONS_ENDPOINT}`
    const queryParams = { action: 'typing' }
    const payload = { conversationId: threadID }

    await this.linkedInRequest.post(url, payload, {
      params: queryParams,
      headers: this.requestHeaders,
    })
  }
}
