import { SupportedReaction, texts } from '@textshq/platform-sdk'

const { USER_AGENT } = texts.constants

export const supportedReactions: Record<string, SupportedReaction> = {
  clap: { title: 'Clap', render: '👏' },
  like: { title: 'Like', render: '👍' },
  dislike: { title: 'Dislike', render: '👎' },
  smiling: { title: 'Smiling', render: '😊' },
  disappointed: { title: 'Disappointed', render: '😞' },
}

export const requestHeaders: Record<string, string> = {
  authority: 'www.linkedin.com',
  'x-restli-protocol-version': '2.0.0',
  'x-li-lang': 'en_US',
  'user-agent': USER_AGENT,
  accept: 'application/vnd.linkedin.normalized+json+2.1',
  'x-li-track': '{"clientVersion":"1.5.*","osName":"web","timezoneOffset":2,"deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  referer: 'https://www.linkedin.com/feed/?trk=guest_homepage-basic_nav-header-signin',
  'accept-encoding': 'gzip, deflate, br',
  'accept-language': 'en-US,en;q=0.9',
}

export const LinkedInURLs = {
  LOGIN: 'https://www.linkedin.com/login',
  LOGOUT: 'https://www.linkedin.com/logout',
  REALTIME: 'https://realtime.www.linkedin.com/realtime/connect',
  API_BASE: 'https://www.linkedin.com/voyager/api',
  API_CONVERSATIONS: 'https://www.linkedin.com/voyager/api/messaging/conversations',
  API_ME: 'https://www.linkedin.com/voyager/api/me',
}
