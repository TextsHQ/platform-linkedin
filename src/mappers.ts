import { Thread, Message, CurrentUser, Participant, User, MessageReaction, MessageAttachment, MessageAttachmentType, MessageLink, MessagePreview, TextAttributes, TextEntity, texts } from '@textshq/platform-sdk'
import { orderBy, groupBy } from 'lodash'

import { LinkedInAPITypes } from './constants'
import { urnID, getFeedUpdateURL, getParticipantID } from './util'

export const mapConversationsResponse = (liResponse: any): Record<string, any>[] => {
  if (!liResponse) return []

  const { included = [] } = liResponse
  const grouped = groupBy(included, '$type')

  const {
    miniProfile: miniProfileType,
    conversation: conversationType,
    member: memberType,
    event: eventType,
  } = LinkedInAPITypes

  const {
    [miniProfileType]: profiles = [],
    [conversationType]: allConversations = [],
    [memberType]: members = [],
    [eventType]: allMessages = [],
  } = grouped

  const conversations = []

  for (const conversation of allConversations) {
    const firstParticipant = conversation['*participants']?.[0] || ''
    const entityId = getParticipantID(firstParticipant)

    const entity = profiles.find(p => p?.entityUrn.includes(entityId)) || {}
    const messagingMember = members.find(m => m.entityUrn.includes(entityId)) || {}
    const messages = allMessages.filter(e => e['*from'].includes(entityId)) || []

    if (entityId !== 'UNKNOWN') {
      conversations.push({
        entity,
        conversation,
        messagingMember,
        messages,
      })
    }
  }

  return conversations
}

const mapPicture = (liMiniProfile: any): string | undefined => (liMiniProfile?.picture?.rootUrl
  ? liMiniProfile?.picture?.rootUrl + liMiniProfile?.picture?.artifacts[0]?.fileIdentifyingUrlPathSegment
  : undefined)

export const mapMiniProfile = (liMiniProfile: any): User =>
  (liMiniProfile ? {
    id: urnID(liMiniProfile.entityUrn),
    username: liMiniProfile.publicIdentifier,
    fullName: [liMiniProfile.firstName, liMiniProfile.lastName].filter(Boolean).join(' '),
    imgURL: mapPicture(liMiniProfile),
  } : undefined)

export const mapCurrentUser = (liCurrentUser: any): CurrentUser => ({
  ...mapMiniProfile(liCurrentUser),
  displayText: liCurrentUser?.publicIdentifier,
})

const mapParticipants = (liParticipants: any[], entitiesMap: Record<string, any>) =>
  liParticipants.map<Participant>(p => {
    const id = getParticipantID(p)
    const entity = entitiesMap[id]

    return {
      id,
      username: entity?.publicIdentifier,
      fullName: [entity?.firstName, entity?.lastName].filter(Boolean).join(' '),
      imgURL: mapPicture(entity),
      social: {
        coverImgURL: entity?.backgroundImage ? mapPicture({ picture: entity?.backgroundImage }) : undefined,
        bio: { text: entity?.occupation },
      },
    }
  })

const mapMessageReceipt = (message: Message, liReceipts: any[], groupChat = false): Message => {
  if (!liReceipts || !liReceipts?.length) return message

  const messageReceipt = liReceipts.find(receipt => {
    const { eventUrn } = receipt.seenReceipt
    return eventUrn.includes(urnID(message.id))
  })

  const previousSeenState = typeof message.seen === 'object' ? message.seen : {}
  const newSeenState = messageReceipt
    ? { [urnID(messageReceipt.fromEntity)]: new Date(messageReceipt.seenReceipt.seenAt) }
    : {}

  return {
    ...message,
    seen: groupChat
      ? {
        ...previousSeenState,
        ...newSeenState,
      }
      : Object.keys(newSeenState).length > 0,
  }
}

const mapThread = (thread: any, entitiesMap: Record<string, any>, currentUserID: string): Thread => {
  const { conversation, messages: liMessages = [] } = thread

  const participantsItems = mapParticipants(conversation['*participants'] || [], entitiesMap)

  const messages: Message[] = liMessages
    .map(liMessage => mapMessage(liMessage, currentUserID))
    .map(message => mapMessageReceipt(message, conversation?.receipts, conversation.groupChat))

  return {
    _original: JSON.stringify(thread),
    id: urnID(conversation.entityUrn),
    type: conversation.groupChat ? 'group' : 'single',
    title: conversation.name,
    isUnread: !conversation.read,
    timestamp: new Date(conversation?.lastActivityAt),
    isReadOnly: false,
    mutedUntil: conversation.muted ? 'forever' : undefined,
    messages: { items: messages, hasMore: true },
    participants: { items: participantsItems, hasMore: false },
    isArchived: conversation.archived || undefined,
  }
}

