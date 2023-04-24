import type { GraphQLNode } from './graphql'

export type Artifact = GraphQLNode<{
  width: number
  fileIdentifyingUrlPathSegment: string
  height: number
}>

export type VectorImage = GraphQLNode<{
  digitalmediaAsset: any
  attribution: any
  focalPoint: any
  artifacts: Artifact[]
  rootUrl: string
}>

export type Thumbnail = VectorImage
