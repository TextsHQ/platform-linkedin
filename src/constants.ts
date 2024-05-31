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
  FEED_ACTIVITY: 'https://www.linkedin.com/feed/update',
  API_BASE: 'https://www.linkedin.com/voyager/api',
  API_BASE_GRAPHQL: 'https://www.linkedin.com/voyager/api/graphql',
  API_MESSAGING: 'https://www.linkedin.com/voyager/api/messaging',
  API_MESSAGES: 'https://www.linkedin.com/voyager/api/voyagerMessagingDashMessengerMessages',
  API_CONVERSATIONS: 'https://www.linkedin.com/voyager/api/messaging/conversations',
  API_CONVERSATIONS_API: 'https://www.linkedin.com/voyager/api/voyagerMessagingDashMessengerConversations',
  API_MESSAGING_GRAPHQL: 'https://www.linkedin.com/voyager/api/voyagerMessagingGraphQL/graphql',
  API_ME: 'https://www.linkedin.com/voyager/api/me',
}

export const GraphQLRecipes = {
  messages: {
    getMessagesByAnchorTimestamp: 'messengerMessages.8078e691076ceb6cef7a35504dae2390',
    getReactionParticipantsByMessageAndEmoji: 'messengerMessagingParticipants.d8df65a2f55f270ced7e37ff2fafc8c8',
  },
  conversations: {
    getById: 'messengerConversations.766c30b60a40d2035453432f30aa03ce',
    getByCategory: 'messengerConversations.14df23fcfbc2bacf529fc58e63a4ab5e',
    getSeenReceipts: 'messengerSeenReceipts.f0584c34fe9377608527e1507a1204a2',
  },
}

export const GraphQLHeaders = {
  dnt: '1',
  accept: 'application/graphql',
}

export const LinkedInAPITypes = {
  miniProfile: 'com.linkedin.voyager.identity.shared.MiniProfile',
  conversation: 'com.linkedin.voyager.messaging.Conversation',
  member: 'com.linkedin.voyager.messaging.MessagingMember',
  event: 'com.linkedin.voyager.messaging.Event',
}

export const enum Topic {
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

export const entitiesPrefix = {
  messages: {
    graphql: 'urn:li:messagingMessage',
  },
}