export const mapThreads = (liThreads: any[], currentUserID: string, participantEntities: Record<string, any>): Thread[] => {
  const threads = (liThreads || []).map(thread => mapThread(thread, participantEntities, currentUserID))
  return orderBy(threads, 'timestamp', 'desc')
}

export const mapReactions = (liReactionSummaries: any, { currentUserID, participantId }): MessageReaction => ({
  id: String(liReactionSummaries?.firstReactedAt),
  reactionKey: liReactionSummaries?.emoji,
  participantID: liReactionSummaries?.viewerReacted ? currentUserID : participantId,
  emoji: true,
})

const mapForwardedMessage = (liForwardedMessage: any): MessagePreview => {
  const { originalCreatedAt, forwardedBody } = liForwardedMessage
  const { text } = forwardedBody
  // urn:li:fs_messagingMember:(2-ZDVjZjEzYjYtNTc4YS01Nzc4LTk2NTctNzRjN2M1ZWYzN2M1XzAxMg==,ACoAAA7bNVUBXo4wls3McYpXWVndS6LXypCdluU)
  const messagingMember = liForwardedMessage['*originalFrom']
  const senderID = messagingMember.split(',').pop().replace(')', '')

  return {
    id: `${originalCreatedAt}`,
    senderID,
    text,
  }
}

const mapAttachment = (liAttachment: any): MessageAttachment => {
  const { name, reference: ref, mediaType, id, byteSize } = liAttachment
  const reference = typeof ref === 'string' ? ref : ref?.string

  const type = (() => {
    if (mediaType.startsWith('image')) return MessageAttachmentType.IMG
    if (mediaType.startsWith('video')) return MessageAttachmentType.VIDEO
    if (mediaType.startsWith('audio')) return MessageAttachmentType.AUDIO
    return MessageAttachmentType.UNKNOWN
  })()

  if (typeof reference !== 'string') {
    texts.log("linkedin: reference isn't string", JSON.stringify(liAttachment, null, 2))
    texts.Sentry.captureMessage(`linkedin: reference isn't string, keys: ${Object.keys(liAttachment)}`)
    return
  }

  return {
    id,
    fileName: name,
    type,
    mimeType: mediaType,
    fileSize: byteSize,
    srcURL: 'asset://$accountID/proxy/' + Buffer.from(reference).toString('hex'),
  }
}

const mapMediaAudio = (liMediaAttachment: any): MessageAttachment => ({
  id: liMediaAttachment?.audioMetadata?.urn,
  srcURL: `asset://$accountID/proxy/${Buffer.from(liMediaAttachment?.audioMetadata?.url).toString('hex')}`,
  type: MessageAttachmentType.AUDIO,
  isVoiceNote: true,
})

const mapMediaAttachments = (liAttachments: any): MessageAttachment[] => {
  if (!liAttachments?.length) return []
  const audios = liAttachments.filter(({ mediaType }) => mediaType === 'AUDIO')

  return [...audios?.map(mapMediaAudio)]
}

const mapFeedUpdate = (liFeedUpdate: string): MessageLink => ({
  url: getFeedUpdateURL(liFeedUpdate),
  title: 'Feed Update',
})

export const mapMessageSeenState = (message: Message, seenReceipt: any): Message => ({
  ...message,
  seen: seenReceipt[message.id] || message.seen,
})

const mapTextAttributes = (liTextAttributes: any[], text: string): TextAttributes => {
  const entitiesAttributes = liTextAttributes.filter(({ type }) => type.$type === 'com.linkedin.pemberly.text.Entity')
  if (!entitiesAttributes.length) return

  const entities = entitiesAttributes.map<TextEntity>((liEntity: any) => ({
    from: liEntity.start,
    to: liEntity.start + liEntity.length,
    bold: true,
    mentionedUser: {
      id: urnID(liEntity.type.urn),
    },
  }))

  return { entities }
}

