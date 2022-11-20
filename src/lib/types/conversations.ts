import type { GraphQLNode, GraphQLResponse, PaginatedMetadata } from './graphql'
import type { GraphQLMessage } from './messages'
import type { ConversationParticipant } from './users'

export type NewConversationResponse = {
  data: {
    value: {
      createdAt: number
      eventUrn: string
      backendEventUrn: string
      conversationUrn: string
      backendConversationUrn: string
      $type: string
    }
    $type: 'com.linkedin.restli.common.ActionResponse'
  }
  included: unknown[]
}

export type ConversationByIdGraphQLResponse = GraphQLResponse<ConversationById>

export type ConversationsByCategoryGraphQLResponse = GraphQLResponse<GraphQLNode<{
  'messengerConversationsByCategory': {
    elements: GraphQLConversation[]
    metadata: PaginatedMetadata
  }
}>>

export type SeenReceiptGraphQLResponse = GraphQLResponse<GraphQLNode<{
  'messengerSeenReceiptsByConversation': {
    elements: SeenReceipt[]
  }
}>>

export type SeenReceipt = GraphQLNode<{
  seenAt: number
  message: GraphQLNode<{ entityUrn: string }>
  seenByParticipant: ConversationParticipant
}>

type ConversationById = GraphQLNode<{
  messengerConversationsById: GraphQLConversation
}>

type DisabledFeature = {
  disabledFeature: string
  reasonText: string
}

export type GraphQLConversation = GraphQLNode<{
  disabledFeatures: GraphQLNode<DisabledFeature>[]
  notificationStatus: string
  creator: ConversationParticipant
  read: boolean
  groupChat: boolean
  _type: string
  conversationParticipants: ConversationParticipant[]
  unreadCount: number
  lastActivityAt: number
  contentMetadata: unknown
  _recipeType: string
  title: string | null
  backendUrn: string
  conversationUrl: string
  shortHeadlineText: string | null
  headlineText: string | null
  createdAt: number
  lastReadAt: number
  hostConversationActions: unknown[]
  entityUrn: string
  messages: GraphQLNode<{ elements: GraphQLMessage[] }>
  categories: string[]
  conversationTypeText: string | null
  state: string | null
}>
