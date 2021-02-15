import axios from 'axios'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const toggleTypingState = async (cookies, threadID:string): Promise<void> => {
  try {
    const url = 'https://www.linkedin.com/voyager/api/messaging/conversations'

    const headers = createRequestHeaders(cookies)
    const queryParams = { action: 'typing' }
    const payload = { conversationId: threadID }

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
