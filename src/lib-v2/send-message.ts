import axios from 'axios'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const sendMessage = async (cookies, message: string, threadId: string) => {
  try {
    const headers = createRequestHeaders(cookies)
    const url = `https://www.linkedin.com/voyager/api/messaging/conversations/${threadId}/events`
    const queryParams = { action: 'create' }

    const payload = {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: {
              text: message,
              attributes: [],
            },
            attachments: [],
          },
        },
      },
      dedupeByClientGeneratedToken: false,
    }

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
