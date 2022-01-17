// eslint-disable-next-line import/no-extraneous-dependencies
import { PlatformAPI, OnServerEventCallback, LoginResult, Paginated, Thread, Message, InboxName, MessageContent, PaginationArg, User, ActivityType, ReAuthError, CurrentUser, MessageSendOptions, ServerEventType, ServerEvent } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import { mapCurrentUser, mapMessage, mapMessageSeenState, mapMiniProfile, mapParticipantAction, mapThreads } from './mappers'
import LinkedInAPI from './lib/linkedin'
import LinkedInRealTime from './lib/real-time'
import { LinkedInAuthCookieName } from './constants'
import { urnID } from './util'

export type SendMessageResolveFunction = (value: Message[]) => void

export default class LinkedIn implements PlatformAPI {
  private currentUser = null

  user: CurrentUser

  private cookies: any

  private searchedUsers: User[]

  private realTimeApi: null | LinkedInRealTime = null

  sendMessageResolvers = new Map<string, SendMessageResolveFunction>()

  // TODO: implement something with Texts-sdk
  private seenReceipt = {}

  onEvent: OnServerEventCallback

  readonly api = new LinkedInAPI()

  init = async (serialized: { cookies: any }) => {
    const { cookies } = serialized || {}
    if (!cookies) return
    this.cookies = cookies

    await this.api.setLoginState(CookieJar.fromJSON(cookies))

    this.currentUser = await this.api.getCurrentUser()
    this.user = mapCurrentUser(this.currentUser)

    if (!this.currentUser) throw new ReAuthError()
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

  updateSeenReceipt = (key: string, value: any) => {
    this.seenReceipt[key] = value
  }

  subscribeToEvents = async (onEvent: OnServerEventCallback) => {
    this.realTimeApi = new LinkedInRealTime(this, onEvent)
    this.realTimeApi.setup()

    this.onEvent = onEvent
  }

  dispose = async () => this.realTimeApi?.dispose()

  onResumeFromSleep = async () => {
    setTimeout(async () => {
      await this.realTimeApi?.dispose()
      await this.realTimeApi.setup()
    }, 1000)
  }

  searchUsers = async (typed: string) => {
    const res = await this.api.searchUsers(typed)
    const users = res.map((miniProfile: any) => mapMiniProfile(miniProfile)).filter(Boolean)
    this.searchedUsers = [...users]
    return users
  }

  createThread = async (userIDs: string[]): Promise<Thread> => {
    const res = await this.api.createThread(userIDs)
    if (!res) return

    const { createdAt, conversationUrn } = res
    const id = urnID(conversationUrn)
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
    const createdBefore = +cursor || Date.now()

    const items = await this.api.getThreads(createdBefore, inboxName)

    // TODO: refactor
    for (const item of items) {
      for (const event of (item?.liMessages || [])) {
        if (event?.subtype === 'PARTICIPANT_CHANGE') {
          const [removedParticipants, addedParticipants, fromProfile] = await Promise.all([
            this.mapParticipants(event, '*removedParticipants'),
            this.mapParticipants(event, '*addedParticipants'),
            this.api.getProfile(mapParticipantAction(event['*from'])),
          ])
          event.eventContent.removedParticipants = removedParticipants
          event.eventContent.addedParticipants = addedParticipants
          event.fromProfile = fromProfile
        }
      }
    }

    const mapped = mapThreads(items, this.user.id, this.api.participantEntities)

    for (const thread of mapped) {
      for (const message of thread.messages.items) {
        this.seenReceipt[message.id] = message.seen
      }
    }

    return {
      items: mapped,
      hasMore: mapped.length > 0,
      oldestCursor: mapped[mapped.length - 1]?.timestamp.getTime().toString(),
    }
  }

  mapParticipants = async (event: any, key: string) =>
    (await Promise.all((event?.eventContent[key] || [])
      ?.map(mapParticipantAction)
      ?.map(this.api.getProfile)))
      ?.map(({ firstName }) => firstName) || []

  getMessages = async (threadID: string, pagination?: PaginationArg): Promise<Paginated<Message>> => {
    const { cursor } = pagination ?? {}
    const createdBefore = +cursor || Date.now()

    const messages = await this.api.getMessages(threadID, createdBefore)
    const currentUserId = this.user.id

    // TODO: refactor
    for (const event of messages.events) {
      if (event?.subtype === 'PARTICIPANT_CHANGE') {
        const [removed, added] = await Promise.all([
          this.mapParticipants(event, '*removedParticipants'),
          this.mapParticipants(event, '*addedParticipants'),
        ])
        event.eventContent.removedParticipants = removed
        event.eventContent.addedParticipants = added
      }
    }

    const items = (messages.events as any[])
      .map<Message>(message => mapMessage(message, currentUserId))
      .map<Message>(message => mapMessageSeenState(message, this.seenReceipt))
      .sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf())

    return {
      items,
      hasMore: items.length > 0,
    }
  }

  sendMessage = (threadID: string, content: MessageContent, options: MessageSendOptions) =>
    this.api.sendMessage(threadID, content, options, this.sendMessageResolvers)

  deleteMessage = (threadID: string, messageID: string) =>
    this.api.deleteMessage(threadID, messageID)

  editMessage = this.api.editMessage

  sendActivityIndicator = async (type: ActivityType, threadID: string) => {
    if (type === ActivityType.TYPING) await this.api.sendTypingState(threadID)
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

  getAsset = async (type: string, uri: string) => {
    if (type !== 'proxy') return
    const url = Buffer.from(uri, 'hex').toString()
    return this.api.fetchStream({ url })
  }

  updateThread = async (threadID: string, updates: Partial<Thread>) => {
    if (updates.title) await this.api.renameThread(threadID, updates.title)
    return true
  }

  onThreadSelected = async (threadID: string) => {
    const participantsPresence = await this.api.getUserPresence(threadID)
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
}
