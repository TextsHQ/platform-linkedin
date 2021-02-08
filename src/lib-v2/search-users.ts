import axios from 'axios'

import { createRequestHeaders } from './utils/headers'
import { paramsSerializer } from './utils/paramsSerializer'

export const searchUsers = async (cookies, keyword: string): Promise<any[]> => {
  try {
    const headers = createRequestHeaders(cookies)
    const url = 'https://www.linkedin.com/voyager/api/voyagerMessagingTypeaheadHits'
    const params = {
      keyword,
      q: 'typeaheadKeyword',
      types: 'List(CONNECTIONS,GROUP_THREADS,PEOPLE,COWORKERS)',
    }

    const request = axios.create({
      paramsSerializer,
      withCredentials: true,
    })

    const { data } = await request.get(url, {
      headers: {
        ...headers,
        referer: 'https://www.linkedin.com/messaging/thread/new/',
      },
      params,
    })

    return data?.included ?? []
  } catch (error) {
    console.log('[ERROR]', error)
  }
}
