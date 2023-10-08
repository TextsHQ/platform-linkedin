import { ServerEventType, type Message, type Thread, Participant, texts } from '@textshq/platform-sdk'

import { encodeLinkedinUriComponent } from '../util'
import { getThumbnailUrl } from '../mappers'
import { GraphQLHeaders, LinkedInURLs } from '../constants'

import type LinkedInAPI from '../api'
import type { Included, MyNetworkNotificationsSummary, PendingInvitationsRequests, SharedInsight } from './types/my-network'

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

  const durationInMilliseconds = Number(value) * durationMap[mappedUnit]
  const date = new Date(now.getTime() - durationInMilliseconds)

  return date
}

const getSharedInsightText = (sharedInsight: SharedInsight, included: Included[]): string | undefined => {
  if (!sharedInsight?.totalCount) return undefined

  if (sharedInsight['*connections'].length) {
    const [firstConnectionID] = sharedInsight['*connections']
    const [firstSharedConnection] = included.filter(x => firstConnectionID === x.entityUrn)

    return `${firstSharedConnection.firstName} ${firstSharedConnection.lastName}${sharedInsight.totalCount > 1 ? ` and ${sharedInsight.totalCount - 1} other mutual connections` : ' is a mutual connection'}`
  }

  return `${sharedInsight.totalCount} mutual connections`
}

export default class MyNetwork {
  private latestCursor = 0

  constructor(private readonly api: InstanceType<typeof LinkedInAPI>) {}

  getRequests = async (shouldRefreshCursor = false): Promise<{ messages: Message[], participants: Participant[] }> => {
    if (shouldRefreshCursor) this.latestCursor = 0

    const url = `${LinkedInURLs.API_BASE}/relationships/invitationViews`
    const params = {
      count: 10,
      start: this.latestCursor,
      includeInsights: 'false',
      q: 'pendingInvitationsBasedOnRelevance',
    }
    const response = await this.api.api.fetch<PendingInvitationsRequests>({ method: 'GET', url, searchParams: params })

    if (!(response.data['*elements'] || []).length) return { messages: [], participants: [] }

    const participantEntries = response.included.reduce((previous, included) => {
      if (included.$type === 'com.linkedin.voyager.entities.shared.MiniCompany') {
        return [
          ...previous,
          {
            id: included.entityUrn,
            fullName: included.name,
            imgURL: getThumbnailUrl(included.logo),
          },
        ]
      }

      if (included.$type === 'com.linkedin.voyager.identity.shared.MiniProfile') {
        return [
          ...previous,
          {
            id: included.entityUrn,
            fullName: [included.firstName, included.lastName].filter(Boolean).join(' '),
            imgURL: getThumbnailUrl(included.picture),
          },
        ]
      }

      return [...previous]
    }, [] as Participant[])

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
        timestamp: dateTimeMapper(invitationFound.sentTime),
        buttons: [
          {
            label: 'Accept',
            linkURL: `texts://platform-callback/${this.api.accountID}/callback/${MY_NETWORK_THREAD_ID}/accept/${actionPayload}`,
          },
          {
            label: 'Ignore',
            linkURL: `texts://platform-callback/${this.api.accountID}/callback/${MY_NETWORK_THREAD_ID}/ignore/${actionPayload}`,
          },
        ],
      }

      if (invitationFound['*fromMember']) {
        const member = response.included.find(included => included.entityUrn === invitationFound['*fromMember'])
        const sharedInsight = entityFound.insights.find(insight => insight.$type === 'com.linkedin.voyager.relationships.shared.Insight')?.sharedInsight

        return [
          ...previous,
          {
            ...common,
            text: invitationFound.message || 'Connection request',
            textHeading: member.occupation,
            textFooter: getSharedInsightText(sharedInsight, response.included),
            senderID: member.entityUrn,
            buttons: [
              ...common.buttons,
              {
                label: 'Open User Profile',
                linkURL: `https://linkedin.com/in/${member.entityUrn.split(':').pop()}`,
              },
            ],
          } as Message,
        ]
      }

