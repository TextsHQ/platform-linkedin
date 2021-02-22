/**
 * @param data
 * @param type
 * @returns {any[]}
 */
export const filterByType = (data: any[], type: string): any[] => data.filter(({ $type }) => $type === type)

export const parseConversationResponse = (response): any[] => {
  const { included = [] } = response

  const entities = filterByType(
    included,
    'com.linkedin.voyager.identity.shared.MiniProfile',
  )

  const conversations = filterByType(
    included,
    'com.linkedin.voyager.messaging.Conversation',
  )

  const messagingMembers = filterByType(
    included,
    'com.linkedin.voyager.messaging.MessagingMember',
  )

  const allMessages = filterByType(
    included,
    'com.linkedin.voyager.messaging.Event',
  )

  const parsedData = entities.reduce((prev, current) => {
    const entityId = current?.entityUrn.split(':').pop()

    const conversation = conversations.find(receivedConversation => receivedConversation['*participants'].some(participant =>
      participant.includes(entityId)))

    const messagingMember = messagingMembers.find(member => member.entityUrn.includes(entityId))
    const messages = allMessages.filter(message => message['*from'].includes(entityId))

    const currentData = {
      entity: current,
      messagingMember,
      conversation,
      messages,
    }

    return [...prev, currentData]
  }, [])

  return parsedData
}
