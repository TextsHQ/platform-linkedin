// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, CurrentUser, InboxName, ServerEventType, MessageContent, PaginationArg, LoginCreds } from '@textshq/platform-sdk'
import { mapMessage, mapThreads } from './mappers'
import { getSessionCookie } from './public/get-session-cookie'
import { getThreadMessages } from './public/get-thread-messages'
import { getMessagesThreads } from './public/get-threads'
import { sendMessageToThread } from './public/send-message-to-thread'

export default class RandomAPI implements PlatformAPI {
  private eventTimeout?: NodeJS.Timeout

  private session: string | null = null

  private threads: Thread[]

  login = async (credentials: LoginCreds): Promise<LoginResult> => {
    try {
      const { username, password } = credentials
      const session = await getSessionCookie({ username, password })
      this.session = session

      return { type: 'success' }
    } catch (error) {
      return { type: 'error' }
    }
  }

  logout = () => { }

  getCurrentUser = (): CurrentUser => ({
    id: '1111',
    fullName: 'Foo',
    displayText: '@foo',
  })

  subscribeToEvents = (onEvent: OnServerEventCallback) => {}

  dispose = () => {
    if (this.eventTimeout) clearInterval(this.eventTimeout)
  }

  serializeSession = () => this.session

  init = (session: string) => {
    this.session = session
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
      const currentUserId = entities[0].entityUrn.split(':').pop()

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
