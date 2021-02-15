import { MessageContent } from '@textshq/platform-sdk'
import FormData from 'form-data'
import axios from 'axios'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const sendMessage = async (cookies, message: MessageContent, threadId: string) => {
  try {
    const headers = createRequestHeaders(cookies)
    const url = `https://www.linkedin.com/voyager/api/messaging/conversations/${threadId}/events`
    const queryParams = { action: 'create' }
    const attachments = []

    if (message.mimeType) {
      // const form = new FormData()
      // form.append('file', message.fileBuffer.toString())

      // const fileUploadResponse = await axios.post(
      //   'https://www.linkedin.com/voyager/api/voyagerMediaUploadMetadata',
      //   {
      //     params: { action: 'upload' },
      //     headers,
      //     data: {
      //       fileSize: 2426,
      //       filename: 'image.png',
      //       mediaUploadType: 'MESSAGING_PHOTO_ATTACHMENT',
      //       ...form,
      //     },
      //     withCredentials: true,
      //   },
      // )

      // console.log({ fileUploadResponse })

      attachments.push({
        id: 'urn:li:digitalmediaAsset:C4D06AQG3e0b_TcOgrg',
        mediaType: message.mimeType,
        reference: { string: `${message.fileBuffer.toString('base64')}` },
      })
    }

    const payload = {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: {
              text: message.text,
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
    throw new Error(error.message)
  }
}
