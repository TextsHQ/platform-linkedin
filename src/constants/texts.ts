import { SupportedReaction } from '@textshq/platform-sdk'

export const supportedReactions: Record<string, SupportedReaction> = {
  clap: { title: 'Clap', render: '👏' },
  like: { title: 'Like', render: '👍' },
  dislike: { title: 'Dislike', render: '👎' },
  smiling: { title: 'Smiling', render: '😊' },
  disappointed: { title: 'Disappointed', render: '😞' },
}
