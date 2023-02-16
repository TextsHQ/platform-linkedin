import type { Thumbnail } from './attachments'
import type { GraphQLResponse, GraphQLNode, PaginatedMetadata } from './graphql'
import type { ConversationParticipant } from './users'

export type MessagesGraphQLResponse = GraphQLResponse<MessagesByConversation | MessagesByAnchorTimestamp>

export type MessagesByConversation = GraphQLNode<{
  'messengerMessagesByConversation': ConversationMessages
}>

export type MessagesByAnchorTimestamp = GraphQLNode<{
  'messengerMessagesByAnchorTimestamp': ConversationMessages
}>

export type ReactionsByMessageAndEmoji = GraphQLResponse<GraphQLNode<{
  'messengerMessagingParticipantsByMessageAndEmoji': MessageReactions
}>>

type MessageReactions = GraphQLNode<{
  elements: ConversationParticipant[]
}>

type ConversationMessages = GraphQLNode<{
  metadata: PaginatedMetadata
  elements: GraphQLMessage[]
}>

export type RichReaction = Reaction & {
  participant: ConversationParticipant
}

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
  sender: ConversationParticipant
  backendConversationUrn: string
  messageBodyRenderFormat: string
  renderContent: RenderContent[]
  conversation: Conversation
}>

export type ExtendedGraphQLMessage = GraphQLMessage & { reactions?: RichReaction[] }

export const isExtendedGraphQLMessage = (a: ExtendedGraphQLMessage | GraphQLMessage): a is ExtendedGraphQLMessage => !!(a as ExtendedGraphQLMessage).reactions

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

type RenderContent = GraphQLNode<{
  videoMeeting: any
  awayMessage: any
  conversationAdsMessageContent: any
  file?: File
  externalMedia: ExternalMedia
  messageAdRenderContent: any
  video?: Video
  audio?: Audio
  forwardedMessageContent: any
  hostUrnData: HostUrnData
  vectorImage?: VectorImage
}>

export type HostUrnData = GraphQLNode<{
  type: 'FEED_UPDATE' | string
  hostUrn: string
}>

type Media = GraphQLNode<{
  originalHeight: number
  originalWidth: number
  url: string
}>

type ExternalMedia = GraphQLNode<{
  media: Media
  title: string
  entityUrn: string
  previewMedia: Media
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

type Audio = GraphQLNode<{
  duration: number
  url: string
}>

type File = GraphQLNode<{
  assetUrn: string
  byteSize: number
  name: string
  mediaType: string
  url: string
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
