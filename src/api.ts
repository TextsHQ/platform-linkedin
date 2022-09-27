import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, InboxName, MessageContent, PaginationArg, User, ActivityType, ReAuthError, CurrentUser, MessageSendOptions, ServerEventType, ServerEvent, GetAssetOptions, AssetInfo, NotificationsInfo } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import { groupEntities, mapCurrentUser, mapMessage, mapMiniProfile, mapThreads, ParticipantSeenMap, ThreadSeenMap } from './mappers'
import LinkedInAPI from './lib/linkedin'
import LinkedInRealTime from './lib/real-time'
import { LinkedInAuthCookieName } from './constants'
import { eventUrnToMessageID, urnID } from './util'

export type SendMessageResolveFunction = (value: Message[]) => void

export default class LinkedIn implements PlatformAPI {
  private currentUser = null

  user: CurrentUser

  private cookies: any

  private searchedUsers: User[]

  private realTimeApi: null | LinkedInRealTime = null

  sendMessageResolvers = new Map<string, SendMessageResolveFunction>()

  // threadID: participantID: [messageID, Date]
  threadSeenMap: ThreadSeenMap = new Map<string, ParticipantSeenMap>()

  onEvent: OnServerEventCallback

  readonly api = new LinkedInAPI()

  init = async (serialized: { cookies: any }) => {
    const { cookies } = serialized || {}
    if (!cookies) return
    this.cookies = cookies

    await this.api.setLoginState(CookieJar.fromJSON(cookies))

    this.currentUser = await this.api.getCurrentUser()
    if (!this.currentUser) throw new ReAuthError()

    this.user = mapCurrentUser(this.currentUser)
  }

  login = async ({ cookieJarJSON }): Promise<LoginResult> => {
    if (!cookieJarJSON?.cookies?.some(({ key }) => key === LinkedInAuthCookieName)) return { type: 'error', errorMessage: 'No authentication cookie was found' }

    await this.api.setLoginState(CookieJar.fromJSON(cookieJarJSON))

    this.currentUser = await this.api.getCurrentUser()
    this.user = mapCurrentUser(this.currentUser)
    this.cookies = cookieJarJSON

    return { type: 'success' }
  }

  serializeSession = () => ({ cookies: this.cookies })

  logout = () => this.api.logout()

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  updateThreadSeenMap = (threadID: string, participantID: string, messageID: string, seenAt: string) => {
    if (!this.threadSeenMap.has(threadID)) this.threadSeenMap.set(threadID, new Map())
    const pmap = this.threadSeenMap.get(threadID)
    pmap.set(participantID, [messageID, new Date(seenAt)])
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
    this.searchedUsers = [...users]
    return users
  }

  createThread = async (userIDs: string[], _: string, message: string): Promise<Thread> => {
    const res = await this.api.createThread(userIDs, message)
    if (!res) return

    const { createdAt, conversationUrn } = res
    const id = urnID(conversationUrn)
    // TODO: don't rely on searchedUsers
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

    const cursors = cursor ? JSON.parse(cursor) : [Date.now(), Date.now()]
    const [inbox, archive] = await this.api.getThreads(cursors, inboxName)

    const groupedInbox = groupEntities(inbox)
    const groupedArchive = groupEntities(archive)

    const updateMap = (conversation: any) => {
      for (const receipt of conversation.receipts) {
        const threadID = urnID(conversation.entityUrn)
        const participantID = urnID(receipt.fromEntity)
        this.updateThreadSeenMap(threadID, participantID, eventUrnToMessageID(receipt.seenReceipt.eventUrn), receipt.seenReceipt.seenAt)
      }
    }
    for (const { conversation } of groupedInbox.conversations) updateMap(conversation)
    for (const { conversation } of groupedArchive.conversations) updateMap(conversation)

    const inboxThreads = mapThreads(groupedInbox.conversations, groupedInbox.allProfiles, this.user.id, this.threadSeenMap)
    const archiveThreads = mapThreads(groupedArchive.conversations, groupedArchive.allProfiles, this.user.id, this.threadSeenMap)
    const mapped = [...inboxThreads, ...archiveThreads]
    for (const thread of mapped) {
      this.api.conversationsParticipants[thread.id] = thread.participants.items.map(p => p.id)
    }

    return {
      items: mapped,
      hasMore: mapped.length > 0,
      oldestCursor: JSON.stringify([inboxThreads[inboxThreads.length - 1]?.timestamp.getTime(), archiveThreads[archiveThreads.length - 1]?.timestamp.getTime()]),
    }
  }

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    const { cursor } = pagination ?? {}
    const createdBefore = +cursor || Date.now()

    const messages = await this.api.getMessages(threadID, createdBefore)
    const currentUserId = this.user.id

    const items = (messages.events as any[])
      .map<Message>(message => mapMessage(message, currentUserId, this.threadSeenMap.get(threadID)))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    return {
      items,
      hasMore: items.length > 0,
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
    }
  }

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    await this.api.toggleReaction(reactionKey, messageID, threadID, true)
  }

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    await this.api.toggleReaction(reactionKey, messageID, threadID, false)
  }

  sendReadReceipt = async (threadID: string, messageID: string) => {
    await this.api.markThreadRead(threadID)
  }

  markAsUnread = async (threadID: string) => {
    await this.api.markThreadRead(threadID, false)
  }

  deleteThread = async (threadID: string) => this.api.deleteThread(threadID)

  archiveThread = async (threadID: string, archived: boolean) => {
    await this.api.toggleArchiveThread(threadID, archived)
  }

  getAsset = async (opts: GetAssetOptions, type: string, urlHex: string) => {
    if (type !== 'proxy') return
    const url = Buffer.from(urlHex, 'hex').toString()
    const headers = opts?.range ? { Range: opts.range ? `bytes=${opts.range.start ?? ''}-${opts.range.end ?? ''}` : undefined } : {}
    return this.api.fetchStream({ url, headers })
  }

  getAssetInfo = async (opts: GetAssetOptions, type: string, urlHex: string): Promise<AssetInfo> => {
    if (type !== 'proxy') return
    const url = Buffer.from(urlHex, 'hex').toString()
    const headers = { Range: 'bytes=0-1' }
    const res = await this.api.fetchRaw(url, { method: 'GET', headers })
    console.log(opts, url, res.headers, +res.headers['content-range'].split('/', 2).pop())
    return {
      contentLength: +res.headers['content-range'].split('/', 2).pop(),
      contentType: res.headers['content-type'],
    }
  }

  addParticipant = (threadID: string, participantID: string) => this.api.changeParticipants(threadID, participantID, 'add')

  removeParticipant = (threadID: string, participantID: string) => this.api.changeParticipants(threadID, participantID, 'remove')

  updateThread = async (threadID: string, updates: Partial<Thread>) => {
    if (updates.title) await this.api.renameThread(threadID, updates.title)
    if ('mutedUntil' in updates) await this.api.sendMutePatch(threadID, updates.mutedUntil)
  }

  onThreadSelected = async (threadID: string) => {
    if (!threadID) return
    const participantsPresence = await this.api.getUserPresence(threadID)
    if (!participantsPresence) return
    const presenceEvents = participantsPresence.map<ServerEvent>(presence => ({
      type: ServerEventType.USER_PRESENCE_UPDATED,
      presence: {
        userID: presence.userID,
        status: presence.status === 'ONLINE' ? 'online' : 'offline',
        lastActive: new Date(presence.lastActiveAt),
      },
    }))
    this.onEvent(presenceEvents)
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
