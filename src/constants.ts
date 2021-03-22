import { SupportedReaction, texts } from '@textshq/platform-sdk'

const { USER_AGENT } = texts.constants

export const supportedReactions: Record<string, SupportedReaction> = {
  '👏': { title: 'Clap', render: '👏' },
  '👍': { title: 'Like', render: '👍' },
  '👎': { title: 'Dislike', render: '👎' },
  '😊': { title: 'Smiling', render: '😊' },
  '😞': { title: 'Disappointed', render: '😞' },
}

export const REQUEST_HEADERS: Record<string, string> = {
  authority: 'www.linkedin.com',
  'x-restli-protocol-version': '2.0.0',
  'x-li-lang': 'en_US',
  'user-agent': USER_AGENT,
  accept: 'application/vnd.linkedin.normalized+json+2.1',
  'x-li-track': '{"clientVersion":"1.5.*","osName":"web","timezoneOffset":2,"deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  referer: 'https://www.linkedin.com/',
  'accept-encoding': 'gzip, deflate, br',
  'accept-language': 'en-US,en;q=0.9',
}

export const LinkedInAuthCookieName = 'li_at'

export const LinkedInURLs = {
  HOME: 'https://www.linkedin.com/',
  LOGIN: 'https://www.linkedin.com/login',
  LOGOUT: 'https://www.linkedin.com/logout',
  REALTIME: 'https://realtime.www.linkedin.com/realtime/connect',
  API_BASE: 'https://www.linkedin.com/voyager/api',
  API_CONVERSATIONS: 'https://www.linkedin.com/voyager/api/messaging/conversations',
  API_ME: 'https://www.linkedin.com/voyager/api/me',
}

export const LinkedInAPITypes = {
  miniProfile: 'com.linkedin.voyager.identity.shared.MiniProfile',
  conversation: 'com.linkedin.voyager.messaging.Conversation',
  member: 'com.linkedin.voyager.messaging.MessagingMember',
  event: 'com.linkedin.voyager.messaging.Event',
}
