// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, CurrentUser, InboxName, MessageContent, PaginationArg, LoginCreds, ServerEventType, User } from '@textshq/platform-sdk'

import { getCurrentUser } from './lib-v2/get-current-user'
import { login } from './lib-v2/login'
import { getThreads } from './lib-v2/get-threads'
import { getMessages } from './lib-v2/get-messages'
import { sendMessage } from './lib-v2/send-message'
import { createThread } from './lib-v2/create-thread'
import { searchUsers } from './lib-v2/search-users'
import { mapCurrentUser, mapMessage, mapMiniProfile, mapThreads } from './mappers'

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

  login = async (credentials: LoginCreds): Promise<LoginResult> => {
    try {
      const { username, password } = credentials
      const cookies = await login({ username, password })
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

  subscribeToEvents = async (onEvent: OnServerEventCallback) => {}

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

    const items = events
      .map((message: any) => mapMessage(message, currentUserId))
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

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {}

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {}

  deleteMessage = async (threadID: string, messageID: string) => true

  sendReadReceipt = async (threadID: string, messageID: string) => {}
}
