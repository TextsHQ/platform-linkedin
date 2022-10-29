import type { GraphQLNode, GraphQLResponse } from './graphql'
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

type ConversationById = GraphQLNode<{
  messengerConversationsById: GraphQLConversation
}>

export type GraphQLConversation = GraphQLNode<{
  disabledFeatures: GraphQLNode<{ disabledFeature: string, reasonText: any }>[]
  notificationStatus: string
  creator: ConversationParticipant
  read: boolean
  groupChat: boolean
  _type: string
  conversationParticipants: ConversationParticipant[]
  unreadCount: number
  lastActivityAt: number
  contentMetadata: any
  _recipeType: string
  title: any
  backendUrn: string
  conversationUrl: string
  shortHeadlineText: any
  headlineText: any
  createdAt: number
  lastReadAt: any
  hostConversationActions: any[]
  entityUrn: string
  messages: GraphQLNode<{ elements: GraphQLMessage[] }>
  categories: string[]
  conversationTypeText: any
  state: any
}>
