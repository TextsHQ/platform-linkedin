import { Message, OnServerEventCallback, ServerEvent, ServerEventType, texts, UNKNOWN_DATE, UpdateStateSyncEvent } from '@textshq/platform-sdk'
import EventSource from 'eventsource'

import { REQUEST_HEADERS, LinkedInURLs, Topic, LinkedInAPITypes } from '../constants'
import { mapNewMessage, mapMiniProfile } from '../mappers'
import { urnID, eventUrnToMessageID, eventUrnToThreadID } from '../util'
import type PAPI from '../api'

export default class LinkedInRealTime {
  constructor(
    private readonly papi: InstanceType<typeof PAPI>,
    private onEvent: OnServerEventCallback,
  ) {}

  resolveSendMessage(originToken: string, messages: Message[]) {
    const resolve = this.papi.sendMessageResolvers.get(originToken)
    if (!resolve) {
      texts.log('[li] ignoring send message with token:', originToken)
      return
    }
    this.papi.sendMessageResolvers.delete(originToken)
    resolve(messages)
    return true
  }

  private parseJSON(json: any): ServerEvent[] {
    if (!json) return
    // texts.log(JSON.stringify(json))

    const newMessageEventType = 'com.linkedin.realtimefrontend.DecoratedEvent'
    if (!json[newMessageEventType]?.payload) return

    const { payload, topic = '' } = json[newMessageEventType]

    switch (topic) {
      case Topic.Messages: {
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

      case Topic.MessageReactionSummaries: {
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
              id: String(payload.reactionSummary.firstReactedAt),
              reactionKey: payload.reactionSummary.emoji,
              participantID: urnID(payload.actorMiniProfileUrn),
              emoji: true,
            }],
          }]
        }
        // todo use state sync
        return [{ type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID }]
      }

      case Topic.Conversations: {
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
          objectIDs: { threadID },
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

      case Topic.MessageSeenReceipts: {
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

      case Topic.TabBadgeUpdate: // ignore
        break

      default: {
        const msg = `unknown linkedin topic: ${topic}`
        texts.Sentry.captureMessage(msg)
        console.error(msg)
      }
    }
  }

  private es: EventSource

  setup = async (): Promise<void> => {
    const headers = {
      ...REQUEST_HEADERS,
      Cookie: this.papi.api.cookieJar.getCookieStringSync(LinkedInURLs.HOME),
    }
    this.es?.close()
    this.es = new EventSource(LinkedInURLs.REALTIME, { headers })
    this.es.onmessage = event => {
      const jsons = (event.data as string).split('\n').map(line => {
        if (!line.startsWith('{')) {
          texts.log('unknown linkedin realtime response', event.data)
          return
        }
        return JSON.parse(line)
      })
      const events = jsons.flatMap(json => this.parseJSON(json)).filter(Boolean)
      if (events.length > 0) this.onEvent(events)
    }
    let errorCount = 0
    this.es.onerror = event => {
      if (this.es.readyState === this.es.CLOSED) {
        texts.error('[linkedin]', new Date(), 'es closed, reconnecting')
        texts.Sentry.captureMessage(`linkedin es reconnecting ${this.es.readyState}`)
        this.setup()
      }
      texts.error('[linkedin]', new Date(), 'es error', event, ++errorCount)
    }
  }
}
