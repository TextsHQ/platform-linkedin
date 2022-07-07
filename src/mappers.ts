import { Thread, Message, CurrentUser, Participant, User, MessageReaction, MessageAttachment, MessageAttachmentType, MessageLink, MessagePreview, TextAttributes, TextEntity, texts } from '@textshq/platform-sdk'
import { orderBy } from 'lodash'

import { LinkedInAPITypes } from './constants'
import { urnID, getFeedUpdateURL, getParticipantID } from './util'

type LIMappedThread = { conversation: any, messages: any[] }

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

const mapParticipant = (entity: any): Participant => ({
  id: urnID(entity.entityUrn),
  username: entity?.publicIdentifier,
  fullName: [entity?.firstName, entity?.lastName].filter(Boolean).join(' '),
  imgURL: mapPicture(entity),
  social: {
    coverImgURL: entity?.backgroundImage ? mapPicture({ picture: entity?.backgroundImage }) : undefined,
    bio: { text: entity?.occupation },
  },
})

const mapThread = (thread: LIMappedThread, allProfiles: Record<string, any>, currentUserID: string): Thread => {
  const { conversation, messages: liMessages = [] } = thread

  const participantsItems = (conversation['*participants'] as string[]).map(pid => {
    const entity = allProfiles[getParticipantID(pid)]
    // if (!entity) texts.log('404 entity', pid, getParticipantID(pid))
    return entity ? mapParticipant(entity) : undefined
  }).filter(Boolean)

  const messages = (liMessages as any[])
    .map<Message>(liMessage => mapMessage(liMessage, currentUserID))
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

export const mapThreads = (liResponse: any, currentUserID: string): Thread[] => {
  const { included = [] } = liResponse || {}

  const allProfiles = {}
  const allConversations = []
  const allEvents = []
  for (const item of included) {
    switch (item.$type) {
      case LinkedInAPITypes.miniProfile:
        allProfiles[urnID(item.entityUrn)] = item
        break
      case LinkedInAPITypes.conversation:
        allConversations.push(item)
        break
      case LinkedInAPITypes.event:
        allEvents.push(item)
        break
      case LinkedInAPITypes.member: // ignore
        break
    }
  }

  const conversations: LIMappedThread[] = []
  for (const conversation of allConversations) {
    if (conversation.entityUrn && !conversation['*participants']?.[0]?.endsWith(',UNKNOWN)')) { // UNKNOWN filters inmail
      const threadID = urnID(conversation.entityUrn)
      const messages = allEvents.filter(e => e.entityUrn.includes(threadID))
      conversations.push({ conversation, messages })
    }
  }

  const threads = conversations.map(thread => mapThread(thread, allProfiles, currentUserID))
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
  const messagingMember = liForwardedMessage['*originalFrom']
  const senderID = getParticipantID(messagingMember)

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

const extractName = (participantEventProfile: any) => {
  const mp = participantEventProfile?.['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile
  if (mp) return [mp.firstName, mp.lastName].filter(Boolean).join(' ')
}
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
