import got from 'got'

import { filterByType } from './helpers/filter-by-type'
import { createRequestHeaders } from './utils/headers'

export const getMessages = async (cookies, threadId: string) => {
  const headers = createRequestHeaders(cookies)
  // After 01 Jan 2020
  const url = `https://www.linkedin.com/voyager/api/messaging/conversations/${threadId}/events`

  const queryParams = { keyVersion: 'LEGACY_INBOX' }
  const { body } = await got(url, { headers, searchParams: queryParams })
  const res = JSON.parse(body)
  const { included = [] } = res

  const entities = filterByType(
    included,
    'com.linkedin.voyager.identity.shared.MiniProfile',
  )

  const events = filterByType(included, 'com.linkedin.voyager.messaging.Event')

  const members = filterByType(
    included,
    'com.linkedin.voyager.messaging.MessagingMember',
  )

  return {
    members,
    entities,
    events,
  }
}
