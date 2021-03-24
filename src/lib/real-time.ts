import { OnServerEventCallback, ServerEvent, ServerEventType, texts, UNKNOWN_DATE } from '@textshq/platform-sdk'
import EventSource from 'eventsource'

import { REQUEST_HEADERS, LinkedInURLs } from '../constants'
import { mapMiniProfile } from '../mappers'
import type LinkedInAPI from './linkedin'

export default class LinkedInRealTime {
  constructor(
    private api: LinkedInAPI,
    private onEvent: OnServerEventCallback,
    private updateSeenReceipt: (key: string, value: any) => void,
  ) {}

  private* parseJSON(json: any) {
    if (!json) return
    const newMessageEventType = 'com.linkedin.realtimefrontend.DecoratedEvent'

    if (!json[newMessageEventType]?.payload) return
    const { payload, topic = '' } = json[newMessageEventType]
    const threadsIDs = []

    if (payload?.previousEventInConversationUrn) {
      // "previousEventInConversationUrn": "urn:li:fs_event:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,2-MTYxMjk5MzkyMzQxMWI0ODMyNy0wMDMmZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==)"
      const { previousEventInConversationUrn } = payload
      const threadID = previousEventInConversationUrn.split(':(').pop().split(',')[0]
      threadsIDs.push({ id: threadID })
    } else if (payload?.event) {
      const { entityUrn = '' } = payload.event
      const threadID = entityUrn.split(':(').pop().split(',')[0]
      threadsIDs.push({ id: threadID })
    } else if (topic === 'urn:li-realtime:messageReactionSummariesTopic:urn:li-realtime:myself') {
      const { eventUrn = '' } = payload

      const threadID = eventUrn.split(':(').pop().split(',')[0]
      threadsIDs.push({ id: threadID })
    } else if (topic === 'urn:li-realtime:conversationsTopic:urn:li-realtime:myself') {
      const { entityUrn = '', conversation } = payload
      const threadID = entityUrn.split(':').pop()

      if (conversation) {
        yield {
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
      }

      if (payload?.action === 'UPDATE') {
        const participants = conversation?.participants
          .map(participant => {
            const { miniProfile: eventMiniProfile } = participant['com.linkedin.voyager.messaging.MessagingMember']
            const miniProfile = {
              ...eventMiniProfile,
              picture: {
                ...(eventMiniProfile.picture ? eventMiniProfile.picture['com.linkedin.common.VectorImage'] : {}),
              },
            }

            return mapMiniProfile(miniProfile)
          })

        yield {
          type: ServerEventType.STATE_SYNC,
          mutationType: 'update',
          objectName: 'thread',
          objectIDs: { threadID },
          entries: [
            {
              id: threadID,
              title: conversation.name,
              isArchived: conversation?.archived,
              mutedUntil: conversation?.muted ? 'forever' : undefined,
              participants,
            },
          ],
        }
      }
    } else if (topic === 'urn:li-realtime:messageSeenReceiptsTopic:urn:li-realtime:myself') {
      const { fromEntity, seenReceipt } = payload
      const { eventUrn, seenAt } = seenReceipt

      const participantID = fromEntity.split(':').pop()
      // urn:li:fs_event:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,2-MTYxMzcwNjcxOTUzMWI2NTIzNi0wMDQmZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==)
      const threadID = eventUrn.split(':(').pop().split(',')[0]
      const messageID = `urn:li:fsd_message:${eventUrn.split(',').pop().replace(')', '')}`

      this.updateSeenReceipt(messageID, { [participantID]: new Date(seenAt) })

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
    }

    const events = threadsIDs.map<ServerEvent>(({ id: threadID }) => ({ type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID }))
    yield* events
  }

  subscribeToEvents = async (): Promise<void> => {
    const headers = {
      ...REQUEST_HEADERS,
      Cookie: this.api.cookieJar.getCookieStringSync(LinkedInURLs.HOME),
    }
    const eventSource = new EventSource(LinkedInURLs.REALTIME, { headers })

    eventSource.onmessage = event => {
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
    eventSource.onerror = err => {
      console.error(err)
    }
  }
}
