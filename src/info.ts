import { PlatformInfo, MessageDeletionMode, Attribute } from '@textshq/platform-sdk'

import { supportedReactions, LinkedInURLs, LinkedInAuthCookieName } from './constants'

const { LOGIN } = LinkedInURLs

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
  brand: {
    background: '#006699',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 48 48">
    <path fill="black" fill-rule="evenodd" d="M16.126 39V18.758H9.398V39h6.728Zm-3.364-23.006c2.346 0 3.806-1.554 3.806-3.496C16.524 10.51 15.108 9 12.806 9 10.505 9 9 10.511 9 12.498c0 1.942 1.46 3.496 3.718 3.496h.044ZM19.849 39h6.728V27.696c0-.605.043-1.21.221-1.642.486-1.208 1.593-2.46 3.452-2.46 2.435 0 3.408 1.856 3.408 4.577v10.83h6.728V27.393c0-6.218-3.32-9.11-7.746-9.11-3.63 0-5.223 2.028-6.108 3.41h.045v-2.936h-6.728c.088 1.9 0 20.242 0 20.242Z" clip-rule="evenodd"/>
    </svg>`,
  },
  typingDurationMs: 6_000,
  reactions: {
    supported: supportedReactions,
    canReactWithAllEmojis: true,
    allowsMultipleReactionsToSingleMessage: true,
  },
  loginMode: 'browser',
  browserLogin: {
    url: LOGIN,
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
    gifMimeType: 'image/gif',
  },
  notifications: {
    android: {
      senderID: '789113911969',
    },
  },
  deletionMode: MessageDeletionMode.DELETE_FOR_EVERYONE,
  attributes: new Set([
    Attribute.SUPPORTS_MARK_AS_UNREAD,
    Attribute.SUPPORTS_DELETE_THREAD,
    Attribute.SUPPORTS_REQUESTS_INBOX,
    Attribute.SUPPORTS_ARCHIVE,
    Attribute.SUPPORTS_EDIT_MESSAGE,
    Attribute.SUPPORTS_PRESENCE,
    Attribute.SUBSCRIBE_TO_THREAD_SELECTION,
    Attribute.SUBSCRIBE_TO_ONLINE_OFFLINE_ACTIVITY,
    Attribute.SUPPORTS_PUSH_NOTIFICATIONS,
    Attribute.SINGLE_THREAD_CREATION_REQUIRES_MESSAGE,
    Attribute.GROUP_THREAD_CREATION_REQUIRES_MESSAGE,
    Attribute.SUPPORTS_QUOTED_MESSAGES,
  ]),
  getUserProfileLink: ({ id }) => `https://www.linkedin.com/in/${id}/`,
  prefs: {
    showMyNetwork: {
      label: 'Show LinkedIn My Network as a thread',
      type: 'checkbox',
      default: false,
    },
  },
}

export default info
