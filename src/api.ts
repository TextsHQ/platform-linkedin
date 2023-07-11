import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, MessageContent, PaginationArg, ActivityType, ReAuthError, CurrentUser, MessageSendOptions, ServerEventType, ServerEvent, NotificationsInfo, ThreadFolderName, LoginCreds, GetAssetOptions, ClientContext } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import LinkedInRealTime from './lib/real-time'
import LinkedInAPI from './lib/linkedin'

import { mapCurrentUser, ParticipantSeenMap, ThreadSeenMap } from './mappers'
import { LinkedInAuthCookieName } from './constants'
import MyNetwork, { MY_NETWORK_THREAD_ID } from './lib/my-network'

export type SendMessageResolveFunction = (value: Message[]) => void

export default class LinkedIn implements PlatformAPI {
  user: CurrentUser

  private realTimeApi: null | LinkedInRealTime = null

  sendMessageResolvers = new Map<string, SendMessageResolveFunction>()

  // threadID: participantID: [messageID, Date]
  threadSeenMap: ThreadSeenMap = new Map<string, ParticipantSeenMap>()

  onEvent: OnServerEventCallback

  readonly api = new LinkedInAPI()

  private myNetwork: MyNetwork

  constructor(readonly accountID: string) {}

  private afterAuth = async (cookies: CookieJar.Serialized) => {
    this.api.setLoginState(CookieJar.fromJSON(cookies as any))

    const currentUser = await this.api.getCurrentUser()
    if (!currentUser) throw new ReAuthError()
    this.user = mapCurrentUser(currentUser)
  }

  init = async (serialized: { cookies: CookieJar.Serialized }, _: ClientContext, preferences: Record<string, unknown> = {}) => {
    const { cookies } = serialized || {}
    if (!cookies) return
    if (preferences.showMyNetwork) {
      this.myNetwork = new MyNetwork(this)
    }
    await this.afterAuth(cookies)
  }

  login = async (creds: LoginCreds): Promise<LoginResult> => {
    const cookieJarJSON = 'cookieJarJSON' in creds && creds.cookieJarJSON
    if (!cookieJarJSON?.cookies?.some(({ key }) => key === LinkedInAuthCookieName)) return { type: 'error', errorMessage: 'No authentication cookie was found' }
    await this.afterAuth(cookieJarJSON)
    return { type: 'success' }
  }

  serializeSession = () => ({ cookies: this.api.cookieJar.toJSON() })

  logout = () => this.api.logout()

  getCurrentUser = () => this.user

  updateThreadSeenMap = (threadID: string, participantID: string, messageID: string, seenAt: string) => {
    if (!this.threadSeenMap.has(threadID)) this.threadSeenMap.set(threadID, new Map())

    const pmap = this.threadSeenMap.get(threadID)
    pmap.set(participantID, [messageID, new Date(Number(seenAt))])
  }

  upsertMyNetworkThread = async () => {
    if (!this.myNetwork) return
    const notificationsThread = await this.myNetwork.getThread()
    this.onEvent([{
      type: ServerEventType.STATE_SYNC,
      objectIDs: {},
      objectName: 'thread',
      mutationType: 'upsert',
      entries: [notificationsThread],
    }])
  }

  subscribeToEvents = async (onEvent: OnServerEventCallback) => {
    this.onEvent = onEvent

    this.realTimeApi = new LinkedInRealTime(this)
    this.realTimeApi.setup()

    this.upsertMyNetworkThread()
  }

  dispose = async () => this.realTimeApi?.dispose()

  reconnectRealtime = () => {
    this.realTimeApi?.checkLastHeartbeat()
  }

  searchUsers = async (typed: string) => {
    const users = await this.api.searchUsers(typed)
    return users
  }

  createThread = async (userIDs: string[], _: string, message: string): Promise<Thread> => {
    const res = await this.api.createThread(userIDs, message, this.user?.id)
    if (!res) return

    return res
  }

