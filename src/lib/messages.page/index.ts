import puppeteer from 'puppeteer'
import got from 'got'

import { LINKEDIN_API_BASE, LINKEDIN_CONVERSATIONS_ENDPOINT, THREADS_URL } from '../constants/linkedin'
import { parseConversationResponse } from './helpers/parse-conversation-response'
import { filterByType } from './helpers/filter-by-type'

const getAllConversationThreads = async (request: puppeteer.Request, cookies: string): Promise<any> => {
  // After 01 Jan 2020
  const url = 'https://www.linkedin.com/voyager/api/messaging/conversations?createdAfter=1577847600000'
  const { body } = await got(url, {
    headers: { ...request.headers(), cookie: cookies },
  })

  const firstResponseParsed = parseConversationResponse(JSON.parse(body))

  return [...firstResponseParsed]
    .sort(
      (a, b) => b?.conversation?.lastActivityAt - a?.conversation?.lastActivityAt,
    ).filter((x: any) => {
      const threadId = x?.conversation?.entityUrn?.split(':').pop()
      return Boolean(threadId)
    })
}

const getThreadMessages = async (
  { request, cookies }: { request: puppeteer.Request; cookies: string; },
  threadId: string,
  maxMessages = 500,
): Promise<any> => {
  const url = `${LINKEDIN_API_BASE}/voyager/${LINKEDIN_CONVERSATIONS_ENDPOINT}/${threadId}/events?q=syncToken`
  const { body } = await got(url, {
    headers: { ...request.headers(), cookie: cookies },
  })

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

const sendMessageToThread = async (
  { request, cookies }: { request: puppeteer.Request; cookies: string; },
  threadId: string,
  message: string,
): Promise<void> => {
  const url = `${LINKEDIN_API_BASE}/voyager/${LINKEDIN_CONVERSATIONS_ENDPOINT}/${threadId}/events?action=create`

  await got.post(url, {
    body: JSON.stringify({ eventCreate: { originToken: '007566e0-fea4-490f-abbd-b137669528d3', value: { 'com.linkedin.voyager.messaging.create.MessageCreate': { attributedBody: { text: message, attributes: [] }, attachments: [] } }, trackingId: '8\u001cw¤¢Óë\u001f3\u0000ð4\u0011ý' }, dedupeByClientGeneratedToken: false }),
    headers: { ...request.headers(), cookie: cookies },
  })
}

export const MessagesPage = {
  getAllConversationThreads,
  getThreadMessages,
  sendMessageToThread,
}
