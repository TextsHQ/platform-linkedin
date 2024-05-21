import FormData from 'form-data'
import crypto, { randomUUID } from 'crypto'
import { ActivityType, FetchOptions, InboxName, Message, MessageContent, MessageSendOptions, RateLimitError, texts, Thread, ThreadFolderName, User } from '@textshq/platform-sdk'
import { ExpectedJSONGotHTMLError } from '@textshq/platform-sdk/dist/json'
import { setTimeout as setTimeoutAsync } from 'timers/promises'
import { promises as fs } from 'fs'
import type { CookieJar } from 'tough-cookie'

import { LinkedInURLs, LinkedInAPITypes, GraphQLRecipes, GraphQLHeaders } from '../constants'
import { mapConversationParticipant, mapFile, mapGraphQLConversation, mapGraphQLMessage, mapGraphQLSearchUser } from '../mappers'
import { urnID, encodeLinkedinUriComponent, extractSecondEntity, debounce, getTrackingId } from '../util'
import { MY_NETWORK_THREAD_ID } from './my-network'

import type { ConversationByIdGraphQLResponse, ConversationsByCategoryGraphQLResponse, GraphQLConversation, NewConversationResponse, SeenReceipt, SeenReceiptGraphQLResponse } from './types/conversations'
import type { GraphQLMessage, MessagesByAnchorTimestamp, MessagesGraphQLResponse, ReactionsByMessageAndEmoji, RichReaction, SendMessageResponse } from './types'
import type { ConversationParticipant, SearchUserResult } from './types/users'
import type { SendMessageResolveFunction } from '../api'
import type { ThreadSeenMap } from '../mappers'

const timezoneOffset = 0
const timezone = 'Europe/London'

export const REQUEST_HEADERS: Record<string, string> = {
  'x-restLi-protocol-version': '2.0.0',
  'x-li-lang': 'en_US',
  'user-agent': texts.constants.USER_AGENT,
  accept: 'application/vnd.linkedin.normalized+json+2.1',
  'x-li-track': JSON.stringify({
    clientVersion: '1.13.1471',
    mpVersion: '1.13.1471',
    osName: 'web',
    timezoneOffset,
    timezone,
    deviceFormFactor: 'DESKTOP',
    mpName: 'voyager-web',
  }),
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  referer: 'https://www.linkedin.com/',
  'accept-encoding': 'gzip, deflate, br',
  'accept-language': 'en-US,en;q=0.9',
}

export default class LinkedInAPI {
  cookieJar: CookieJar

  private httpClient = texts.createHttpClient()

  private messagesCache = new Map<string, Message>()

  // key is threadID, values are participantIDs
  readonly conversationParticipantsMap: Record<string, string[]> = {}

  setLoginState = (cookieJar: CookieJar) => {
    if (!cookieJar) throw TypeError('invalid cookieJar')
    this.cookieJar = cookieJar
  }

  getCSRFToken = async () => {
    let attempts = 3
    while (--attempts) {
      const cookies = await this.cookieJar.getCookies(LinkedInURLs.HOME)
      const csrfToken = cookies
        .find(c => c.key === 'JSESSIONID')
        ?.value
        .replaceAll('"', '')

      if (csrfToken) return csrfToken
      // this should make server send a set-cookie header with JSESSIONID
      await this.httpClient.requestAsString(LinkedInURLs.FEED, { cookieJar: this.cookieJar })
    }
    throw new Error('Could not get CSRF token')
  }

  fetchRaw = async (url: string, { headers = {}, ...rest }: FetchOptions) => {
    if (!this.cookieJar) throw new Error('LinkedIn cookie jar not found')

    const opts: FetchOptions = {
      ...rest,
      body: rest.body,
      cookieJar: this.cookieJar,
      headers: {
        'csrf-token': await this.getCSRFToken(),
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
        ...(headers || {}),
      },
    }

    const res = await this.fetchRaw(url, opts)
    if (res.statusCode === 429) {
      texts.log(res.statusCode, url)
      throw new RateLimitError()
    }
    if (res.statusCode >= 400) {
      throw Error(`${url} returned status code ${res.statusCode}`)
    }
    if (!res.body?.length) return
    if (res.body[0] === '<') {
      texts.log(res.statusCode, url, res.body)
      throw new ExpectedJSONGotHTMLError(res.statusCode, res.body)
    }
    return JSON.parse(res.body)
  }

