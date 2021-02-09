import axios from 'axios'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const markMessageAsRead = async (cookies, threadID: string) => {
  try {
    const headers = createRequestHeaders(cookies)

    const parsedThreadID = threadID.replace(/=/g, '%3D')
    const url = `https://www.linkedin.com/voyager/api/messaging/conversations/${parsedThreadID}`

    const payload = { patch: { $set: { read: true } } }

    const request = axios.create({
      paramsSerializer,
      withCredentials: true,
    })

    await request.post(url, payload, { headers })
  } catch (error) {
    console.log('[ERROR]', error)
  }
}
