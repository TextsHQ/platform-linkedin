import crypto from 'crypto'
import { ActivityType, FetchOptions, InboxName, Message, MessageContent, MessageSendOptions, texts } from '@textshq/platform-sdk'
import { promises as fs } from 'fs'
import { groupBy } from 'lodash'
import FormData from 'form-data'
import type { CookieJar } from 'tough-cookie'

import { REQUEST_HEADERS, LinkedInURLs, LinkedInAPITypes } from '../constants'
import { urnID } from '../util'
import type { SendMessageResolveFunction } from '../api'
import type { ParticipantsReceiptResponse } from './linkedin.types'

export default class LinkedInAPI {
  cookieJar: CookieJar

  private httpClient = texts.createHttpClient()

  // key is threadID, values are participantIDs
  conversationsParticipants: Record<string, string[]> = {}

  setLoginState = async (cookieJar: CookieJar) => {
    if (!cookieJar) throw TypeError()
    this.cookieJar = cookieJar
  }

  getCSRFToken = () => {
    const csrfToken = this.cookieJar
      .getCookiesSync(LinkedInURLs.HOME)
      .find(c => c.key === 'JSESSIONID')
      ?.value
      .replaceAll('"', '')

    if (!csrfToken) throw Error('could not find csrf token')
    return csrfToken
  }

  fetchRaw = (url: string, { headers = {}, ...rest }: FetchOptions) => {
    if (!this.cookieJar) throw new Error('LinkedIn cookie jar not found')

    const opts: FetchOptions = {
      ...rest,
      body: rest.body,
      cookieJar: this.cookieJar,
      headers: {
        'csrf-token': this.getCSRFToken(),
        ...headers,
      },
    }

    return this.httpClient.requestAsString(url, opts)
  }

  fetch = async <T = any>({ url, json, headers = {}, ...rest }: FetchOptions & { url: string, json?: any }): Promise<T> => {
    const opts: FetchOptions = {
      ...rest,
      body: json ? JSON.stringify(json) : rest.body,
      headers: {
        ...REQUEST_HEADERS,
        ...json ? { 'content-type': 'application/json' } : {},
      },
    }

    const res = await this.fetchRaw(url, opts)
    if (texts.IS_DEV && res.statusCode >= 400) {
      console.log(`[LinkedIn] ${url} returned ${res.statusCode} status code`)
    }
    if (!res.body?.length) return
    if (res.body[0] === '<') {
      texts.log(url, res.body)
      throw Error('got html instead of json')
    }
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

  getThreads = async (cursors: [number, number], inboxType: InboxName = InboxName.NORMAL) => {
    const [inbox, archive] = await Promise.all([
      this.fetch({
        method: 'GET',
        url: LinkedInURLs.API_CONVERSATIONS,
        searchParams: {
          createdBefore: cursors[0],
          ...(inboxType === InboxName.REQUESTS ? { q: 'systemLabel', type: 'MESSAGE_REQUEST_PENDING' } : {}),
        },
      }),
      this.fetch({
        method: 'GET',
        // we're not using searchParams here to ensure () is not URL-encoded
        url: `${LinkedInURLs.API_CONVERSATIONS}?folders=List(ARCHIVED)&createdBefore=${cursors[1]}&q=search`,
      }),
    ])

    return [inbox, archive]
  }

  getProfile = async (publicId: string): Promise<any> => {
    const url = `${LinkedInURLs.API_BASE}/identity/dash/profiles`
    const queryParams = {
      q: 'memberIdentity',
      memberIdentity: publicId,
      decorationId: 'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-35',
    }

    const res = await this.fetch({
      method: 'GET',
      url,
      searchParams: queryParams,
    })
    if (!res) return

    const { included } = res
    return included?.find(({ $type, entityUrn }) => $type === 'com.linkedin.voyager.dash.identity.profile.Profile' && urnID(entityUrn) === publicId)
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
    const queryParams = Object.entries({
      keyword,
      q: 'typeaheadKeyword',
      types: 'List(CONNECTIONS,COWORKERS)',
    }).map(([key, value]) => `${key}=${value}`)

    const res = await this.fetch({
      method: 'GET',
      // Using query params this way because if we use fetch searchParams it'll serialize them
      // and List(...) won't work
      url: `${url}?${queryParams.join('&')}`,
    })

    return res?.included ?? []
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

    const originToken = options.pendingMessageID

    const mentionedAttributes = (() => {
      if (!message.mentionedUserIDs?.length) return []

      const re = new RegExp('@', 'gi')
      const results = [...message.text?.matchAll(re)]

      return results.map(({ index: initialIndex }, index) => {
        const remainingText = message.text.slice(initialIndex)
        const endIndex = remainingText.indexOf(' ')

        return {
          length: endIndex >= 0 ? endIndex : remainingText.length,
          start: initialIndex,
          type: {
            'com.linkedin.pemberly.text.Entity': {
              emberEntityName: 'pemberly/text/entity',
              isEntity: true,
              tag: 'span',
              type: 'Entity',
              urn: `urn:li:fs_miniProfile:${message.mentionedUserIDs[index]}`,
            },
          },
        }
      })
    })()

    const payload = {
      dedupeByClientGeneratedToken: false,
      eventCreate: {
        originToken,
        // trackingId: '',
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: {
              text: message.text ?? '',
              attributes: [...mentionedAttributes],
            },
            attachments,
          },
        },
      },
    }

