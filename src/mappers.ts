import { Thread, Message, CurrentUser, Participant, Paginated } from '@textshq/platform-sdk'

const mapParticipants = (linkedinParticipants: any[], entities: any[]): Paginated<Participant> => {
  const items = linkedinParticipants.reduce((prev, current) => {
    const participantId = current.split(',').pop().replace(')', '')
    const entity = entities.find(({ entityUrn }) => {
      const entityId = entityUrn.split(':').pop()
      return entityId === participantId
    })

    return [
      ...prev,
      {
        id: entity.publicIdentifier,
        username: `${entity.firstName} ${entity.lastName}`,
        fullName: `${entity.firstName} ${entity.lastName}`,
        isSelf: false,
      },
    ]
  }, [])

  return {
    items,
    hasMore: false,
  }
}

/**
 * Map LinkedIn Threads and converts them into Texts.com threads.
 *
 * @description It receives an array of linkedIn threads and then it
 *  parses them and converts them into Texts threads.
 * @param linkedInThreads
 * @returns {Threads[]}
 */
export const mapThreads = (linkedInThreads: any[]): Thread[] => {
  const threads = []
  const entities = linkedInThreads.map(({ entity: threadEntity }) => threadEntity)

  for (const thread of linkedInThreads) {
    const { entity, conversation } = thread

    const id = conversation?.entityUrn?.split(':').pop()
    const title: string = `${entity.firstName} ${entity.lastName}`
    const isUnread = true
    const type = 'single'
    const timestamp = new Date(conversation?.lastActivityAt)

    const messages = { items: [], hasMore: false }

    const conversationParticipants = conversation['*participants']
    const participants = mapParticipants(conversationParticipants, entities)

    threads.push({
      _original: JSON.stringify(thread),
      id,
      title: participants.items.length < 2 ? title : participants.items.map(({ fullName }) => fullName).join(','),
      isUnread,
      type,
      timestamp,
      messages,
      participants,
    })
  }

  return threads
}

export const mapMessage = (linkedInMessage: any, currentUserId: string = ''): Message => {
  const { attributedBody } = linkedInMessage.eventContent
  const membersId = linkedInMessage['*from'].split(':').pop()
  const senderID = membersId.split(',')[0].replaceAll('(', '')
  const sentBy = membersId.split(',').pop().replaceAll(')', '')

  return {
    _original: JSON.stringify(linkedInMessage),
    id: linkedInMessage.dashEntityUrn,
    timestamp: new Date(linkedInMessage.createdAt),
    text: attributedBody.text,
    attachments: [],
    reactions: [],
    senderID,
    isSender: currentUserId === sentBy,
  }
}

export const mapCurrentUser = (linkedInCurrentUser: any): CurrentUser => {
  const { dmp } = linkedInCurrentUser.id
  const id = dmp.split('&v')[0]

  return {
    id,
    username: linkedInCurrentUser.userName,
    displayText: linkedInCurrentUser.userName,
  }
}
