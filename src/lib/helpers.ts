import { filter, find, groupBy } from 'lodash'
import { LinkedInAPITypes } from '../constants'

export const parseConversationResponse = (response): any[] => {
  const { included = [] } = response
  const grouped = groupBy(included, '$type')

  const {
    miniProfile: miniProfileType,
    conversation: conversationType,
    member: memberType,
    event: eventType,
  } = LinkedInAPITypes

  const {
    [miniProfileType]: profiles = [],
    [conversationType]: allConversations = [],
    [memberType]: members = [],
    [eventType]: allMessages = [],
  } = grouped

  return allConversations?.map(conversation => {
    const firstParticipant = conversation['*participants'][0] || ''

    const entityId = firstParticipant?.split(',').pop().replace(')', '')
    const entity = find(profiles, p => p?.entityUrn.includes(entityId)) || {}

    // const conversation = find(allConversations, c => c['*participants'].some(participant => participant.includes(entityId))) || {}
    const messagingMember = find(members, m => m.entityUrn.includes(entityId)) || {}
    const messages = filter(allMessages, e => e['*from'].includes(entityId)) || []

    return {
      entity,
      conversation,
      messagingMember,
      messages,
    }
  })
}
