import { OnServerEventCallback, ServerEventType } from '@textshq/platform-sdk'
import EventSource from 'eventsource'

import { LINKEDIN_REALTIME_URL } from '../constants/linkedin'
import LinkedInAPI from './linkedin'

export default class LinkedInRealTime {
  api: LinkedInAPI

  onEvent: OnServerEventCallback

  constructor(api: LinkedInAPI, onEvent: OnServerEventCallback) {
    this.api = api
    this.onEvent = onEvent
  }

  subscribeToEvents = async (): Promise<void> => {
    const headers = this.api.getRequestHeaders()
    const eventSource = new EventSource(LINKEDIN_REALTIME_URL, { headers })

    eventSource.onmessage = event => {
      if (!event.data.startsWith('{')) return

      const json = JSON.parse(event.data)
      const newMessageEventType = 'com.linkedin.realtimefrontend.DecoratedEvent'

      if (json[newMessageEventType]?.payload) {
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

          this.onEvent([{
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
          }])
        }

        for (const { id: threadID } of threadsIDs) this.onEvent([{ type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID }])
      }
    }
  }
}
