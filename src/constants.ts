import { SupportedReaction } from "@textshq/platform-sdk";

export const supportedReactions: Record<string, SupportedReaction> = {
  heart: { title: 'Heart', render: '❤️' },
  like: { title: 'Like', render: '👍' },
  dislike: { title: 'Dislike', render: '👎' },
  laugh: { title: 'Laugh', render: '😂' },
  surprised: { title: 'Surprised', render: '😲' },
  cry: { title: 'Cry', render: '😢' },
  fire: { title: 'Lit', render: '🔥' },
  angry: { title: 'Angry', render: '😠' },
  mask: { title: 'Mask', render: '😷' },
}
