import got from 'got'
import { createRequestHeaders } from './utils/headers'

export const getCurrentUser = async cookies => {
  try {
    const headers = createRequestHeaders(cookies)
    const url = 'https://www.linkedin.com/voyager/api/me'

    const { body } = await got(url, { headers })
    const response = JSON.parse(body)

    const miniProfile = response?.included?.find(r => r.$type === 'com.linkedin.voyager.identity.shared.MiniProfile')
    return miniProfile
  } catch (error) {
    console.log('[ERROR]', error)
  }
}
