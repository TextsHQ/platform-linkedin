import type { Thumbnail } from './attachments'
import type { GraphQLNode } from './graphql'

export type ConversationParticipant = GraphQLNode<{
  hostIdentityUrn: string
  entityUrn: string
  participantType: ParticipantType
  backendUrn: string
}>

type ParticipantType = GraphQLNode<{
  member: Member
  custom: Custom
  organization: Organization
}>

type Name = GraphQLNode<{ attributes: unknown, text: string }>

type Organization = GraphQLNode<{
  /** TODO: define more types */
  pageType: 'COMPANY' | string
  name: Name
  tagline: Name | null
  logo: Thumbnail
}>

type Custom = GraphQLNode<{
  name: Name
  image: Thumbnail
  rootUrl: never
}>

type Member = GraphQLNode<{
  profileUrl: string
  firstName: FirstName
  lastName: LastName
  profilePicture: Thumbnail
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

type Headline = GraphQLNode<{
  attributes: any[]
  text: string
}>
