// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, CurrentUser, InboxName, ServerEventType, MessageContent, PaginationArg } from '@textshq/platform-sdk'
import { getSessionCookie } from './public/get-session-cookie'
import { getThreadMessages } from './public/get-thread-messages'
import { getMessagesThreads } from './public/get-threads'
import { sendMessageToThread } from './public/send-message-to-thread'

export default class RandomAPI implements PlatformAPI {
  private eventTimeout?: NodeJS.Timeout

  private session: string | null = null

  private threads: Thread[]

  login = async (): Promise<LoginResult> => {
    try {
      await getSessionCookie()
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

  serializeSession = () => { }

  init = () => {}

  searchUsers = async (typed: string) => []

  createThread = (userIDs: string[]) => null as any

  getThreads = async (inboxName: InboxName, pagination?: PaginationArg): Promise<Paginated<Thread>> => {
    const items = await getMessagesThreads(this.session)

    return {
      items,
      hasMore: items.length >= 25,
      oldestCursor: 0,
    }
  }

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    const items = await getThreadMessages(this.session, threadID)

    return {
      items,
      hasMore: false,
    }
  }

  sendMessage = async (threadID: string, content: MessageContent) => {
    await sendMessageToThread(this.session, threadID, content)
  }

  sendActivityIndicator = (threadID: string) => {}

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {}

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {}

  deleteMessage = async (threadID: string, messageID: string) => true

  sendReadReceipt = async (threadID: string, messageID: string) => {}
}
