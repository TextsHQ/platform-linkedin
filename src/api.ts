// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, CurrentUser, InboxName, MessageContent, PaginationArg, LoginCreds, ServerEventType, User } from '@textshq/platform-sdk'
import EventSource from 'eventsource'

import { mapCurrentUser, mapMessage, mapMiniProfile, mapReactionEmoji, mapThreads } from './mappers'
import { getCurrentUser } from './lib-v2/get-current-user'
import { getThreads } from './lib-v2/get-threads'
import { getMessages } from './lib-v2/get-messages'
import { sendMessage } from './lib-v2/send-message'
import { createThread } from './lib-v2/create-thread'
import { searchUsers } from './lib-v2/search-users'
import { toggleReaction } from './lib-v2/toggle-reaction'
import { markMessageAsRead } from './lib-v2/mark-message-as-read'
import { createRequestHeaders } from './lib-v2/utils/headers'

export default class LinkedInAPI implements PlatformAPI {
  private eventTimeout?: NodeJS.Timeout

  private session: string | null = null

  private currentUser = null

  private threads: Thread[] = []

  private cookies: any

  private searchedUsers: User[]

  init = async (serialized: { session: string; user: CurrentUser, cookies: any }) => {
    const { session, user, cookies } = serialized || {}

    if (session) this.session = session
    if (user) this.currentUser = user
    if (cookies) this.cookies = cookies
  }

  login = async ({ cookieJarJSON }): Promise<LoginResult> => {
    try {
      const cookies = cookieJarJSON.cookies.reduce((prev, current) => ({
        ...prev,
        [current.key]: current.value.replace(/"/g, ''),
      }), {})

      const currentUser = await getCurrentUser(cookies)

      this.cookies = cookies
      this.currentUser = currentUser

      return { type: 'success' }
    } catch (error) {
      return { type: 'error' }
    }
  }

  serializeSession = () => ({
    session: this.session,
    user: this.currentUser,
    cookies: this.cookies,
  })

  logout = () => { }

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  subscribeToEvents = async (onEvent: OnServerEventCallback) => {
    const headers = createRequestHeaders(this.cookies)
    const url = 'https://realtime.www.linkedin.com/realtime/connect'

    const eventSource = new EventSource(url, { headers })
    eventSource.onmessage = event => {
      if (!event.data.startsWith('{')) return

      const json = JSON.parse(event.data)
      const newMessageEventType = 'com.linkedin.realtimefrontend.DecoratedEvent'

      if (json[newMessageEventType]?.payload) {
        const { payload, topic = '' } = json[newMessageEventType]
        const threadsIDs = []

        if (payload?.previousEventInConversationUrn) {
          // "previousEventInConversationUrn": "urn:li:fs_event:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,2-MTYxMjk5MzkyMzQxMWI0ODMyNy0wMDMmZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==)"
          const { previousEventInConversationUrn } = payload
          const threadID = previousEventInConversationUrn.split(':(').pop().split(',')[0]
          threadsIDs.push({ id: threadID })
        } else if (payload?.event) {
          const { entityUrn = '' } = payload.event
          const threadID = entityUrn.split(':(').pop().split(',')[0]
          threadsIDs.push({ id: threadID })
        } else if (topic === 'urn:li-realtime:messageReactionSummariesTopic:urn:li-realtime:myself') {
          const { eventUrn = '' } = payload

          const threadID = eventUrn.split(':(').pop().split(',')[0]
          threadsIDs.push({ id: threadID })
        } else if (topic === 'urn:li-realtime:conversationsTopic:urn:li-realtime:myself') {
          const { entityUrn = '', conversation } = payload
          const threadID = entityUrn.split(':').pop()

          onEvent([{
            type: ServerEventType.STATE_SYNC,
            mutationType: 'update',
            objectName: 'thread',
            objectIDs: { threadID },
            entries: [
              {
                id: threadID,
                isUnread: !conversation.read,
              },
            ],
          }])
        }

        for (const { id: threadID } of threadsIDs) onEvent([{ type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID }])
      }
    }
  }

  dispose = async () => {
    if (this.eventTimeout) clearInterval(this.eventTimeout)
  }

  searchUsers = async (typed: string) => {
    const res = await searchUsers(this.cookies, typed)
    const users = res.map((miniProfile: any) => mapMiniProfile(miniProfile))
    this.searchedUsers = [...users]

    return users
  }

  createThread = async (userIDs: string[]): Promise<Thread> => {
    const res = await createThread(this.cookies, '', userIDs)
    const { createdAt, conversationUrn } = res
    // conversationUrn: "urn:li:fs_conversation:2-YmU3NDYwNzctNTU0ZS00NjdhLTg3ZDktMjkwOTE5NDAxNGQ4XzAxMw=="
    const id = conversationUrn.split(':').pop()
    const participants = userIDs.map(userId => this.searchedUsers.find(({ id: searchedUserId }) => searchedUserId === userId))
    const title = participants.map(participant => participant.fullName).join(', ')

    return {
      id,
      title,
      type: userIDs.length > 1 ? 'group' : 'single',
      participants: { items: participants, hasMore: false },
      messages: { items: [], hasMore: false },
      timestamp: new Date(createdAt),
      isUnread: false,
      isReadOnly: false,
    }
  }

  getThreads = async (inboxName: InboxName, pagination?: PaginationArg): Promise<Paginated<Thread>> => {
    const items = await getThreads(this.cookies)
    const parsedItems = mapThreads(items)
    this.threads = [...this.threads, ...parsedItems]

    return {
      items: parsedItems,
      hasMore: false,
      oldestCursor: '0',
    }
  }

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    const linkedInItems = await getMessages(this.cookies, threadID)
    const { events } = linkedInItems

    const currentUserId = mapCurrentUser(this.currentUser).id
    const { participants } = this.threads.find(({ id: threadId }) => threadID === threadId)

    const items = events
      .map((message: any) => mapMessage(message, currentUserId, participants.items))
      .sort((a: any, b: any) => a.timestamp - b.timestamp)

    return {
      items,
      hasMore: false,
    }
  }

  sendMessage = async (threadID: string, content: MessageContent): Promise<boolean | Message[]> => {
    try {
      await sendMessage(this.cookies, content.text, threadID)
      return true
    } catch (error) {
      throw new Error(error.message)
    }
  }

  sendActivityIndicator = (threadID: string) => {
    console.log(threadID, this.threads)
  }

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    const { render: emojiRender } = mapReactionEmoji(reactionKey)
    await toggleReaction(this.cookies, emojiRender, messageID, threadID)
  }

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {}

  deleteMessage = async (threadID: string, messageID: string) => true

  sendReadReceipt = async (threadID: string, messageID: string) => {
    await markMessageAsRead(this.cookies, threadID)
  }
}
