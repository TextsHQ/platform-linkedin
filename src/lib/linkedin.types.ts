export type ParticipantsReceiptResponse = {
  data: Data
  included: any[]
}

type Data = {
  entityUrn: string
  elements: Element[]
  paging: Paging
  $type: string
}

type Element = {
  fromParticipant: string
  fromEntity: string
  seenReceipt: SeenReceipt
  $type: string
}

type SeenReceipt = {
  seenAt: number
  eventUrn: string
  $type: string
}

type Paging = {
  count: number
  start: number
  links: any[]
}
