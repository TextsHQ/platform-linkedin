import axios from 'axios'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const createThread = async (cookies, message: string, profileIds: string[]) => {
  try {
    const headers = createRequestHeaders(cookies)
    const url = 'https://www.linkedin.com/voyager/api/messaging/conversations'
    const queryParams = { action: 'create' }

    const payload = {
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: {
                text: '',
                attributes: [],
              },
              attachments: [],
            },
          },
        },
        recipients: profileIds,
        subtype: 'MEMBER_TO_MEMBER',
      },
    }

    const request = axios.create({
      paramsSerializer,
      withCredentials: true,
    })

    const { data } = await request.post(url, payload, {
      params: queryParams,
      headers,
    })

    return data?.data?.value
  } catch (error) {
    console.log('[ERROR]', error)
  }
}