  fetchStream = async ({ url, headers = {}, ...rest }: FetchOptions & { url: string }) => {
    if (!this.cookieJar) throw new Error('LinkedIn cookie jar not found')

    return texts.fetchStream(url, {
      cookieJar: this.cookieJar,
      headers: {
        'csrf-token': await this.getCSRFToken(),
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

  getMessageReactionParticipants = async ({ entityUrn, emoji }: { entityUrn: string, emoji: string }): Promise<ConversationParticipant[]> => {
    const queryParams = {
      variables: `(messageUrn:${encodeLinkedinUriComponent(entityUrn)},emoji:${encodeURIComponent(emoji)})`,
      queryId: GraphQLRecipes.messages.getReactionParticipantsByMessageAndEmoji,
    }

    const url = `${LinkedInURLs.API_MESSAGING_GRAPHQL}?queryId=${queryParams.queryId}&variables=${queryParams.variables}`
    const { data: response } = await this.fetch<ReactionsByMessageAndEmoji>({
      url,
      method: 'GET',
      headers: GraphQLHeaders,
    })

    return response?.messengerMessagingParticipantsByMessageAndEmoji?.elements
  }

  getMessages = async ({
    threadID,
    currentUserID,
    createdBefore,
    threadParticipantsSeen = new Map(),
  }: {
    threadID: string
    currentUserID: string
    createdBefore: number
    threadParticipantsSeen?: ThreadSeenMap
  }): Promise<{ messages: Message[], prevCursor: string | undefined }> => {
    const messageConversationUrn = `(urn:li:fsd_profile:${currentUserID},${threadID})`
    const conversationUrn = `:li:msg_conversation:${messageConversationUrn}`
    const pagination = `countBefore:20,countAfter:0,deliveredAt:${createdBefore}`

    const queryParams = {
      variables: `(conversationUrn:urn${encodeLinkedinUriComponent(conversationUrn)},${pagination})`,
      queryId: GraphQLRecipes.messages.getMessagesByAnchorTimestamp,
    }

    const url = `${LinkedInURLs.API_MESSAGING_GRAPHQL}?queryId=${queryParams.queryId}&variables=${queryParams.variables}`

    const { data: response } = await this.fetch<MessagesGraphQLResponse>({
      url,
      method: 'GET',
      headers: GraphQLHeaders,
    })

    const responseBody = (response as MessagesByAnchorTimestamp)?.messengerMessagesByAnchorTimestamp
    // Key is messageID, values reactions with participant
    const reactionsMap: Map<string, RichReaction[]> = new Map()

    const messagesPromises = (responseBody?.elements || []).map(async (message: GraphQLMessage) => {
      if (message.reactionSummaries?.length > 0) {
        await Promise.all((message.reactionSummaries || []).map(async reaction => {
          const reactionParticipants = await this.getMessageReactionParticipants({
            entityUrn: message.entityUrn,
            emoji: reaction.emoji,
          })

          reactionsMap.set(message.backendUrn, [
            ...(reactionsMap.get(message.entityUrn) || []),
            ...(reactionParticipants || []).map(participant => ({
              ...reaction,
              participant,
            })),
          ])
        }))
      }

      const mappedMessage = mapGraphQLMessage(message, currentUserID, threadParticipantsSeen, reactionsMap)
      this.messagesCache.set(mappedMessage.id, mappedMessage)

      return mappedMessage
    })

    const messages = await Promise.all(messagesPromises)

    return {
      messages,
      prevCursor: responseBody?.metadata.prevCursor || undefined,
    }
  }

  private async updateSeenReceipts(allElements: GraphQLConversation[], currentUserID: string, threadSeenMap: ThreadSeenMap) {
    const seenReceiptPromises = allElements.map(async thread => {
      const threadID = extractSecondEntity(thread.entityUrn)
      const seenReceipts = await this.getSeenReceipts({ threadID, currentUserID })
      if (!seenReceipts) return
      for (const seenReceipt of seenReceipts) {
        if (!threadSeenMap.has(threadID)) threadSeenMap.set(threadID, new Map())

        const participant = mapConversationParticipant(seenReceipt.seenByParticipant)
        const messageUrn = extractSecondEntity(seenReceipt.message.entityUrn)
        const messageID = `urn:li:messagingMessage:${messageUrn}`

        threadSeenMap.get(threadID).set(participant.id, [messageID, new Date(seenReceipt.seenAt)])
      }
    })
    await Promise.all(seenReceiptPromises)
  }

  getThreads = async ({
    cursors,
    inboxType = InboxName.NORMAL,
    currentUserID,
    threadSeenMap = new Map(),
  }: {
    cursors: [number, number]
    inboxType: ThreadFolderName
    currentUserID: string
    threadSeenMap: ThreadSeenMap
  }): Promise<{
    inbox: { threads: Thread[], cursor: number }
    archive: { threads: Thread[], cursor: number }
  }> => {
    const currentUserVariable = `urn:li:fsd_profile:${currentUserID}`
    const mailboxVariable = `mailboxUrn:${encodeLinkedinUriComponent(currentUserVariable)}`

    const queryParams = {
      queryId: GraphQLRecipes.conversations.getByCategory,
      variables: (category: string, cursor: number) => `(category:${category},count:20,${mailboxVariable},lastUpdatedBefore:${cursor})`,
    }

    const inboxUrl = `${LinkedInURLs.API_MESSAGING_GRAPHQL}?queryId=${queryParams.queryId}&variables=${queryParams.variables(inboxType === InboxName.REQUESTS ? 'MESSAGE_REQUEST_PENDING' : 'INBOX', cursors[0])}`
    const archiveUrl = `${LinkedInURLs.API_MESSAGING_GRAPHQL}?queryId=${queryParams.queryId}&variables=${queryParams.variables('ARCHIVE', cursors[1])}`

    const commonParams = { method: 'GET' as 'GET', headers: GraphQLHeaders }

    const [inboxResponse, archiveResponse] = await Promise.all([
      cursors[0] ? this.fetch<ConversationsByCategoryGraphQLResponse>({ ...commonParams, url: inboxUrl }) : null,
      cursors[1] ? this.fetch<ConversationsByCategoryGraphQLResponse>({ ...commonParams, url: archiveUrl }) : null,
    ])

    const inboxElements = inboxResponse?.data?.messengerConversationsByCategory?.elements
    const archiveElements = archiveResponse?.data?.messengerConversationsByCategory?.elements

    const allElements = [...(inboxElements || []), ...(archiveElements || [])]

    await this.updateSeenReceipts(allElements, currentUserID, threadSeenMap).catch(texts.error)

    const inboxThreads = (inboxElements || []).filter(x => x?.entityUrn).map(thread => mapGraphQLConversation(thread, currentUserID, threadSeenMap))
    const archivedThreads = (archiveElements || []).filter(x => x?.entityUrn).map(thread => mapGraphQLConversation(thread, currentUserID, threadSeenMap))

    return {
      inbox: {
        threads: inboxThreads,
        cursor: inboxThreads?.[inboxThreads.length - 1]?.timestamp.getTime(),
      },
      archive: {
        threads: archivedThreads,
        cursor: archivedThreads?.[archivedThreads.length - 1]?.timestamp.getTime(),
      },
    }
  }

  getSeenReceipts = async ({ threadID, currentUserID }: { threadID: string, currentUserID: string }): Promise<SeenReceipt[]> => {
    const messageConversationUrn = `(urn:li:fsd_profile:${currentUserID},${threadID})`
    const conversationUrn = `:li:msg_conversation:${messageConversationUrn}`

    const queryParams = {
      queryId: GraphQLRecipes.conversations.getSeenReceipts,
      variables: `(conversationUrn:urn${encodeLinkedinUriComponent(conversationUrn)})`,
    }

    const url = `${LinkedInURLs.API_MESSAGING_GRAPHQL}?queryId=${queryParams.queryId}&variables=${queryParams.variables}`
    const { data: response } = await this.fetch<SeenReceiptGraphQLResponse>({
      url,
      method: 'GET',
      headers: GraphQLHeaders,
    })

    return response?.messengerSeenReceiptsByConversation?.elements
  }

  markThreadRead = async (threadID: string, read = true) => {
    const encodedEndpoint = encodeURIComponent(`${threadID}`)
    const url = `${LinkedInURLs.API_CONVERSATIONS}/${encodedEndpoint}`
    const payload = { patch: { $set: { read } } }

    await this.fetch({ method: 'POST', url, json: payload })
  }

  toggleArchiveThread = async (threadIDs: string[], archived = true) => {
    const url = LinkedInURLs.API_CONVERSATIONS_API
    const user = await this.getCurrentUser()
    const filteredThreads = threadIDs.filter(id => id !== MY_NETWORK_THREAD_ID)
    const chunkSize = 20

    const sendArchiveThread = async (ids: string[]): Promise<void> => {
      const payload = {
        conversationUrns: ids.map(threadID => `urn:li:msg_conversation:(${user.dashEntityUrn},${threadID})`),
        category: 'ARCHIVE',
      }

      await this.fetch({
        method: 'POST',
        url,
        json: payload,
        searchParams: { action: archived ? 'addCategory' : 'removeCategory' },
      })
    }

    for (let i = 0; i < filteredThreads.length; i += chunkSize) {
      const chunk = filteredThreads.slice(i, i + chunkSize)
      try {
        await sendArchiveThread(chunk)
        await setTimeoutAsync(500)
      } catch (error) {
        texts.error(error)
        await setTimeoutAsync(5_000)
      }
    }
  }

  archiveThread = debounce((threadIDs: string[]) => this.toggleArchiveThread(threadIDs, true), 300)

  unArchiveThread = debounce((threadIDs: string[]) => this.toggleArchiveThread(threadIDs, false), 300)

  searchUsers = async (keyword: string): Promise<User[]> => {
    if (!keyword) return []

    const queryParams = {
      queryId: 'voyagerMessagingDashMessagingTypeahead.7910815d686c938c4a34fd12381f168c',
      variables: `(keyword:${keyword},types:List(CONNECTIONS,COWORKERS))`,
    }

    const url = `${LinkedInURLs.API_BASE_GRAPHQL}?variables=${queryParams.variables}&&queryId=${queryParams.queryId}`

    const response = await this.fetch<SearchUserResult>({
      url,
      method: 'GET',
    })

    const foundUsers = (response?.included || [])
    return foundUsers.map(mapGraphQLSearchUser)
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
        accept: '*/*',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'no-cors',
      },
    })
    return data
  }

  sendMessage = async ({ threadID, message, options, currentUserId, sendMessageResolvers = new Map() }: {
    threadID: string
    message: MessageContent
    options: MessageSendOptions
    currentUserId: string
    sendMessageResolvers?: Map<string, SendMessageResolveFunction>
  }) => {
    const attachments = []

    if (message.mimeType) {
      const buffer = message.fileBuffer ?? await fs.readFile(message.filePath)
      const { data } = await this.uploadBuffer(buffer, message.fileName)

      attachments.push({
        file: {
          assetUrn: data.value.urn,
          byteSize: buffer.byteLength,
          mediaType: message.mimeType,
          name: message.fileName,
          url: `blob:https://www.linkedin.com/${randomUUID()}`,
        },
      })
    }

    const originToken = options.pendingMessageID

    const mentionedAttributes = (() => {
      if (!message.mentionedUserIDs?.length) return []

      const re = /@/gi
      const results = [...(message.text?.matchAll(re) || [])]

      return results.map(({ index: initialIndex }, index) => {
        const remainingText = message.text.slice(initialIndex)
        const endIndex = remainingText.indexOf(' ')
        const urn = `urn:li:fsd_profile:${message.mentionedUserIDs[index]}`

        return {
          length: endIndex >= 0 ? endIndex : remainingText.length,
          start: initialIndex,
          attributeKindUnion: {
            entity: {
              urn,
            },
          },
          type: {
            'com.linkedin.pemberly.text.Entity': {
              urn,
            },
          },
          attributeKind: {
            entity: {
              urn,
            },
          },
        }
      })
    })()

    const payload = {
      message: {
        body: {
          attributes: mentionedAttributes,
          text: message.text || '',
        },
        renderContentUnions: [
          ...attachments,
          ...(options.quotedMessageID
            ? (() => {
              const cachedMessage = this.messagesCache.get(options.quotedMessageID)
              if (!cachedMessage) return []

              return [{
                repliedMessageContent: {
                  originalSenderUrn: `urn:li:msg_messagingParticipant:urn:li:fsd_profile:${cachedMessage.senderID}`,
                  originalSendAt: cachedMessage.timestamp.getTime(),
                  originalMessageUrn: `urn:li:msg_message:(urn:li:fsd_profile:${cachedMessage.senderID},${cachedMessage.id})`,
                  messageBody: {
                    _type: 'com.linkedin.pemberly.text.AttributedText',
                    attributes: [],
                    text: cachedMessage.text,
                    _recipeType: 'com.linkedin.1ea7e24db829a1347b841f2dd496da36',
                  },
                },
              }]
            })()
            : []
          ),
        ],
        conversationUrn: `urn:li:msg_conversation:(urn:li:fsd_profile:${currentUserId},${threadID})`,
        originToken,
      },
      mailboxUrn: `urn:li:fsd_profile:${currentUserId}`,
      dedupeByClientGeneratedToken: false,
      trackingId: getTrackingId(),
    }

    const res = await this.fetch<SendMessageResponse>({
      url: LinkedInURLs.API_MESSAGES,
      method: 'POST',
      json: payload,
      searchParams: { action: 'createMessage' },
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        accept: 'application/json',
      },
    })

    // @notes
    //  Resolve from real-time response (using `sendMessageResolvers` map) OR if it isn't resolved
    //  yet (not response from real-time connection) it will resolve from the response from the
    //  send message request.
    return Promise.race([
      new Promise<Message[]>(resolve => {
        sendMessageResolvers.set(originToken, resolve)
      }),
      new Promise<Message[]>(resolve => {
        // TODO:
        // move partial mapper to mappers or adapt the response to use existing mapper function
        setTimeout(() => resolve([{
          _original: JSON.stringify(res.value),
          id: res.value.backendUrn,
          cursor: String(res.value.deliveredAt),
          timestamp: new Date(res.value.deliveredAt),
          text: res.value?.body.text,
          isSender: true,
          senderID: urnID(res.value.senderUrn),
          attachments: (res.value.renderContentUnions || [])?.map(attachment => mapFile(attachment.file as never)),
        }]), 5000)
      }),
    ])
  }

