import axios from 'axios'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const toggleReaction = async (cookies, emoji: string, messageID: string, threadID: string) => {
  try {
    const parsedMessageId = messageID.split(':').pop().replace(/=/g, '%3D')
    const parsedThreadID = threadID.replace(/=/g, '%3D')
    const url = `https://www.linkedin.com/voyager/api/messaging/conversations/${parsedThreadID}/events/${parsedMessageId}`

    const headers = createRequestHeaders(cookies)
    const queryParams = { action: 'reactWithEmoji' }
    const payload = { emoji }

    const request = axios.create({
      paramsSerializer,
      withCredentials: true,
    })

    await request.post(url, payload, {
      params: queryParams,
      headers,
    })
  } catch (error) {
    console.log('[ERROR]', error)
  }
}
