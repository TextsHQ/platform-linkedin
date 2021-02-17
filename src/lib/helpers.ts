import { castArray, isArray, isPlainObject, mapValues, reduce } from 'lodash'
import { stringify } from 'querystring'

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

  const parsedData = entities.reduce((prev, current) => {
    const entityId = current?.entityUrn.split(':').pop()

    const conversation = conversations.find(receivedConversation => receivedConversation['*participants'].some(participant =>
      participant.includes(entityId)))

    const messagingMember = messagingMembers.find(member => member.entityUrn.includes(entityId))

    const currentData = {
      entity: current,
      messagingMember,
      conversation,
    }

    return [...prev, currentData]
  }, [])

  return parsedData
}

/**
 * @param cookies
 * @returns {Record<string, string>}
 */
export const createRequestHeaders = (cookies): Record<string, string> => {
  const parsedCookies = cookies.reduce((prev, current) => ({
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

/**
 * This is from the LinkedIn Private module created by Eilon Mor <eilonmore>
 *
 * @see https://github.com/eilonmore/linkedin-private-api
 */
const encodeFilter = (value: string | string[], key: string) => encodeURIComponent(`${key}->${castArray(value).join('|')}`)

export const paramsSerializer = (params: Record<string, string | Record<string, string>>): string => {
  const encodedParams = mapValues(params, value => {
    if (!isArray(value) && !isPlainObject(value)) {
      return value.toString()
    }

    if (isArray(value)) {
      return `List(${value.join(',')})`
    }

    const encodedList = reduce(
      value as Record<string, string>,
      (res, filterVal, filterKey) => `${res}${res ? ',' : ''}${encodeFilter(filterVal, filterKey)}`,
      '',
    )

    return `List(${encodedList})`
  })

  return stringify(encodedParams, undefined, undefined, {
    encodeURIComponent: uri => uri,
  })
}

