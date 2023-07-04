import type { Message, Thread } from '@textshq/platform-sdk'

import { LinkedInURLs } from '../constants'

import type LinkedInAPI from './linkedin'
import type { PendingInvitationsRequests } from './types/my-network'

export const MY_NETWORK_THREAD_ID = 'my-network-notifications'

const durationMap = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000,
}

const dateTimeMapper = (possibleDate: null | string | number): Date => {
  if (!possibleDate) return new Date()
  if (typeof possibleDate === 'number') return new Date(possibleDate)

  const now = new Date()
  const [value, unit] = possibleDate.split(' ')
  const durationInMillis = Number(value) * durationMap[unit]
  const date = new Date(now.getTime() - durationInMillis)

  return date
}

export default class MyNetwork {
  private readonly linkedInApi: InstanceType<typeof LinkedInAPI>

  constructor({ api }: { api: InstanceType<typeof LinkedInAPI> }) {
    this.linkedInApi = api
  }

  getRequests = async (): Promise<Message[]> => {
    const url = `${LinkedInURLs.API_BASE}/relationships/invitationViews`
    const params = {
      // TODO: work on pagination
      count: 100,
      start: 0,
      includeInsights: 'false',
      q: 'pendingInvitationsBasedOnRelevance',
    }
    const response = await this.linkedInApi.fetch<PendingInvitationsRequests>({ method: 'GET', url, searchParams: params })

    if (!(response.data['*elements'] || []).length) return []

    const invitations = response.data['*elements']
    const mappedInvitations = invitations.reduce((previous, invitation) => {
      const entityFound = response.included.find(included => included.entityUrn === invitation)
      if (!entityFound) return [...previous]

      const invitationFound = response.included.find(included => entityFound['*genericInvitationView'] === included.entityUrn || entityFound['*invitation'] === included.entityUrn)
      if (!invitationFound) return [...previous]

      const common: Partial<Message> = {
        id: invitationFound.entityUrn,
        senderID: '$thread',
        seen: !invitationFound.unseen,
        timestamp: dateTimeMapper(invitationFound.sentTime),
      }

      if (invitationFound['*fromMember']) {
        const member = response.included.find(included => included.entityUrn === invitationFound['*fromMember'])

        return [
          ...previous,
          {
            ...common,
            textHeading: member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : 'Linkedin member',
            textFooter: member.occupation,
            buttons: [
              {
                label: 'Accept',
                linkURL: `https://www.linkedin.com/voyager/api/voyagerRelationshipsDashInvitations/urn%3Ali%3Afsd_invitation%3A${invitationFound.entityUrn}?action=accept`,
              },
              {
                label: 'Ignore',
                linkURL: `https://www.linkedin.com/voyager/api/voyagerRelationshipsDashInvitations/urn%3Ali%3Afsd_invitation%3A${invitationFound.entityUrn}?action=ignore`,
              },
            ],
          } as Message,
        ]
      }

      return [
        ...previous,
        {
          ...common,
          textHeading: invitationFound?.title.text || undefined,
          textFooter: invitationFound?.subtitle?.text || undefined,
        } as Message,
      ]
    }, [] as Message[])

    return mappedInvitations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  getThread = async (): Promise<Thread> => {
    const requests = await this.getRequests()

    return {
      id: MY_NETWORK_THREAD_ID,
      title: 'My network',
      isUnread: false,
      isReadOnly: true,
      type: 'broadcast',
      messages: { items: requests, hasMore: false },
      participants: { items: [], hasMore: false },
    }
  }
}
