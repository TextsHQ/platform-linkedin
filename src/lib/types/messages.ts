import type { GraphQLResponse, GraphQLNode, PaginatedMetadata } from './graphql';

export type MessagesGraphQLResponse = GraphQLResponse<MessagesByConversation | MessagesByAnchorTimestamp>

export type MessagesByConversation = GraphQLNode<{
  'messengerMessagesByConversation': ConversationMessages
}>

export type MessagesByAnchorTimestamp = GraphQLNode<{
  'messengerMessagesByAnchorTimestamp': ConversationMessages
}>

type ConversationMessages = GraphQLNode<{
  metadata: PaginatedMetadata
  elements: GraphQLMessage[]
}>

// type MessagesBySyncToken = GraphQLNode<{
//   'messengerMessagesBySyncToken': MessengerMessagesBySyncToken
// }>

// type MessengerMessagesBySyncToken = GraphQLNode<{
//   metadata: MessagesBySyncTokenMetadata
//   elements: GraphQLMessage[]
// }>

// type MessagesBySyncTokenMetadata = GraphQLNode<{
//   deletedUrns: any[]
//   newSyncToken: string
//   shouldClearCache: boolean
// }>

export type GraphQLMessage = GraphQLNode<{
  reactionSummaries: Reaction[]
  subject: any
  inlineWarning: any
  body: Body
  originToken?: string
  backendUrn: string
  deliveredAt: number
  renderContentFallbackText: any
  entityUrn: string
  sender: Sender
  backendConversationUrn: string
  messageBodyRenderFormat: string
  renderContent: RenderContent[]
  conversation: Conversation
}>

export type Reaction = GraphQLNode<{
  count: number
  firstReactedAt: number
  emoji: string
  viewerReacted: boolean
}>

type Body = GraphQLNode<{
  attributes: Attribute[]
  text: string
}>

export type Attribute = GraphQLNode<{
  start: number
  length: number
  attributeKind: AttributeKind
}>

type AttributeKind = {
  hyperlink: any
  listItem: any
  paragraph: any
  lineBreak: any
  subscript: any
  underline: any
  superscript: any
  bold: any
  list: any
  italic: any
  entity: Entity
}

type Entity = GraphQLNode<{
  urn: string
}>

type Sender = GraphQLNode<{
  hostIdentityUrn: string
  entityUrn: string
  participantType: ParticipantType
  backendUrn: string
}>

type ParticipantType = GraphQLNode<{
  member: Member
  custom: any
  organization: any
}>

type Member = GraphQLNode<{
  profileUrl: string
  firstName: FirstName
  lastName: LastName
  profilePicture: ProfilePicture
  distance: string
  pronoun: any
  headline: Headline
}>

type FirstName = GraphQLNode<{
  attributes: any[]
  text: string
}>

type LastName = GraphQLNode<{
  attributes: any[]
  text: string
}>

type ProfilePicture = GraphQLNode<{
  digitalmediaAsset: any
  attribution: any
  focalPoint: any
  artifacts: Artifact[]
  rootUrl: string
}>

type Artifact = GraphQLNode<{
  width: number
  fileIdentifyingUrlPathSegment: string
  height: number
}>

type Headline = GraphQLNode<{
  attributes: any[]
  text: string
}>

type RenderContent = GraphQLNode<{
  videoMeeting: any
  awayMessage: any
  conversationAdsMessageContent: any
  file: any
  externalMedia: any
  messageAdRenderContent: any
  video?: Video
  audio: any
  forwardedMessageContent: any
  hostUrnData: any
  vectorImage?: VectorImage
}>

type Video = GraphQLNode<{
  thumbnail: Thumbnail
  progressiveStreams: ProgressiveStream[]
  liveStreamCreatedAt: any
  transcripts: any[]
  prevMedia: any
  aspectRatio: number
  media: string
  adaptiveStreams: any[]
  liveStreamEndedAt: any
  duration: number
  entityUrn: string
  provider: string
  nextMedia: any
  trackingId: string
}>

type Thumbnail = GraphQLNode<{
  digitalmediaAsset: any
  attribution: any
  focalPoint: any
  artifacts: Artifact[]
  rootUrl: string
}>

type ProgressiveStream = GraphQLNode<{
  streamingLocations: StreamingLocation[]
  size: number
  bitRate: number
  width: number
  mediaType: string
  mimeType: any
  height: number
}>

type StreamingLocation = GraphQLNode<{
  url: string
  expiresAt: any
}>

type VectorImage = GraphQLNode<{
  digitalmediaAsset: string
  attribution: any
  focalPoint: any
  rootUrl: string
  artifacts: any[]
}>

type Conversation = GraphQLNode<{
  entityUrn: string
}>