  deleteMessage = async (threadID: string, messageID: string) => {
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
    if (res?.data) throw Error(JSON.stringify(res.data))
  }

  getConversationById = async (conversationId: string, currentUserId: string): Promise<GraphQLConversation> => {
    const conversationUrn = `:li:msg_conversation:(urn:li:fsd_profile:${currentUserId},${conversationId})`

    const queryParams = {
      variables: `(messengerConversationsId:urn${encodeLinkedinUriComponent(conversationUrn)},count:20)`,
      queryId: GraphQLRecipes.conversations.getById,
    }
    const url = `${LinkedInURLs.API_MESSAGING_GRAPHQL}?queryId=${queryParams.queryId}&variables=${queryParams.variables}`

    const response = await this.fetch<ConversationByIdGraphQLResponse>({
      url,
      method: 'GET',
      headers: GraphQLHeaders,
    })

    return response.data.messengerConversationsById
  }

  createThread = async (profileIds: string[], message?: string, currentUserId?: string): Promise<Thread> => {
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

    const response = await this.fetch<NewConversationResponse>({
      url,
      method: 'POST',
      json: payload,
      searchParams: queryParams,
    })

    const conversationId = urnID(response.data.value.conversationUrn)
    const conversation = await this.getConversationById(conversationId, currentUserId)

    return mapGraphQLConversation(conversation, currentUserId)
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

  getUserPresence = async (participants: string[]): Promise<{ userID: string, status: 'OFFLINE' | 'ONLINE', lastActiveAt: number }[]> => {
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

  sendPresenceChange = async (type: ActivityType): Promise<void> => {
    const url = `${LinkedInURLs.HOME}psettings/presence/update-presence-settings`
    const form = new FormData()

    const value = type === ActivityType.ONLINE ? 'CONNECTIONS' : 'HIDDEN'
    const token = await this.getCSRFToken()

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
      register ? TRUE : FALSE,
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
          timezoneOffset,
          timezone,
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
