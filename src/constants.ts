import type { SupportedReaction } from '@textshq/platform-sdk'

export const supportedReactions: Record<string, SupportedReaction> = {
  '👏': { title: 'Clap', render: '👏' },
  '👍': { title: 'Like', render: '👍' },
  '👎': { title: 'Dislike', render: '👎' },
  '😊': { title: 'Smiling', render: '😊' },
  '😞': { title: 'Disappointed', render: '😞' },
}

export const LinkedInAuthCookieName = 'li_at'

export const LinkedInURLs = {
  HOME: 'https://www.linkedin.com/',
  FEED: 'https://www.linkedin.com/feed/',
  LOGIN: 'https://www.linkedin.com/login',
  LOGOUT: 'https://www.linkedin.com/logout',
  REALTIME: 'https://realtime.www.linkedin.com/realtime/connect',
  API_BASE: 'https://www.linkedin.com/voyager/api',
  API_MESSAGING: 'https://www.linkedin.com/voyager/api/messaging',
  API_CONVERSATIONS: 'https://www.linkedin.com/voyager/api/messaging/conversations',
  API_ME: 'https://www.linkedin.com/voyager/api/me',
}

export const LinkedInAPITypes = {
  miniProfile: 'com.linkedin.voyager.identity.shared.MiniProfile',
  conversation: 'com.linkedin.voyager.messaging.Conversation',
  member: 'com.linkedin.voyager.messaging.MessagingMember',
  event: 'com.linkedin.voyager.messaging.Event',
}

export enum Topic {
  conversationsTopic = 'urn:li-realtime:conversationsTopic:urn:li-realtime:myself',
  messageSeenReceiptsTopic = 'urn:li-realtime:messageSeenReceiptsTopic:urn:li-realtime:myself',
  messagesTopic = 'urn:li-realtime:messagesTopic:urn:li-realtime:myself',
  replySuggestionTopicV2 = 'urn:li-realtime:replySuggestionTopicV2:urn:li-realtime:myself',
  tabBadgeUpdateTopic = 'urn:li-realtime:tabBadgeUpdateTopic:urn:li-realtime:myself',
  typingIndicatorsTopic = 'urn:li-realtime:typingIndicatorsTopic:urn:li-realtime:myself',
  invitationsTopic = 'urn:li-realtime:invitationsTopic:urn:li-realtime:myself',
  inAppAlertsTopic = 'urn:li-realtime:inAppAlertsTopic:urn:li-realtime:myself',
  messageReactionSummariesTopic = 'urn:li-realtime:messageReactionSummariesTopic:urn:li-realtime:myself',
  socialPermissionsPersonalTopic = 'urn:li-realtime:socialPermissionsPersonalTopic:urn:li-realtime:myself',
  jobPostingPersonalTopic = 'urn:li-realtime:jobPostingPersonalTopic:urn:li-realtime:myself',
  messagingProgressIndicatorTopic = 'urn:li-realtime:messagingProgressIndicatorTopic:urn:li-realtime:myself',
  messagingDataSyncTopic = 'urn:li-realtime:messagingDataSyncTopic:urn:li-realtime:myself,',
}