    const promise = new Promise<Message[]>(resolve => {
      sendMessageResolvers.set(originToken, resolve)
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

  createThread = async (profileIds: string[], message?: string) => {
    const url = LinkedInURLs.API_CONVERSATIONS
    const queryParams = { action: 'create' }

    const payload = {
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: {
                text: message || '',
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

  changeParticipants = async (threadID: string, participantID: string, action: 'add' | 'remove') => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodeURIComponent(threadID)}`
    const payload = action === 'add' ? {
      addMessageRequestParticipants: [],
      showHistory: true,
      addParticipants: [participantID],
    } : { removeParticipants: [participantID] }

    await this.fetch({
      url,
      method: 'POST',
      json: payload,
      searchParams: { action: 'changeParticipants' },
    })
  }

  getUserPresence = async (threadID: string): Promise<{ userID: string, status: 'OFFLINE' | 'ONLINE', lastActiveAt: number }[]> => {
    const participants = this.conversationsParticipants[threadID] || []
    const ids = participants.map(id => encodeURIComponent(`urn:li:fs_miniProfile:${id}`))
    const url = `${LinkedInURLs.API_MESSAGING}/presenceStatuses`
    const body = `ids=List(${ids.join(',')})`
    // {
    //   "data": {
    //     "statuses": {},
    //     "results": {
    //       "urn:li:fs_miniProfile:ACoAADRSJgABy3J9f7VTdTKCbW79SieJTT-sub0": {
    //         "lastActiveAt": 1642356480000,
    //         "availability": "OFFLINE",
    //         "instantlyReachable": false,
    //         "$type": "com.linkedin.voyager.messaging.presence.MessagingPresenceStatus"
    //       }
    //     },
    //     "errors": {}
    //   },
    //   "included": []
    // }
    const { data } = await this.fetch({
      url,
      body,
      method: 'POST',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'content-type': 'application/x-www-form-urlencoded',
        'x-http-method-override': 'GET',
      },
    })
    if (!data) {
      texts.log('fetching presenceStatuses returned undefined')
      return
    }
    const { results } = data
    const keys = Object.keys(results)
    return keys.map(key => ({
      userID: urnID(key),
      status: results[key].availability,
      lastActiveAt: results[key].lastActiveAt,
    }))
  }

  getParticipantsReceipt = async (threadID: string): Promise<ParticipantsReceiptResponse['data']['elements']> => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodedEndpoint}/participantReceipts`

    const res = await this.fetch<ParticipantsReceiptResponse>({ url })
    const { elements } = res.data

    return elements || []
  }

  sendPresenceChange = async (type: ActivityType): Promise<void> => {
    const url = `${LinkedInURLs.HOME}psettings/presence/update-presence-settings`
    const form = new FormData()

    const value = type === ActivityType.ONLINE ? 'CONNECTIONS' : 'HIDDEN'
    const token = this.getCSRFToken()

    form.append('dataKey', 'isPresenceEnabled')
    form.append('#el', '#setting-presence')
    form.append('name', 'presence')
    form.append('locale', 'en_US')
    form.append('backUrl', 'https://www.linkedin.com/mypreferences/m')
    form.append('helpCenterPath', '/help/linkedin')
    form.append('pageTitle', 'Manage active status')
    form.append('setting', 'presence')
    form.append('isNotCnDomain', 'true')
    form.append('shouldHideMobileHeader', 'false')
    form.append('path', '/psettings/presence')
    form.append('device', 'DESKTOP')
    form.append('initialFetch', 'true')
    form.append('dataVal', 'undefined')
    form.append('hasSuccess', 'false')
    form.append('visibility', value)
    form.append('csrfToken', token)

    const boundary = form.getBoundary()

    await this.fetch({
      url,
      body: form,
      method: 'POST',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'sec-ch-ua': texts.constants.USER_AGENT,
        'sec-ch-ua-mobile': '?0',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-li-page-instance': 'urn:li:page:psettings-presence-view-settings;d6hZx3qWQEedu9VqAgwoqQ==',
        'x-requested-with': 'XMLHttpRequest',
        'csrf-token': token,
      },
    })
  }

  sendMutePatch = async (threadID: string, mutedUntil: 'forever' | Date | null): Promise<void> => {
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodeURIComponent(threadID)}`
    const value = !!(mutedUntil === 'forever')
    const payload = { patch: { $set: { muted: value } } }

    await this.fetch({
      url,
      method: 'POST',
      json: payload,
    })
  }

  registerPush = async (token: string, register: boolean) => {
    /* refer to:
      LinkedIn v4.1.698 JADX/sources/com/linkedin/data/lite/protobuf/ProtoWriter.java
      LinkedIn v4.1.698 JADX/sources/com/linkedin/data/lite/protobuf/ProtobufGenerator.java
      linkedin encodes the following json into protobuf, we simply hardcode the binary data
      {
        pushNotificationTokens: [token],
        pushNotificationEnabled: true,
      }
    */
    const MAP_START = Buffer.from([0x00])
    const ARRAY_START = Buffer.from([0x01])
    const TRUE = Buffer.from([0x08])
    const FALSE = Buffer.from([0x09])
    const LEADING_ORDINAL = Buffer.from([0x14])
    const arrayLength = 1
    const keysLength = 2 // ['pushNotificationTokens', 'pushNotificationEnabled'].length
    const body = Buffer.concat([
      MAP_START,
      Buffer.from([keysLength]),
      LEADING_ORDINAL,
      Buffer.from(['pushNotificationTokens'.length]),
      Buffer.from('pushNotificationTokens'),
      ARRAY_START,
      Buffer.from([arrayLength]),
      LEADING_ORDINAL,
      Buffer.from([token.length]), // safe to assume token length is <256
      Buffer.from([1]), // unknown
      Buffer.from(token),
      LEADING_ORDINAL,
      Buffer.from(['pushNotificationEnabled'.length]),
      Buffer.from('pushNotificationEnabled'),
      TRUE,
    ])

    const res = await this.fetchRaw(`${LinkedInURLs.API_BASE}/voyagerNotificationsDashPushRegistration?action=${register ? 'register' : 'deregister'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-protobuf2 ;symbol-table=voyager-11626',
        Accept: 'application/vnd.linkedin.deduped+x-protobuf',
        'X-Li-Track': JSON.stringify({
          osName: 'Android OS',
          osVersion: '32',
          clientVersion: '4.1.698',
          clientMinorVersion: 160600,
          model: 'Google_sdk_gphone64_arm64',
          displayDensity: 2.75,
          displayWidth: 1080,
          displayHeight: 2296,
          dpi: 'xhdpi',
          deviceType: 'android',
          appId: 'com.linkedin.android',
          deviceId: crypto.randomUUID(),
          timezoneOffset: 0,
          timezone: 'Europe/London',
          storeId: 'us_googleplay',
          isAdTrackingLimited: false,
          mpName: 'voyager-android',
          mpVersion: '0.771.88',
        }),
      },
      body,
    })
    if (res.statusCode !== 200) {
      throw Error(`invalid status code ${res.statusCode}`)
    }
  }

  logout = async (): Promise<void> => {
    const url = LinkedInURLs.LOGOUT
    await this.fetch({ url, method: 'GET' })
  }
}
