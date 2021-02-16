import { MessageContent } from '@textshq/platform-sdk'
import axios from 'axios'
import fs from 'fs'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const sendMessage = async (cookies, message: MessageContent, threadId: string) => {
  try {
    const headers = createRequestHeaders(cookies)
    const url = `https://www.linkedin.com/voyager/api/messaging/conversations/${threadId}/events`
    const queryParams = { action: 'create' }
    const attachments = []

    const request = axios.create({
      paramsSerializer,
      withCredentials: true,
    })

    if (message.mimeType) {
      const { data } = await request.post(
        'https://www.linkedin.com/voyager/api/voyagerMediaUploadMetadata',
        {
          fileSize: 2426,
          filename: 'image.png',
          mediaUploadType: 'MESSAGING_PHOTO_ATTACHMENT',
        },
        {
          params: { action: 'upload' },
          headers,
        },
      )

      const buffer = message.fileBuffer ?? fs.readFileSync(message.filePath)
      await request.put(
        data.data.value.singleUploadUrl,
        buffer,
        {
          headers: {
            ...headers,
            Connection: 'keep-alive',
            'sec-ch-ua': '"Chromium";v="88", "Google Chrome";v="88", ";Not A Brand";v="99"',
            'Content-Type': 'image/png',
            accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'sec-fetch-site': 'cross-site',
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-dest': 'image',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US',
          },
        },
      )

      attachments.push({
        id: data.data.value.urn,
        reference: { string: 'blob:https://www.linkedin.com/07bb3c11-4589-407a-bc1b-4c4c39ba9492' },
        mediaType: message.mimeType,
        byteSize: 1667,
        name: message.fileName,
      })
    }

    const payload = {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: {
              text: message.text ?? '',
              attributes: [],
            },
            attachments,
          },
        },
      },
      dedupeByClientGeneratedToken: false,
    }

    await request.post(url, payload, {
      params: queryParams,
      headers,
    })
  } catch (error) {
    throw new Error(error.message)
  }
}
