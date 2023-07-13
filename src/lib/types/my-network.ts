import type { VectorImage } from './attachments'
import type { GraphQLNodeWithMultipleRecipeTypes, GraphQLResponse } from './graphql'

export type PendingInvitationsRequests = {
  data: Data
  included: Included[]
}

export type Data = {
  metadata: Metadata
  entityUrn: string
  paging: Paging
  '*elements': string[]
  $type: string
}

export type Metadata = {
  paginationToken: string
  $type: string
}

export type Paging = {
  count: number
  start: number
  total: number
  links: any[]
}

export type Included = {
  objectUrn?: string
  entityUrn: string
  name?: string
  showcase?: boolean
  active?: boolean
  logo?: VectorImage
  universalName?: string
  dashCompanyUrn?: string
  trackingId?: string
  $type: string
  customPronoun: any
  lastName?: string
  memorialized?: boolean
  dashEntityUrn?: string
  standardizedPronoun: any
  occupation?: string
  backgroundImage?: VectorImage
  picture?: VectorImage
  firstName?: string
  publicIdentifier?: string
  primaryImage?: PrimaryImage
  usePreAcceptExtension?: boolean
  title?: Title
  inviterName: any
  communicationHeadline: any
  preAcceptExtensionUseCase: any
  invitationType?: string
  communicationActions: any
  invitationTargetUrn?: string
  subtitle?: Subtitle
  cardAction: any
  insightImage: any
  sentTime: any
  inviterInformation: any
  typeLabel?: string
  sharedSecret?: string
  insightText: any
  unseen?: boolean
  fromMemberId: any
  '*toMember'?: string
  mailboxItemId?: string
  toMemberId?: string
  message: any
  invitee?: Invitee
  fromEvent: any
  inviterActors?: any[]
  customMessage?: boolean
  '*fromMember'?: string
  fromMember: any
  toMember: any
  showProfileInfo: any
  inviterFollowingInvitee: any
  insights?: Insight[]
  '*invitation'?: string
  '*genericInvitationView'?: string
  connectionDistance: any
  mutualCurrentCompany: any
  genericInvitationView: any
}

export type PrimaryImage = {
  attributes: Attribute[]
  actionTarget: string
  $type: string
}

export type Attribute = {
  sourceType: string
  '*miniProfile'?: string
  $type: string
  vectorImage?: VectorImage
  '*miniCompany'?: string
}

export type Title = {
  attributes: TitleAtribute[]
  text: string
  $type: string
}

export type TitleAtribute = {
  start: number
  length: number
  link: string
  type: string
  $type: string
}

export type Subtitle = {
  textDirection: string
  text: string
  $type: string
}

export type Invitee = {
  '*miniProfile': string
  $type: string
}

export type Insight = {
  sharedInsight: SharedInsight
  $type: string
}

export type SharedInsight = {
  '*connections': string[]
  totalCount: number
  $type: string
}

export type MyNetworkNotificationsSummary = GraphQLResponse<{
  relationshipsDashInvitationsSummaryByInvitationSummaryTypes: InvitationSummary
}>

export type InvitationSummary = GraphQLNodeWithMultipleRecipeTypes<{
  elements: GraphQLNodeWithMultipleRecipeTypes<{
    numPendingInvitations: number
    numNewInvitations: number
  }>[]
}>
