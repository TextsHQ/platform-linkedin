import { Message, OnServerEventCallback, ServerEvent, ServerEventType, texts, UNKNOWN_DATE } from '@textshq/platform-sdk'
import EventSource from 'eventsource'

import { REQUEST_HEADERS, LinkedInURLs, Topic, LinkedInAPITypes } from '../constants'
import { mapNewMessage, mapMiniProfile } from '../mappers'
import { urnID, eventUrnToMessageID, eventUrnToThreadID } from '../util'
import type PAPI from '../api'

export default class LinkedInRealTime {
  constructor(
    private papi: InstanceType<typeof PAPI>,
    private onEvent: OnServerEventCallback,
  ) {}

  async resolveSendMessage(originToken: string, messages: Message[]) {
    const resolve = this.papi.sendMessageResolvers.get(originToken)
    if (!resolve) return texts.log('[li] ignoring send message with token:', originToken)
    this.papi.sendMessageResolvers.delete(originToken)
    resolve(messages)
    return true
  }

  private* parseJSON(json: any) {
    if (!json) return
    if (texts.IS_DEV) console.log(JSON.stringify(json))

    const newMessageEventType = 'com.linkedin.realtimefrontend.DecoratedEvent'
    if (!json[newMessageEventType]?.payload) return

    const { payload, topic = '' } = json[newMessageEventType]
    const refreshThreadsIDs = new Set<string>()

    switch (topic) {
      case Topic.Messages: {
        const { entityUrn = '' } = payload.event
        const threadID = eventUrnToThreadID(entityUrn)

        const messages = [mapNewMessage(payload.event, this.papi.user.id)]
        if (!this.resolveSendMessage(payload.event.originToken, messages)) {
          yield {
            type: ServerEventType.STATE_SYNC,
            mutationType: 'upsert',
            objectName: 'message',
            objectIDs: { threadID },
            entries: messages,
          }
        }

        break
      }

      case Topic.MessageReactionSummaries: {
        const { eventUrn = '' } = payload

        const threadID = eventUrnToThreadID(eventUrn)
        refreshThreadsIDs.add(threadID)
        break
      }

      case Topic.Conversations: {
        const { entityUrn = '', conversation } = payload
        const threadID = urnID(entityUrn)

        if (payload.action === 'DELETE') {
          yield {
            type: ServerEventType.STATE_SYNC,
            mutationType: 'delete',
            objectName: 'thread',
            objectIDs: {},
            entries: [threadID],
          }
        }
        if (!conversation) return

        const serverEvent: ServerEvent = {
          type: ServerEventType.STATE_SYNC,
          mutationType: 'update',
          objectName: 'thread',
          objectIDs: { threadID },
          entries: [
            {
              id: threadID,
              isUnread: !conversation.read,
            },
          ],
        }

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

          Object.assign(serverEvent.entries[0], {
            isArchived: conversation.archived,
            mutedUntil: conversation.muted ? 'forever' : undefined,
            participants,
          })
        }
        yield serverEvent
        break
      }

      case Topic.MessageSeenReceipts: {
        const { fromEntity, seenReceipt } = payload
        const { eventUrn, seenAt } = seenReceipt

        const participantID = urnID(fromEntity)
        const threadID = eventUrnToThreadID(eventUrn)
        const messageID = eventUrnToMessageID(eventUrn)

        this.papi.updateSeenReceipt(messageID, { [participantID]: new Date(seenAt) })

        yield {
          type: ServerEventType.STATE_SYNC,
          mutationType: 'update',
          objectName: 'message',
          objectIDs: { messageID, threadID },
          entries: [
            {
              id: messageID,
              seen: { [participantID]: UNKNOWN_DATE },
            },
          ],
        }
        break
      }

      case Topic.TabBadgeUpdate: // ignore
        break

      default: {
        const msg = `unknown linkedin topic: ${topic}`
        texts.Sentry.captureMessage(msg)
        console.error(msg)
      }
    }

    if (payload.previousEventInConversationUrn) {
      refreshThreadsIDs.add(eventUrnToThreadID(payload.previousEventInConversationUrn))
    }
    if (payload.event) {
      refreshThreadsIDs.add(urnID(payload.event.entityUrn))
    }

    yield* [...refreshThreadsIDs].map<ServerEvent>(threadID => ({ type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID }))
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
      const jsons = event.data.split('\n').map(line => {
        if (!line.startsWith('{')) {
          texts.log('unknown linkedin realtime response', event.data)
          return
        }
        return JSON.parse(line)
      })
      const events = jsons.flatMap(json => [...this.parseJSON(json)])
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
