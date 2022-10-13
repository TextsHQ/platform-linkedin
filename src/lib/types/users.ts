import type { Artifact } from './attachments'
import type { GraphQLNode } from './graphql'

export type ConversationParticipant = GraphQLNode<{
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

type Headline = GraphQLNode<{
  attributes: any[]
  text: string
}>
