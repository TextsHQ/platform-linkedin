import type { VectorImage } from './attachments'

export interface PendingInvitationsRequests {
  data: Data
  included: Included[]
}

export interface Data {
  metadata: Metadata
  entityUrn: string
  paging: Paging
  '*elements': string[]
  $type: string
}

export interface Metadata {
  paginationToken: string
  $type: string
}

export interface Paging {
  count: number
  start: number
  total: number
  links: any[]
}

export interface Included {
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

export interface PrimaryImage {
  attributes: Attribute[]
  actionTarget: string
  $type: string
}

export interface Attribute {
  sourceType: string
  '*miniProfile'?: string
  $type: string
  vectorImage?: VectorImage
  '*miniCompany'?: string
}

export interface Title {
  attributes: TitleAtribute[]
  text: string
  $type: string
}

export interface TitleAtribute {
  start: number
  length: number
  link: string
  type: string
  $type: string
}

export interface Subtitle {
  textDirection: string
  text: string
  $type: string
}

export interface Invitee {
  '*miniProfile': string
  $type: string
}

export interface Insight {
  sharedInsight: SharedInsight
  $type: string
}

export interface SharedInsight {
  '*connections': string[]
  totalCount: number
  $type: string
}
