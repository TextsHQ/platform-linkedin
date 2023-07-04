import { ServerEventType, type Message, type Thread } from '@textshq/platform-sdk'

import { encodeLinkedinUriComponent } from '../util'
import { LinkedInURLs } from '../constants'

import type LinkedInAPI from './linkedin'
import type { PendingInvitationsRequests } from './types/my-network'

export const MY_NETWORK_THREAD_ID = 'my-network-notifications'

const durationMap = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
}

const dateTimeMapper = (possibleDate: null | string | number): Date => {
  if (!possibleDate) return new Date()
  if (typeof possibleDate === 'number') return new Date(possibleDate)

  const now = new Date()
  const [value, unit] = possibleDate.split(' ')
  const mappedUnit = unit.endsWith('s') ? unit.slice(0, -1) : unit

  const durationInMillis = Number(value) * durationMap[mappedUnit]
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

      const invitationID = invitationFound.entityUrn.split(':').pop()
      const invitationOldEntityUrn = `urn:li:fsd_invitation:${invitationID}`

      const actionPayload = Buffer.from(JSON.stringify({
        entityUrn: invitationOldEntityUrn,
        type: invitationFound.invitationType,
        secret: invitationFound.sharedSecret,
      })).toString('base64')

      const common: Partial<Message> = {
        _original: JSON.stringify(invitationFound),
        id: invitationOldEntityUrn,
        senderID: '$thread',
        seen: !invitationFound.unseen,
        timestamp: dateTimeMapper(invitationFound.sentTime),
        buttons: [
          {
            label: 'Accept',
            linkURL: `texts://platform-callback/${this.linkedInApi.accountInfo.accountID}/callback/${MY_NETWORK_THREAD_ID}/accept/${actionPayload}`,
          },
          {
            label: 'Ignore',
            linkURL: `texts://platform-callback/${this.linkedInApi.accountInfo.accountID}/callback/${MY_NETWORK_THREAD_ID}/ignore/${actionPayload}`,
          },
        ],
      }

      if (invitationFound['*fromMember']) {
        const member = response.included.find(included => included.entityUrn === invitationFound['*fromMember'])

        return [
          ...previous,
          {
            ...common,
            textHeading: member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : 'Linkedin member',
            textFooter: member.occupation,
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

  handleInvitationClick = async (action: 'accept' | 'ignore', encryptedData: string): Promise<void> => {
    const data: { entityUrn: string, type: string, secret: string } = JSON.parse(Buffer.from(encryptedData, 'base64').toString())
    const url = `${LinkedInURLs.API_BASE}/voyagerRelationshipsDashInvitations/${encodeLinkedinUriComponent(data.entityUrn)}`
    const params = { action }

    await this.linkedInApi.fetch<PendingInvitationsRequests>({
      method: 'POST',
      url,
      searchParams: params,
      json: {
        sharedSecret: data.secret,
        invitationType: data.type,
      },
    })

    this.linkedInApi.onEvent([{
      type: ServerEventType.STATE_SYNC,
      mutationType: 'delete',
      objectName: 'message',
      objectIDs: { threadID: MY_NETWORK_THREAD_ID },
      entries: [data.entityUrn],
    }])
  }
}