      const profilePicutre = invitationFound.primaryImage.attributes.find(image => image.sourceType === 'PROFILE_PICTURE')
      const member = response.included.find(included => included.entityUrn === profilePicutre?.['*miniProfile']) || response.included?.[0]

      return [
        ...previous,
        {
          ...common,
          text: invitationFound?.title.text || undefined,
          textHeading: invitationFound?.subtitle?.text || undefined,
          senderID: member.entityUrn || '$thread',
          textAttributes: invitationFound?.title?.attributes ? {
            entities: invitationFound?.title?.attributes.map(attribute => {
              switch (attribute.type) {
                case 'HYPERLINK':
                  return {
                    from: attribute.start,
                    to: attribute.start + attribute.length,
                    link: `https://linkedin.com/${attribute.link}`,
                  }

                default:
                  return null
              }
            }).filter(Boolean),
          } : undefined,
          buttons: member ? [
            ...common.buttons,
            {
              label: 'Open User Profile',
              linkURL: `https://linkedin.com/in/${member.entityUrn.split(':').pop()}`,
            },
          ] : common.buttons,
        } as Message,
      ]
    }, [] as Message[])

    this.latestCursor += response.data['*elements'].length

    return {
      messages: mappedInvitations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
      participants: participantEntries,
    }
  }

  getInvitationsUnreadNotifications = async (): Promise<number> => {
    // Query/Search params are added inline because otherwise searchParams will encode them and LinkedIn is throwing 400
    // if query params are encoded for this request
    const url = `${LinkedInURLs.API_BASE_GRAPHQL}?variables=(types:List(PENDING_INVITATION_COUNT,UNSEEN_INVITATION_COUNT))&queryId=voyagerRelationshipsDashInvitationsSummary.26002c38d857d2d5cd4503df1a43a0ab`
    const response = await this.api.api.fetch<MyNetworkNotificationsSummary>({
      method: 'GET',
      url,
      headers: GraphQLHeaders,
    }).catch(texts.error)

    if (!response) return 0

    const summaryElements = response.data?.relationshipsDashInvitationsSummaryByInvitationSummaryTypes?.elements || []

    return summaryElements.reduce((prev, current) => prev + (current.numNewInvitations || 0), 0)
  }

  getThread = async (): Promise<Thread> => {
    const [requests, unreadNotifications] = await Promise.all([
      this.getRequests(),
      this.getInvitationsUnreadNotifications(),
    ])

    const lastReadMessage = requests.messages.at(-(unreadNotifications + 1))

    return {
      id: MY_NETWORK_THREAD_ID,
      title: 'My Network',
      isUnread: unreadNotifications > 0,
      lastReadMessageID: lastReadMessage?.id,
      isReadOnly: true,
      type: 'channel',
      messages: { items: requests.messages, hasMore: true },
      participants: { items: requests.participants, hasMore: false },
    }
  }

  markThreadRead = async (): Promise<void> => {
    await this.api.api.fetch({
      method: 'POST',
      url: `${LinkedInURLs.API_BASE}/relationships/invitationsSummary`,
      searchParams: {
        action: 'clearUnseenCount',
      },
    })
  }

  handleInvitationClick = async (action: 'accept' | 'ignore', encryptedData: string): Promise<void> => {
    const data: { entityUrn: string, type: string, secret: string } = JSON.parse(Buffer.from(encryptedData, 'base64').toString())
    const url = `${LinkedInURLs.API_BASE}/voyagerRelationshipsDashInvitations/${encodeLinkedinUriComponent(data.entityUrn)}`
    const params = { action }

    const invitationType = (() => {
      switch (data.type) {
        case 'PENDING':
          return 'CONNECTION'

        default:
          return data.type
      }
    })()

    await this.api.api.fetch<PendingInvitationsRequests>({
      method: 'POST',
      url,
      searchParams: params,
      json: {
        sharedSecret: data.secret,
        invitationType,
      },
    })

    this.api.onEvent([{
      type: ServerEventType.STATE_SYNC,
      mutationType: 'delete',
      objectName: 'message',
      objectIDs: { threadID: MY_NETWORK_THREAD_ID },
      entries: [data.entityUrn],
    }])
  }
}
