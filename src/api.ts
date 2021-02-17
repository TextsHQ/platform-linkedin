// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, InboxName, MessageContent, PaginationArg, User, ActivityType, ReAuthError } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'
import { uniqBy } from 'lodash'

import { mapCurrentUser, mapMessage, mapMiniProfile, mapReactionEmoji, mapThreads } from './mappers'
import LinkedInAPI from './lib/linkedin'
import LinkedInRealTime from './lib/real-time'

export default class LinkedIn implements PlatformAPI {
  private eventTimeout?: NodeJS.Timeout

  private currentUser = null

  private threads: Thread[] = []

  private cookies: any

  private searchedUsers: User[]

  private realTimeApi: null | LinkedInRealTime = null

  readonly api = new LinkedInAPI()

  init = async (serialized: { cookies: any }) => {
    const { cookies } = serialized || {}
    if (!cookies) return

    await this.api.setLoginState(CookieJar.fromJSON(cookies))
    const currentUser = await this.api.getCurrentUser()

    this.currentUser = currentUser
    if (!this.currentUser) throw new ReAuthError()
  }

  login = async ({ cookieJarJSON }): Promise<LoginResult> => {
    try {
      await this.api.setLoginState(CookieJar.fromJSON(cookieJarJSON))

      this.currentUser = await this.api.getCurrentUser()
      this.cookies = cookieJarJSON

      return { type: 'success' }
    } catch (error) {
      return { type: 'error' }
    }
  }

  serializeSession = () => ({ cookies: this.cookies })

  logout = () => { }

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  subscribeToEvents = async (onEvent: OnServerEventCallback) => {
    this.realTimeApi = new LinkedInRealTime(this.api, onEvent)
    this.realTimeApi.subscribeToEvents()
  }

  dispose = async () => {
    if (this.eventTimeout) clearInterval(this.eventTimeout)
  }

  searchUsers = async (typed: string) => {
    const res = await this.api.searchUsers(typed)
    const users = res.map((miniProfile: any) => mapMiniProfile(miniProfile))
    this.searchedUsers = [...users]

    return users
  }

  createThread = async (userIDs: string[]): Promise<Thread> => {
    const res = await this.api.createThread(userIDs)
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
    const { cursor } = pagination ?? {}
    const createdBefore = cursor ? new Date(cursor).getTime() : new Date().getTime()

    const items = await this.api.getThreads(createdBefore)
    const parsedItems = mapThreads(items)

    const previousLastThreadId = [...this.threads].pop()?.id
    this.threads = uniqBy([...this.threads, ...parsedItems], 'id')

    const latestThread = [...this.threads].pop()
    const hasMore = !pagination || previousLastThreadId !== [...parsedItems]?.pop()?.id
    const oldestCursor = latestThread?.timestamp.toString()

    return {
      items: parsedItems,
      hasMore,
      oldestCursor,
    }
  }

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    const { cursor } = pagination ?? {}

    const thread = this.threads.find(({ id }) => id === threadID)
    const cursorTimestamp = cursor && [...thread.messages?.items].find(({ id }) => id === cursor).timestamp
    const createdBefore = cursorTimestamp ? new Date(cursorTimestamp).getTime() : new Date().getTime()

    const linkedInItems = await this.api.getMessages(threadID, createdBefore)
    const { events } = linkedInItems

    const currentUserId = mapCurrentUser(this.currentUser).id
    const { participants } = this.threads.find(({ id: threadId }) => threadID === threadId)

    const items: Message[] = events
      .map((message: any) => mapMessage(message, currentUserId, participants.items))
      .sort((a: any, b: any) => a.timestamp - b.timestamp)

    const latestThreadMessage = [...thread.messages?.items]?.pop()
    thread.messages.items = uniqBy([...thread.messages.items, ...items], 'id')

    const hasMore = !pagination || latestThreadMessage?.id !== [...items].pop()?.id
    const oldestCursor = [...items].pop()?.id

    return {
      items,
      hasMore,
      oldestCursor,
    }
  }

  sendMessage = async (threadID: string, content: MessageContent): Promise<boolean | Message[]> => {
    await this.api.sendMessage(content, threadID)
    return true
  }

  sendActivityIndicator = async (type: ActivityType, threadID: string) => {
    if (type === ActivityType.TYPING) await this.api.toggleTypingState(threadID)
  }

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    const { render: emojiRender } = mapReactionEmoji(reactionKey)
    await this.api.toggleReaction(emojiRender, messageID, threadID)
  }

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    const { render: emojiRender } = mapReactionEmoji(reactionKey)
    await this.api.toggleReaction(emojiRender, messageID, threadID)
  }

  sendReadReceipt = async (threadID: string, messageID: string) => {
    await this.api.markThreadAsRead(threadID)
  }
}
