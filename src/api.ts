// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, CurrentUser, InboxName, MessageContent, PaginationArg, LoginCreds, ServerEventType } from '@textshq/platform-sdk'
import { closeBrowser, openBrowser } from './lib'
import { FEED_URL, LINKEDIN_CONVERSATIONS_ENDPOINT, THREADS_URL } from './lib/constants/linkedin'
import { LinkedIn } from './lib/types/linkedin.types'
import { mapCurrentUser, mapMessage, mapThreads } from './mappers'
import { getSessionCookie } from './public/get-session-cookie'
import { getThreadMessages } from './public/get-thread-messages'
import { getThreads } from './public/get-threads'
import { sendMessageToThread } from './public/send-message-to-thread'

export default class LinkedInAPI implements PlatformAPI {
  private eventTimeout?: NodeJS.Timeout

  private session: string | null = null

  private currentUser = null

  private threads: Thread[]

  private browser: LinkedIn<any>

  private realtimeRequest: any

  private cookies: any

  init = async (serialized: { session: string; user: CurrentUser }) => {
    const { session, user } = serialized || {}

    if (session) {
      this.session = session
      this.browser = await openBrowser()
      await this.browser.currentPage.setSessionCookie(this.browser, session)

      const { realtimeRequest, cookies } = await this.browser.currentPage.getRealTimeRequestAndCookies(this.browser)
      this.cookies = cookies
      this.realtimeRequest = realtimeRequest
    }

    if (user) this.currentUser = user
  }

  login = async (credentials: LoginCreds): Promise<LoginResult> => {
    try {
      const { username, password } = credentials
      const { session, currentUser } = await getSessionCookie({ username, password })

      this.session = session
      this.currentUser = currentUser

      this.browser = await openBrowser()
      await this.browser.currentPage.setSessionCookie(this.browser, session)

      const { realtimeRequest, cookies } = await this.browser.currentPage.getRealTimeRequestAndCookies(this.browser)
      this.cookies = cookies
      this.realtimeRequest = realtimeRequest

      return { type: 'success' }
    } catch (error) {
      return { type: 'error' }
    }
  }

  serializeSession = () => ({ session: this.session, user: this.currentUser })

  logout = () => { }

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  subscribeToEvents = async (onEvent: OnServerEventCallback) => {
    const page = await this.browser.browser.newPage()
    await page.goto(FEED_URL)
    await page.setRequestInterception(true)

    page.on('request', request => { request.continue() })
    page.on('response', response => {
      const responseUrl = response.url()
      const itShouldIntercept = responseUrl.includes(LINKEDIN_CONVERSATIONS_ENDPOINT) && responseUrl.includes('events')

      if (itShouldIntercept) {
        const params = responseUrl.split(`${LINKEDIN_CONVERSATIONS_ENDPOINT}/`).pop()
        const threadID = params.split('/')[0].replace(/%3D/g, '=')

        if (threadID) onEvent([{ type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID }])
      }
    })
  }

  dispose = async () => {
    if (this.eventTimeout) clearInterval(this.eventTimeout)
    if (this.browser) await closeBrowser(this.browser)
  }

  searchUsers = async (typed: string) => []

  createThread = (userIDs: string[]) => console.log({ userIDs }) as any

  getThreads = async (inboxName: InboxName, pagination?: PaginationArg): Promise<Paginated<Thread>> => {
    const items = await getThreads(this.realtimeRequest, this.cookies)
    const parsedItems = mapThreads(items)

    return {
      items: parsedItems,
      hasMore: false,
      oldestCursor: '0',
    }
  }

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    const linkedInItems = await getThreadMessages({ request: this.realtimeRequest, cookies: this.cookies }, threadID)
    const { entities, events } = linkedInItems

    // const currentUserId = currentUserEntity.entityUrn.split(':').pop()
    console.log(this.currentUser)

    const items = events
      .map((message: any) => mapMessage(message, ''))
      .sort((a, b) => a.timestamp - b.timestamp)

    return {
      items,
      hasMore: false,
    }
  }

  sendMessage = async (threadID: string, content: MessageContent): Promise<boolean | Message[]> => {
    try {
      await sendMessageToThread({ request: this.realtimeRequest, cookies: this.cookies }, threadID, content.text)
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
