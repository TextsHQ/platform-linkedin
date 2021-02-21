import { reduce } from 'lodash'
import { CookieJar } from 'tough-cookie'

import { requestHeaders } from '../constants'

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

/**
 * @param cookies
 * @returns {Record<string, string>}
 */
export const createRequestHeaders = (cookieJar: CookieJar): Record<string, string> => {
  const { cookies = [] } = { ...cookieJar.toJSON() }

  const parsedCookies: any = cookies.reduce((prev, current) => ({
    ...prev,
    // This is done to be sure that the cookies doesn't have the quotes (""). For some reason
    // some of the LinkedIn cookies comes with the quotes and other without them
    [current.key]: current.value.replace(/"/g, ''),
  }), {})
  const cookieString = reduce(parsedCookies, (res, v, k) => `${res}${k}="${v}"; `, '')

  return {
    ...requestHeaders,
    'csrf-token': parsedCookies.JSESSIONID!,
    cookie: cookieString,
  }
}
