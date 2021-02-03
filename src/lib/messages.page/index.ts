import puppeteer from 'puppeteer'
import got from 'got'
import { CookieJar } from 'tough-cookie'

import { LINKEDIN_BASE, LINKEDIN_CONVERSATIONS_ENDPOINT, THREADS_URL } from '../constants/linkedin'
import { parseConversationResponse } from './helpers/parse-conversation-response'
import { interceptThreadResponse, thread } from './intercept-thread-response'
import {
  interceptMessagesThreadsResponse,
  messagesThreads,
} from './intercept-threads-response'
import { scrollThroughMessages } from './scroll-through-messages'
import { scrollThroughThreads } from './scroll-through-threads'

const getAllConversationThreads = async (
  page: puppeteer.Page,
  maxThreads?: number,
): Promise<any> => {
  let firstConversationsRequest: puppeteer.Request
  let firstDate = 0

  await page.setRequestInterception(true)

  page.on('request', request => {
    // This is added because the first group of messages (first 20) comes
    // directly from server (it doesn't make any request to get them), so
    // this way we save the first request and then we can make a separated
    // request to get the first 20 messages threads.
    if (
      request.method() === 'GET'
      && request.url().includes(LINKEDIN_CONVERSATIONS_ENDPOINT)
      && request.url().includes('createdBefore')
    ) {
      const date = request.url().split('createdBefore=').pop()

      if (Number(date) > firstDate) {
        firstDate = Number(date)
        firstConversationsRequest = request
      }
    }

    request.continue()
  })

  page.on('response', interceptMessagesThreadsResponse)

  await page.goto(THREADS_URL)
  await scrollThroughThreads(page, maxThreads)
  // Intercepting the conversations API doesn't provide the first group of elements
  // (they already comes rendered from server). So we need to request them replacing
  // from the first API request the 'createdBefore' param to 'createAfter'.
  const cookies = (await page.cookies())
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join(';')

  const url = firstConversationsRequest.url().replace('createdBefore', 'createdAfter')
  const cookieJar = new CookieJar()
  await cookieJar.setCookie(cookies, LINKEDIN_BASE)

  const { body } = await got(url, {
    headers: { ...firstConversationsRequest.headers(), cookie: cookies },
    cookieJar,
  })

  const firstResponseParsed = parseConversationResponse(JSON.parse(body))

  await page.close()

  return [...firstResponseParsed, ...messagesThreads]
    .sort(
      (a, b) => b?.conversation?.lastActivityAt - a?.conversation?.lastActivityAt,
    ).filter((x: any) => {
      const threadId = x?.conversation?.entityUrn?.split(':').pop()
      return Boolean(threadId)
    })
}

const getThreadMessages = async (
  page: puppeteer.Page,
  threadId: string,
  maxMessages = 500,
): Promise<any> => {
  await page.setRequestInterception(true)
  page.on('request', request => request.continue())
  page.on('response', interceptThreadResponse)
  await page.goto(`${THREADS_URL}/thread/${threadId}`)

  await scrollThroughMessages(page)
  await page.goto(THREADS_URL)

  await page.close()
  return thread
}

const sendMessageToThread = async (
  page: puppeteer.Page,
  threadId: string,
  message: string,
): Promise<void> => {
  await page.goto(`${THREADS_URL}/thread/${threadId}`)

  const textareaClass = '.msg-form__contenteditable'

  await page.type(textareaClass, message)
  await page.type(textareaClass, String.fromCharCode(13))

  await page.close()
}

export const MessagesPage = {
  getAllConversationThreads,
  getThreadMessages,
  sendMessageToThread,
}
