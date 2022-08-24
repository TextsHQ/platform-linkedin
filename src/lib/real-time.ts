import { randomUUID } from 'crypto'
import { Message, ServerEvent, ServerEventType, texts, UpsertStateSyncEvent, UpdateStateSyncEvent, PartialWithID, Thread } from '@textshq/platform-sdk'
import EventSource from 'eventsource'

import { LinkedInURLs, Topic, LinkedInAPITypes } from '../constants'
import { mapNewMessage, mapMiniProfile } from '../mappers'
import { urnID, eventUrnToMessageID, eventUrnToThreadID } from '../util'
import type PAPI from '../api'
import { REQUEST_HEADERS } from './linkedin'

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

  constructor(private readonly papi: InstanceType<typeof PAPI>) {
    clearInterval(this.heartbeatCheckerInterval)
    this.heartbeatCheckerInterval = setInterval(this.checkLastHeartbeat, HEARTBEAT_CHECK_INTERVAL_MS)
  }

  private resolveSendMessage(originToken: string, messages: Message[]) {
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
    // texts.log('[li]', new Date(), json?.['com.linkedin.realtimefrontend.DecoratedEvent']?.topic, JSON.stringify(json))

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

        const messages = [mapNewMessage(payload.event, this.papi.user.id, this.papi.threadSeenMap.get(threadID))]

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
        const participantID = urnID(payload.actorMiniProfileUrn)
        const reactionKey = payload.reactionSummary.emoji
        const objectIDs: UpsertStateSyncEvent['objectIDs'] = {
          threadID: eventUrnToThreadID(payload.eventUrn),
          messageID: eventUrnToMessageID(payload.eventUrn),
        }
        if (payload.reactionAdded) {
          return [{
            type: ServerEventType.STATE_SYNC,
            mutationType: 'upsert',
            objectName: 'message_reaction',
            objectIDs,
            entries: [{
              id: `${participantID}${reactionKey}`,
              reactionKey,
              participantID,
              emoji: true,
            }],
          }]
        }
        return [{
          type: ServerEventType.STATE_SYNC,
          mutationType: 'delete',
          objectName: 'message_reaction',
          objectIDs,
          entries: [`${participantID}${reactionKey}`],
        }]
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

        const partialThread: PartialWithID<Thread> = {
          id: threadID,
          isUnread: !conversation.read,
        }
        const updateEvent: UpdateStateSyncEvent = {
          type: ServerEventType.STATE_SYNC,
          mutationType: 'update',
          objectName: 'thread',
          objectIDs: {},
          entries: [partialThread],
        }
        const serverEvents: ServerEvent[] = [updateEvent]

        if (payload.action === 'UPDATE') {
          const participants = (conversation.participants as any[])
            .map(participant => {
              const { miniProfile: eventMiniProfile } = participant[LinkedInAPITypes.member] || {}
              return mapMiniProfile({
                ...eventMiniProfile,
                picture: { ...(eventMiniProfile?.picture?.['com.linkedin.common.VectorImage'] || {}) },
              })
            })
          Object.assign(partialThread, {
            isArchived: conversation.archived,
            mutedUntil: conversation.muted ? 'forever' : undefined,
          })

          // const seenMap: Record<MessageID, Record<string, Date>> = {}
          // for (const receipt of conversation.receipts) {
          //   const participantID = urnID(receipt.fromEntity)
          //   const messageID = eventUrnToMessageID(receipt.seenReceipt.eventUrn)
          //   const { seenAt } = receipt.seenReceipt
          //   seenMap[messageID] = { ...seenMap[messageID], [participantID]: new Date(seenAt) }
          //   this.papi.updateThreadSeenMap(threadID, participantID, messageID, seenAt)
          // }
          // serverEvents.push({
          //   type: ServerEventType.STATE_SYNC,
          //   mutationType: 'update',
          //   objectName: 'message',
          //   objectIDs: { threadID },
          //   entries: Object.entries(seenMap).map(([id, seen]) => ({ id, seen })),
          // })

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

        this.papi.updateThreadSeenMap(threadID, participantID, messageID, seenAt)

        return [{
          type: ServerEventType.STATE_SYNC,
          mutationType: 'upsert',
          objectName: 'message_seen',
          objectIDs: { threadID, messageID },
          entries: [{ [participantID]: new Date(seenAt) }],
        }]
      }

      case Topic.tabBadgeUpdateTopic: // ignore
        break

      default: {
        const msg = `unhandled linkedin topic: ${topic}`
        texts.log(newEvent)
        console.error(msg)
        texts.Sentry.captureMessage(msg)
      }
    }
  }

  private es: EventSource

  private reconnectTimeout: NodeJS.Timeout

  private retryAttempt = 0

  setup = async (): Promise<void> => {
    const headers = {
      'csrf-token': await this.papi.api.getCSRFToken(),
      Cookie: this.papi.api.cookieJar.getCookieStringSync(LinkedInURLs.HOME),
      accept: 'text/event-stream',
      'accept-language': 'en',
      'cache-control': 'no-cache',
      'user-agent': texts.constants.USER_AGENT,
      // this changes payload format:
      // 'x-li-accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-li-lang': 'en_US',
      'x-li-page-instance': 'urn:li:page:messaging_thread;' + randomUUID(),
      'x-li-realtime-session': randomUUID(),
      'x-li-recipe-accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-li-recipe-map': '{"messagingProgressIndicatorTopic":"com.linkedin.voyager.dash.deco.messaging.RealtimeProgressIndicator-1","inAppAlertsTopic":"com.linkedin.voyager.dash.deco.identity.notifications.InAppAlert-47","professionalEventsTopic":"com.linkedin.voyager.dash.deco.events.ProfessionalEventDetailPage-41","topCardLiveVideoTopic":"com.linkedin.voyager.dash.deco.video.TopCardLiveVideo-9"}',
      'x-li-track': REQUEST_HEADERS['x-li-track'],
      'x-restli-protocol-version': '2.0.0',
      Referer: 'https://www.linkedin.com/',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
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