export const mapParticipantAction = (liParticipant: string): string =>
  // "urn:li:fs_messagingMember:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,ACoAADRSJgABy3J9f7VTdTKCbW79SieJTT-sub0)"
  liParticipant.split(',').pop().replace(')', '')

const extractName = (participantEventProfile: any) => {
  const mp = participantEventProfile?.['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile
  if (mp) return [mp.firstName, mp.lastName].filter(Boolean).join(' ')
}
// FIXME: Refactor
const getParticipantChangeText = (liMsg: any) => {
  if (liMsg.subtype !== 'PARTICIPANT_CHANGE') return undefined

  const changeEvent = liMsg.eventContent['com.linkedin.voyager.messaging.event.ParticipantChangeEvent']
  const removedNames = liMsg.eventContent['*removedParticipants']?.map(p => `{{${getParticipantID(p)}}}`)
    || changeEvent?.removedParticipants?.map(extractName)
  const addedNames = liMsg.eventContent['*addedParticipants']?.map(p => `{{${getParticipantID(p)}}}`)
    || changeEvent?.addedParticipants?.map(extractName)

  if (removedNames?.length > 0 && addedNames?.length > 0) {
    return `{{sender}} removed ${removedNames} and added ${addedNames}`
  }
  if (removedNames?.length > 0) return `{{sender}} removed ${removedNames}`
  if (addedNames?.length > 0) return `{{sender}} added ${addedNames}`
}

const mapMediaCustomAttachment = (liCustomContent: any): MessageAttachment[] => {
  if (liCustomContent?.mediaType !== 'TENOR_GIF') return []

  const { media: { gif }, id } = liCustomContent

  return [{
    id: `${id}`,
    isGif: true,
    srcURL: gif.url,
    type: MessageAttachmentType.IMG,
  }]
}

const mapMessageInner = (liMessage: any, currentUserID: string, senderID: string): Message => {
  const { reactionSummaries, subtype } = liMessage
  // liMessage.eventContent['com.linkedin.voyager.messaging.event.MessageEvent'] is present in real time events
  const eventContent = liMessage.eventContent['com.linkedin.voyager.messaging.event.MessageEvent'] || liMessage.eventContent
  const { attributedBody, customContent, attachments: liAttachments, mediaAttachments } = eventContent

  let textAttributes: TextAttributes
  if (attributedBody?.attributes?.length > 0) {
    textAttributes = mapTextAttributes(attributedBody?.attributes, attributedBody?.text)
  }

  const linkedMessage = customContent?.forwardedContentType ? mapForwardedMessage(customContent) : undefined

  // linkedin seems to have broken reactions?
  const reactions = (reactionSummaries as any[] || []).map(reaction => mapReactions(reaction, { currentUserID, participantId: senderID }))

  const attachments = [
    ...((liAttachments as any[])?.map(liAttachment => mapAttachment(liAttachment)).filter(Boolean) || []),
    ...(mapMediaAttachments(mediaAttachments) || []),
    ...(mapMediaCustomAttachment(customContent) || []),
  ]

  const isAction = customContent?.$type === 'com.linkedin.voyager.messaging.event.message.ConversationNameUpdateContent' || subtype === 'PARTICIPANT_CHANGE'

  const links = eventContent['*feedUpdate'] ? [mapFeedUpdate(eventContent['*feedUpdate'])] : []
  const participantChangeText = getParticipantChangeText(liMessage)

  return {
    _original: JSON.stringify(liMessage),
    id: liMessage.dashEntityUrn,
    cursor: String(liMessage.createdAt),
    timestamp: new Date(liMessage.createdAt),
    text: attributedBody?.text || customContent?.body || participantChangeText,
    parseTemplate: !!participantChangeText,
    isDeleted: !!eventContent.recalledAt,
    editedTimestamp: eventContent?.lastEditedAt ? new Date(eventContent?.lastEditedAt) : undefined,
    attachments,
    links,
    reactions,
    senderID,
    isSender: currentUserID === senderID,
    linkedMessage,
    textAttributes,
    isAction,
  }
}

export const mapMessage = (liMessage: any, currentUserID: string): Message => {
  const senderID = getParticipantID(liMessage['*from'])
  return mapMessageInner(liMessage, currentUserID, senderID)
}

export const mapNewMessage = (liMessage: any, currentUserID: string): Message => {
  const senderID = getParticipantID(liMessage.from[LinkedInAPITypes.member].entityUrn)
  return mapMessageInner(liMessage, currentUserID, senderID)
}
