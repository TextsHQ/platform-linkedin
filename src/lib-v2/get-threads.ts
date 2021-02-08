import got from 'got'

import { parseConversationResponse } from './helpers/parse-conversation-response'
import { createRequestHeaders } from './utils/headers'

export const getThreads = async cookies => {
  const headers = createRequestHeaders(cookies)
  // After 01 Jan 2020
  const url = 'https://www.linkedin.com/voyager/api/messaging/conversations?createdAfter=1577847600000'

  const { body } = await got(url, { headers })
  const firstResponseParsed = parseConversationResponse(JSON.parse(body))

  return firstResponseParsed
    .sort(
      (a, b) => b?.conversation?.lastActivityAt - a?.conversation?.lastActivityAt,
    ).filter((x: any) => {
      const threadId = x?.conversation?.entityUrn?.split(':').pop()
      return Boolean(threadId)
    })
}
