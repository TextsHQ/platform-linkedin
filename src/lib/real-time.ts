import { Message, ServerEvent, ServerEventType, texts, UNKNOWN_DATE, UpdateStateSyncEvent } from '@textshq/platform-sdk'
import EventSource from 'eventsource'

import { REQUEST_HEADERS, LinkedInURLs, Topic, LinkedInAPITypes } from '../constants'
import { mapNewMessage, mapMiniProfile } from '../mappers'
import { urnID, eventUrnToMessageID, eventUrnToThreadID } from '../util'
import type PAPI from '../api'

const HEARTBEAT_CHECK_INTERVAL_MS = 30 * 1_000 // 30 seconds

// linkedin sends heartbeats every 15 seconds
const HEARTBEAT_FREQUENCY_MS = 15 * 1_000 // 15 seconds

export default class LinkedInRealTime {
  private heartbeatCheckerInterval: NodeJS.Timeout

  checkLastHeartbeat = () => {
    if (!this.lastHeartbeat) return
    const diff = Date.now() - this.lastHeartbeat.getTime()
    if (diff > HEARTBEAT_FREQUENCY_MS) {
      texts.log('[li] reconnecting realtime, last heartbeat:', diff / 1000, 'seconds ago')
      // todo: fix resync dropped events?
      this.setup()
    }
  }

  constructor(
    private readonly papi: InstanceType<typeof PAPI>,
  ) {
    this.heartbeatCheckerInterval = setInterval(this.checkLastHeartbeat, HEARTBEAT_CHECK_INTERVAL_MS)
  }

  resolveSendMessage(originToken: string, messages: Message[]) {
    const resolve = this.papi.sendMessageResolvers.get(originToken)
    if (!resolve) {
      texts.log('[li] ignoring sent message with token:', originToken)
      return
    }
    this.papi.sendMessageResolvers.delete(originToken)
    resolve(messages)
    return true
  }

  private lastHeartbeat: Date

