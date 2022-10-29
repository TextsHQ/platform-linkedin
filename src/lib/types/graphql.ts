export type GraphQLResponse<Payload = unknown> = {
  data: GraphQLNode<Payload>
}

export type GraphQLNode<T = unknown> = {
  _recipeType: string
  _type: string
} & T

export type PaginatedMetadata = {
  nextCursor: null | string
  prevCursor: null | string
}
