import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, InboxName, MessageContent, PaginationArg, ActivityType, ReAuthError, CurrentUser, MessageSendOptions, ServerEventType, ServerEvent, NotificationsInfo } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import LinkedInRealTime from './lib/real-time'
import LinkedInAPI from './lib/linkedin'

import { mapConversationParticipant, mapCurrentUser, mapMiniProfile, ParticipantSeenMap, ThreadSeenMap } from './mappers'
import { LinkedInAuthCookieName } from './constants'
import { extractSecondEntity } from './util'

export type SendMessageResolveFunction = (value: Message[]) => void

export default class LinkedIn implements PlatformAPI {
  user: CurrentUser

  private realTimeApi: null | LinkedInRealTime = null

  sendMessageResolvers = new Map<string, SendMessageResolveFunction>()

  // threadID: participantID: [messageID, Date]
  threadSeenMap: ThreadSeenMap = new Map<string, ParticipantSeenMap>()

  onEvent: OnServerEventCallback

  readonly api = new LinkedInAPI()

  private afterAuth = async (cookies: any) => {
    this.api.setLoginState(CookieJar.fromJSON(cookies))
    const currentUser = await this.api.getCurrentUser()
    if (!currentUser) throw new ReAuthError()
    this.user = mapCurrentUser(currentUser)
  }

  init = async (serialized: { cookies: any }) => {
    const { cookies } = serialized || {}
    if (!cookies) return

    await this.afterAuth(cookies)
  }

  login = async ({ cookieJarJSON }): Promise<LoginResult> => {
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

  subscribeToEvents = async (onEvent: OnServerEventCallback) => {
    this.onEvent = onEvent
    this.realTimeApi = new LinkedInRealTime(this)
    this.realTimeApi.setup()
  }

  dispose = async () => this.realTimeApi?.dispose()

  reconnectRealtime = () => {
    this.realTimeApi?.checkLastHeartbeat()
  }

  searchUsers = async (typed: string) => {
    const res = await this.api.searchUsers(typed)
    const users = res.map((miniProfile: any) => mapMiniProfile(miniProfile)).filter(Boolean)

    return users
  }

  createThread = async (userIDs: string[], _: string, message: string): Promise<Thread> => {
    const res = await this.api.createThread(userIDs, message, this.user?.id)
    if (!res) return

    return res
  }

  getThreads = async (inboxName: InboxName, pagination?: PaginationArg): Promise<Paginated<Thread>> => {
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
      hasMore: !!items.length || !!prevCursor,
    }
  }

  sendMessage = (threadID: string, content: MessageContent, options: MessageSendOptions) => {
    this.realTimeApi.checkLastHeartbeat()
    return this.api.sendMessage(threadID, content, options, this.sendMessageResolvers)
  }

  deleteMessage = (threadID: string, messageID: string) =>
    this.api.deleteMessage(threadID, messageID)

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
    await this.api.toggleReaction(reactionKey, messageID, threadID, true)
  }

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    await this.api.toggleReaction(reactionKey, messageID, threadID, false)
  }

  sendReadReceipt = async (threadID: string) => {
    await this.api.markThreadRead(threadID)
  }

  markAsUnread = async (threadID: string) => {
    await this.api.markThreadRead(threadID, false)
  }

  deleteThread = async (threadID: string) => this.api.deleteThread(threadID)

  archiveThread = async (threadID: string, archived: boolean) => {
    await this.api.toggleArchiveThread(threadID, archived)
  }

  getAsset = async (_, type: string, uri: string) => {
    if (type !== 'proxy') return
    const url = Buffer.from(uri, 'hex').toString()
    return this.api.fetchStream({ url })
  }

  addParticipant = (threadID: string, participantID: string) => this.api.changeParticipants(threadID, participantID, 'add')

  removeParticipant = (threadID: string, participantID: string) => this.api.changeParticipants(threadID, participantID, 'remove')

  updateThread = async (threadID: string, updates: Partial<Thread>) => {
    if (updates.title) await this.api.renameThread(threadID, updates.title)
    if ('mutedUntil' in updates) await this.api.sendMutePatch(threadID, updates.mutedUntil)
  }

  onThreadSelected = async (threadID: string): Promise<void> => {
    if (!threadID) return

    const updateParticipantsPresence = async () => {
      const participantsPresence = await this.api.getUserPresence(threadID)
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

    const updateSeenMap = async () => {
      const seenReceipts = await this.api.getSeenReceipts({ threadID, currentUserID: this.user?.id })
      if (!seenReceipts) return []

      return seenReceipts.map<ServerEvent>(seenReceipt => {
        const participant = mapConversationParticipant(seenReceipt.seenByParticipant)
        const messageUrn = extractSecondEntity(seenReceipt.message.entityUrn)
        const messageID = `urn:li:messagingMessage:${messageUrn}`

        this.updateThreadSeenMap(threadID, participant.id, messageID, String(seenReceipt.seenAt))

        return {
          type: ServerEventType.STATE_SYNC,
          mutationType: 'upsert',
          objectName: 'message_seen',
          objectIDs: { threadID, messageID },
          entries: [{ [participant.id]: new Date(seenReceipt.seenAt) }],
        }
      })
    }

    const [seenReceiptEvents, presenceEvents] = await Promise.all([
      updateSeenMap(),
      updateParticipantsPresence(),
    ])

    this.onEvent([...presenceEvents, ...seenReceiptEvents])
  }

  registerForPushNotifications = async (type: keyof NotificationsInfo, token: string) => {
    if (type !== 'android') throw Error('invalid type')
    await this.api.registerPush(token, true)
  }

  unregisterForPushNotifications = async (type: keyof NotificationsInfo, token: string) => {
    if (type !== 'android') throw Error('invalid type')
    await this.api.registerPush(token, false)
  }
}