  private parseJSON(json: any): ServerEvent[] {
    if (!json) return
    // texts.log(new Date(), JSON.stringify(json))

    if (json['com.linkedin.realtimefrontend.Heartbeat']) {
      this.lastHeartbeat = new Date()
      return
    }

    const newEvent = json['com.linkedin.realtimefrontend.DecoratedEvent']
    if (!newEvent?.payload) {
      texts.log('[li] ignoring event because no payload', json)
      return
    }

    const { payload, topic = '' } = newEvent

    switch (topic) {
      case Topic.messagesTopic: {
        const { entityUrn = '', originToken } = payload.event
        const threadID = eventUrnToThreadID(entityUrn)

        const messages = [mapNewMessage(payload.event, this.papi.user.id)]
        if (!this.resolveSendMessage(originToken, messages)) {
          return [{
            type: ServerEventType.STATE_SYNC,
            mutationType: 'upsert',
            objectName: 'message',
            objectIDs: { threadID },
            entries: messages,
          }]
        }

        break
      }

      case Topic.messageReactionSummariesTopic: {
        const threadID = eventUrnToThreadID(payload.eventUrn)
        const messageID = eventUrnToMessageID(payload.eventUrn)

        if (payload.reactionAdded) {
          return [{
            type: ServerEventType.STATE_SYNC,
            mutationType: 'upsert',
            objectName: 'message_reaction',
            objectIDs: {
              threadID,
              messageID,
            },
            entries: [{
              id: `${urnID(payload.actorMiniProfileUrn)}${payload.reactionSummary?.emoji}`,
              reactionKey: payload.reactionSummary.emoji,
              participantID: urnID(payload.actorMiniProfileUrn),
              emoji: true,
            }],
          }]
        }
        // todo use state sync
        return [{ type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID }]
      }

      case Topic.conversationsTopic: {
        const { entityUrn = '', conversation } = payload
        const threadID = urnID(entityUrn)

        if (payload.action === 'DELETE') {
          return [{
            type: ServerEventType.STATE_SYNC,
            mutationType: 'delete',
            objectName: 'thread',
            objectIDs: {},
            entries: [threadID],
          }]
        }
        if (!conversation) return

        const firstEvent: UpdateStateSyncEvent = {
          type: ServerEventType.STATE_SYNC,
          mutationType: 'update',
          objectName: 'thread',
          objectIDs: {},
          entries: [{
            id: threadID,
            isUnread: !conversation.read,
          }],
        }
        const serverEvents: ServerEvent[] = [firstEvent]

        if (payload.action === 'UPDATE') {
          const participants = (conversation.participants as any[])
            .map(participant => {
              const { miniProfile: eventMiniProfile } = participant[LinkedInAPITypes.member] || {}
              return mapMiniProfile({
                ...eventMiniProfile,
                picture: {
                  ...(eventMiniProfile?.picture?.['com.linkedin.common.VectorImage'] || {}),
                },
              })
            })
          Object.assign(firstEvent.entries[0], {
            isArchived: conversation.archived,
            mutedUntil: conversation.muted ? 'forever' : undefined,
          })
          // todo delete existing participants
          serverEvents.push({
            type: ServerEventType.STATE_SYNC,
            mutationType: 'upsert',
            objectName: 'participant',
            objectIDs: { threadID },
            entries: participants,
          })
        }
        return serverEvents
      }

      case Topic.messageSeenReceiptsTopic: {
        const { fromEntity, seenReceipt } = payload
        const { eventUrn, seenAt } = seenReceipt

        const participantID = urnID(fromEntity)
        const threadID = eventUrnToThreadID(eventUrn)
        const messageID = eventUrnToMessageID(eventUrn)

        this.papi.updateSeenReceipt(messageID, { [participantID]: new Date(seenAt) })

        return [{
          type: ServerEventType.STATE_SYNC,
          mutationType: 'update',
          objectName: 'message',
          objectIDs: { messageID, threadID },
          entries: [{
            id: messageID,
            seen: { [participantID]: UNKNOWN_DATE },
          }],
        }]
      }

      case Topic.tabBadgeUpdateTopic: // ignore
        break

      default: {
        const msg = `unhandled linkedin topic: ${topic}`
        texts.log(newEvent)
        console.error(msg)
      }
    }
  }

  private es: EventSource

  private reconnectTimeout: NodeJS.Timeout

  private retryAttempt = 0

  setup = async (): Promise<void> => {
    const headers = {
      ...REQUEST_HEADERS,
      Cookie: this.papi.api.cookieJar.getCookieStringSync(LinkedInURLs.HOME),
    }
    this.es?.close()
    this.es = new EventSource(LinkedInURLs.REALTIME, { headers })
    this.es.onopen = () => {
      texts.log('[li] es open')
      this.retryAttempt = 0
    }
    this.es.onmessage = event => {
      const jsons = (event.data as string).split('\n').map(line => {
        if (!line.startsWith('{')) {
          texts.log('unknown linkedin realtime response', event.data)
          return
        }
        return JSON.parse(line)
      })
      const events = jsons.flatMap(json => this.parseJSON(json)).filter(Boolean)
      if (events.length > 0) this.papi.onEvent(events)
    }
    let errorCount = 0
    this.es.onerror = event => {
      texts.error('[li]', new Date(), 'es error', event, ++errorCount)
      clearTimeout(this.reconnectTimeout)
      // min 1 second, max 60 seconds
      const timeoutSeconds = Math.min(60, ++this.retryAttempt)
      texts.error(`[li] retrying in ${timeoutSeconds} seconds, attempt: ${this.retryAttempt}`)
      this.reconnectTimeout = setTimeout(() => {
        this.setup()
      }, timeoutSeconds * 1000)
    }
  }

  dispose = async () => {
    clearInterval(this.heartbeatCheckerInterval)
    this.es?.close()
    this.es = null
  }
}