  getThreads = async (inboxName: ThreadFolderName, pagination?: PaginationArg): Promise<Paginated<Thread>> => {
    const { cursor } = pagination ?? {}

    const cursors = cursor ? JSON.parse(cursor) : [Date.now(), Date.now()]
    const response = await this.api.getThreads({
      cursors,
      inboxType: inboxName,
      currentUserID: this.user?.id,
      threadSeenMap: this.threadSeenMap,
    })

    const items = [...response.inbox.threads, ...response.archive.threads]

    return {
      items,
      hasMore: items.length > 0,
      oldestCursor: JSON.stringify([response.inbox.cursor, response.archive.cursor]),
    }
  }

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    if (threadID === MY_NETWORK_THREAD_ID) {
      const shouldRefresh = !pagination?.cursor
      const response = await this.myNetwork.getRequests(shouldRefresh)

      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: { threadID: MY_NETWORK_THREAD_ID },
        objectName: 'participant',
        mutationType: 'upsert',
        entries: [...response.participants],
      }])

      return {
        items: response.messages,
        hasMore: response.messages.length > 0,
      }
    }

    const { cursor } = pagination ?? {}
    const createdBefore = +cursor || Date.now()

    const { messages: items, prevCursor } = await this.api.getMessages({
      threadID,
      currentUserID: this.user?.id,
      createdBefore,
      threadParticipantsSeen: this.threadSeenMap,
    })

    return {
      items,
      hasMore: items.length > 0 || !!prevCursor,
    }
  }

  sendMessage = (threadID: string, content: MessageContent, options: MessageSendOptions) => {
    this.realTimeApi.checkLastHeartbeat()
    return this.api.sendMessage(threadID, content, options, this.sendMessageResolvers)
  }

  deleteMessage = async (threadID: string, messageID: string) => {
    if (threadID === MY_NETWORK_THREAD_ID) throw new Error('Delete message not supported')

    await this.api.deleteMessage(threadID, messageID)
  }

  editMessage = this.api.editMessage

  sendActivityIndicator = async (type: ActivityType, threadID: string) => {
    switch (type) {
      case ActivityType.TYPING:
        await this.api.sendTypingState(threadID)
        break
      case ActivityType.ONLINE:
      case ActivityType.OFFLINE:
        // await this.api.sendPresenceChange(type)
        break
      default:
        break
    }
  }

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    if (threadID === MY_NETWORK_THREAD_ID) throw new Error('Reactions not supported on My Network thread')

    await this.api.toggleReaction(reactionKey, messageID, threadID, true)
  }

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    if (threadID === MY_NETWORK_THREAD_ID) throw new Error('Reactions not supported on My Network thread')

    await this.api.toggleReaction(reactionKey, messageID, threadID, false)
  }

  sendReadReceipt = async (threadID: string) => {
    await this.api.markThreadRead(threadID)
  }

  markAsUnread = async (threadID: string) => {
    await this.api.markThreadRead(threadID, false)
  }

  deleteThread = async (threadID: string) => {
    if (threadID === MY_NETWORK_THREAD_ID) throw new Error('To remove the notifications thread: click Prefs → your LinkedIn account → Show My Network')

    await this.api.deleteThread(threadID)
  }

  archiveThread = async (threadID: string, archived: boolean) => {
    if (archived) await this.api.archiveThread(threadID)
    else await this.api.unArchiveThread(threadID)
  }

  getAsset = async (_: GetAssetOptions, type: string, uri: string) => {
    if (type !== 'proxy') return
    const url = Buffer.from(uri, 'hex').toString()
    return this.api.fetchStream({ url })
  }

  addParticipant = (threadID: string, participantID: string) => this.api.changeParticipants(threadID, participantID, 'add')

  removeParticipant = (threadID: string, participantID: string) => this.api.changeParticipants(threadID, participantID, 'remove')

  updateThread = async (threadID: string, updates: Partial<Thread>) => {
    if (updates.title) {
      if (threadID === MY_NETWORK_THREAD_ID) throw new Error('Cannot update My Network thread title')
      await this.api.renameThread(threadID, updates.title)
    }
    if ('mutedUntil' in updates) await this.api.sendMutePatch(threadID, updates.mutedUntil)
  }

  onThreadSelected = async (threadID: string): Promise<void> => {
    if (!threadID) return

    const getParticipantsPresence = async () => {
      const participants = this.api.conversationParticipantsMap[threadID]
      if (!participants) return []
      const participantsPresence = await this.api.getUserPresence(participants)
      if (!participantsPresence) return []

      return participantsPresence.map<ServerEvent>(presence => ({
        type: ServerEventType.USER_PRESENCE_UPDATED,
        presence: {
          userID: presence.userID,
          status: presence.status === 'ONLINE' ? 'online' : 'offline',
          lastActive: new Date(presence.lastActiveAt),
        },
      }))
    }

    const presenceEvents = await getParticipantsPresence()
    if (presenceEvents.length) this.onEvent(presenceEvents)
  }

  registerForPushNotifications = async (type: keyof NotificationsInfo, token: string) => {
    if (type !== 'android') throw Error('invalid type')
    await this.api.registerPush(token, true)
  }

  unregisterForPushNotifications = async (type: keyof NotificationsInfo, token: string) => {
    if (type !== 'android') throw Error('invalid type')
    await this.api.registerPush(token, false)
  }

  handleDeepLink = (link: string): void => {
    const [, , , , type, threadID, messageID, data] = link.split('/')

    if (type === 'callback') {
      if (threadID === MY_NETWORK_THREAD_ID) {
        this.myNetwork.handleInvitationClick(messageID as 'accept' | 'ignore', data)
      }
    }
  }
}
