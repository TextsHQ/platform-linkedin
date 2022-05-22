import { PlatformInfo, MessageDeletionMode, Attribute } from '@textshq/platform-sdk'

import { supportedReactions, LinkedInURLs, LinkedInAuthCookieName } from './constants'

const { LOGIN: loginURL } = LinkedInURLs

const icon = (
  `<svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="16" height="16" rx="5" fill="#006699"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M5.37526 13V6.25267H3.13257V13H5.37526ZM4.25391 5.33144C5.03598 5.33144 5.52275 4.81332 5.52275 4.16582C5.50818 3.50374 5.03598 3 4.26874 3C3.50159 3 3 3.50374 3 4.16582C3 4.81332 3.48667 5.33144 4.23929 5.33144H4.25391Z" fill="white"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M6.61621 13H8.85888V9.23201C8.85888 9.03035 8.87345 8.82889 8.93267 8.68474C9.0948 8.28182 9.46381 7.86453 10.0834 7.86453C10.8949 7.86453 11.2195 8.48328 11.2195 9.39034V13H13.462V9.13118C13.462 7.0587 12.3556 6.09434 10.8801 6.09434C9.6702 6.09434 9.13906 6.77059 8.84396 7.23121H8.85894V6.25267H6.61627C6.6457 6.88579 6.61621 13 6.61621 13Z" fill="white"/>
  </svg>`
)

const info: PlatformInfo = {
  name: 'linkedin',
  version: '0.0.1',
  displayName: 'LinkedIn',
  icon,
  typingDurationMs: 3000,
  reactions: {
    supported: supportedReactions,
    canReactWithAllEmojis: true,
    allowsMultipleReactionsToSingleMessage: true,
  },
  loginMode: 'browser',
  browserLogin: {
    loginURL,
    authCookieName: LinkedInAuthCookieName,
  },
  attachments: {
    // https://www.linkedin.com/help/linkedin/answer/53703/attaching-files-and-images-to-linkedin-messages
    // "The combined file sizes cannot exceed 20 MB."
    maxSize: {
      image: 20 * 1024 * 1024,
      video: 20 * 1024 * 1024,
      audio: 20 * 1024 * 1024,
      files: 20 * 1024 * 1024,
    },
  },
  deletionMode: MessageDeletionMode.DELETE_FOR_EVERYONE,
  attributes: new Set([
    Attribute.NO_CACHE,
    Attribute.SUPPORTS_MARK_AS_UNREAD,
    Attribute.SUPPORTS_DELETE_THREAD,
    Attribute.SUPPORTS_REQUESTS_INBOX,
    Attribute.SUPPORTS_ARCHIVE,
    Attribute.SUPPORTS_DELETE_THREAD,
    Attribute.SUPPORTS_EDIT_MESSAGE,
    Attribute.SUPPORTS_PRESENCE,
    Attribute.SUBSCRIBE_TO_THREAD_SELECTION,
    Attribute.SUBSCRIBE_TO_ONLINE_OFFLINE_ACTIVITY,
  ]),
  getUserProfileLink: ({ username }) => username && `https://www.linkedin.com/in/${username}`,
}

export default info
