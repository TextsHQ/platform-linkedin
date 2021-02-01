// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, CurrentUser, InboxName, MessageContent, PaginationArg, LoginCreds } from '@textshq/platform-sdk'
import { mapCurrentUser, mapMessage, mapThreads } from './mappers'
import { getSessionCookie } from './public/get-session-cookie'
import { getThreadMessages } from './public/get-thread-messages'
import { getMessagesThreads } from './public/get-threads'
import { sendMessageToThread } from './public/send-message-to-thread'

export default class RandomAPI implements PlatformAPI {
  private eventTimeout?: NodeJS.Timeout

  private session: string | null = null

  private currentUser: CurrentUser | null = null

  private threads: Thread[]

  login = async (credentials: LoginCreds): Promise<LoginResult> => {
    try {
      const { username, password } = credentials
      const { session, currentUser } = await getSessionCookie({ username, password })

      this.session = session
      this.currentUser = mapCurrentUser(currentUser)

      return { type: 'success' }
    } catch (error) {
      return { type: 'error' }
    }
  }

  logout = () => { }

  getCurrentUser = (): CurrentUser => this.currentUser

  subscribeToEvents = (onEvent: OnServerEventCallback) => {}

  dispose = () => {
    if (this.eventTimeout) clearInterval(this.eventTimeout)
  }

  serializeSession = () => ({ session: this.session, user: this.currentUser })

  init = (serialized: { session: string; user: CurrentUser }) => {
    if (serialized?.session) this.session = serialized.session
    if (serialized?.user) this.currentUser = serialized.user
  }

  searchUsers = async (typed: string) => []

  createThread = (userIDs: string[]) => null as any

  getThreads = async (inboxName: InboxName, pagination?: PaginationArg): Promise<Paginated<Thread>> => {
    try {
      const items = await getMessagesThreads(this.session)
      const parsedItems = mapThreads(items)

      return {
        items: parsedItems,
        hasMore: false,
        oldestCursor: '0',
      }
    } catch (error) {
      return {
        items: [],
        hasMore: false,
      }
    }
  }

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    try {
      const linkedInItems = await getThreadMessages(this.session, threadID)
      const { entities, events } = linkedInItems

      const currentUserEntity = entities.find(({ firstName, lastName }) => {
        const name = `${firstName} ${lastName}`
        return this.currentUser.username === name
      })
      const currentUserId = currentUserEntity.entityUrn.split(':').pop()

      const items = events
        .map((message: any) => mapMessage(message, currentUserId))
        .filter((message: Message) => message.senderID === threadID)
        .sort((a, b) => a.timestamp - b.timestamp)

      return {
        items,
        hasMore: false,
      }
    } catch (error) {
      return {
        items: [],
        hasMore: false,
      }
    }
  }

  sendMessage = async (threadID: string, content: MessageContent): Promise<boolean | Message[]> => {
    try {
      await sendMessageToThread(this.session, threadID, content.text)
      return true
    } catch (error) {
      throw new Error(error.message)
    }
  }

  sendActivityIndicator = (threadID: string) => {}

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {}

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {}

  deleteMessage = async (threadID: string, messageID: string) => true

  sendReadReceipt = async (threadID: string, messageID: string) => {}
}
