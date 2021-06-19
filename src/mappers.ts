import { Thread, Message, CurrentUser, Participant, User, MessageReaction, MessageAttachment, MessageAttachmentType, MessageLink, MessagePreview, TextAttributes, TextEntity } from '@textshq/platform-sdk'
import { orderBy, groupBy } from 'lodash'

import { LinkedInAPITypes } from './constants'

export const getSenderID = (from: string) =>
  // "*from": "urn:li:fs_messagingMember:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM)",
  from
    .split(',')
    .pop() // ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM)
    .replace(')', '')

export const mapConversationsResponse = (liResponse: any): Record<string, any>[] => {
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
    const entityId = getSenderID(firstParticipant)

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

export const mapMiniProfile = (liMiniProfile: any): User => ({
  // "entityUrn": "urn:li:fs_miniProfile:ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM"
  id: liMiniProfile?.entityUrn.split(':').pop(),
  username: liMiniProfile?.publicIdentifier,
  fullName: [liMiniProfile?.firstName, liMiniProfile?.lastName].filter(Boolean).join(' '),
  imgURL: mapPicture(liMiniProfile),
})

export const mapCurrentUser = (liCurrentUser: any): CurrentUser => ({
  ...mapMiniProfile(liCurrentUser),
  displayText: liCurrentUser?.publicIdentifier,
})

const mapParticipants = (liParticipants: any[], entitiesMap: Record<string, any>) =>
  liParticipants.map<Participant>(p => {
    const id = getSenderID(p)
    const entity = entitiesMap[id]
    return {
      id,
      username: entity?.publicIdentifier,
      fullName: [entity?.firstName, entity?.lastName].filter(Boolean).join(' '),
      imgURL: mapPicture(entity),
    }
  })

const mapMessageReceipt = (message: Message, liReceipts: any[], groupChat = false): Message => {
  if (!liReceipts || !liReceipts?.length) return message

  const messageReceipt = liReceipts.find(receipt => {
    const { eventUrn } = receipt.seenReceipt
    return eventUrn.includes(message.id.split(':').pop())
  })

  const previousSeenState = typeof message.seen === 'object' ? message.seen : {}
  const newSeenState = messageReceipt
    ? { [messageReceipt.fromEntity.split(':').pop()]: new Date(messageReceipt.seenReceipt.seenAt) }
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

  const participantsItems = mapParticipants(conversation['*participants'], entitiesMap)

  const messages: Message[] = liMessages
    .map(liMessage => mapMessage(liMessage, currentUserID))
    .map(message => mapMessageReceipt(message, conversation?.receipts, conversation.groupChat))

  return {
    _original: JSON.stringify(thread),
    // "entityUrn": "urn:li:fs_conversation:2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg=="
    id: conversation.entityUrn?.split(':').pop(),
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

const groupEntities = (liThreads: any[]) => {
  const map = {}
  for (const liThread of liThreads) {
    // "entityUrn": "urn:li:fs_miniProfile:ACoAADRSJgABy3J9f7VTdTKCbW79SieJTT-sub0"
    const id = liThread.entity?.entityUrn?.split(':').pop()
    map[id] = liThread.entity
  }
  return map
}

export const mapThreads = (liThreads: any[], currentUserID: string): Thread[] => {
  const grouped = groupEntities(liThreads)
  const threads = liThreads.map(thread => mapThread(thread, grouped, currentUserID))
  return orderBy(threads, 'timestamp', 'desc')
}

export const mapReactions = (liReactionSummaries: any, { currentUserID, participantId }): MessageReaction => ({
  id: liReactionSummaries?.firstReactedAt,
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
  const { name, reference, mediaType, id, byteSize } = liAttachment

  const type = (() => {
    if (mediaType.startsWith('image')) return MessageAttachmentType.IMG
    if (mediaType.startsWith('video')) return MessageAttachmentType.VIDEO
    if (mediaType.startsWith('audio')) return MessageAttachmentType.AUDIO
    return MessageAttachmentType.UNKNOWN
  })()

  return {
    id,
    fileName: name,
    type,
    mimeType: mediaType,
    fileSize: byteSize,
    srcURL: 'asset://$accountID/proxy/' + Buffer.from(reference).toString('hex'),
  }
}

const mapFeedUpdate = (liFeedUpdate: string): MessageLink => {
  // *feedUpdate : "urn:li:fs_updateV2:(urn:li:activity:6767570017279066112,MESSAGING_RESHARE,EMPTY,DEFAULT,false)"
  const urn = liFeedUpdate.split(':(').pop().split(',')[0]
  const baseUrl = 'https://www.linkedin.com/feed/update'
  const url = `${baseUrl}/${urn}`

  return {
    url,
    title: 'Feed Update',
  }
}

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
      // urn : "urn:li:fs_miniProfile:ACoAADRSJgABy3J9f7VTdTKCbW79SieJTT-sub0"
      id: liEntity.type.urn.split(':').pop(),
    },
  }))

  return { entities }
}

export const mapParticipantAction = (liParticipant: string): string =>
  // "urn:li:fs_messagingMember:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,ACoAADRSJgABy3J9f7VTdTKCbW79SieJTT-sub0)"
  liParticipant.split(',').pop().replace(')', '')

export const mapMessage = (liMessage: any, currentUserID: string): Message => {
  const { reactionSummaries, subtype, eventContent } = liMessage
  const { attributedBody, customContent, attachments: liAttachments } = eventContent

  let textAttributes: TextAttributes
  if (attributedBody?.attributes?.length > 0) {
    textAttributes = mapTextAttributes(attributedBody?.attributes, attributedBody?.text)
  }

  const senderID = getSenderID(liMessage['*from'])
  let linkedMessage: MessagePreview

  // linkedin seems to have broken reactions?
  const reactions = reactionSummaries.map((reaction: any) => mapReactions(reaction, { currentUserID, participantId: senderID }))

  const attachments = liAttachments?.map(liAttachment => mapAttachment(liAttachment)) || []

  if (customContent?.forwardedContentType) linkedMessage = mapForwardedMessage(customContent)

  const isAction = customContent?.$type === 'com.linkedin.voyager.messaging.event.message.ConversationNameUpdateContent' || subtype === 'PARTICIPANT_CHANGE'

  const links = eventContent['*feedUpdate'] ? [mapFeedUpdate(eventContent['*feedUpdate'])] : []
  // TODO: Refactor this
  const participantChangeText = subtype === 'PARTICIPANT_CHANGE'
    && `${liMessage.fromProfile?.firstName}${eventContent.removedParticipants?.length > 0 ? ` removed ${eventContent.removedParticipants?.join(', ')}` : ''}${eventContent.addedParticipants?.length > 0 ? ` added ${eventContent.addedParticipants?.join(', ')}` : ''}`

  return {
    _original: JSON.stringify(liMessage),
    id: liMessage.dashEntityUrn,
    cursor: String(liMessage.createdAt),
    timestamp: new Date(liMessage.createdAt),
    text: attributedBody?.text || customContent?.body || participantChangeText,
    isDeleted: !!eventContent.recalledAt,
    editedTimestamp: eventContent?.lastEditedAt ? new Date(eventContent?.lastEditedAt) : undefined,
    attachments,
    links,
    reactions,
    senderID,
    isSender: currentUserID === senderID,
    linkedMessage,
    seen: {},
    textAttributes,
    isAction,
  }
}

export const mapNewMessage = (liMessage: any, currentUserID: string): Message => {
  const { reactionSummaries, subtype, eventContent } = liMessage
  const { attributedBody, customContent, attachments: liAttachments } = eventContent

  let textAttributes: TextAttributes
  if (attributedBody?.attributes?.length > 0) {
    textAttributes = mapTextAttributes(attributedBody?.attributes, attributedBody?.text)
  }

  const senderID = getSenderID(liMessage.from[LinkedInAPITypes.member].entityUrn)
  let linkedMessage: MessagePreview

  // linkedin seems to have broken reactions?
  const reactions = reactionSummaries.map((reaction: any) => mapReactions(reaction, { currentUserID, participantId: senderID }))

  const attachments = liAttachments?.map(liAttachment => mapAttachment(liAttachment)) || []

  if (customContent?.forwardedContentType) linkedMessage = mapForwardedMessage(customContent)

  const isAction = customContent?.$type === 'com.linkedin.voyager.messaging.event.message.ConversationNameUpdateContent' || subtype === 'PARTICIPANT_CHANGE'

  const links = eventContent['*feedUpdate'] ? [mapFeedUpdate(eventContent['*feedUpdate'])] : []
  // TODO: Refactor this
  const participantChangeText = subtype === 'PARTICIPANT_CHANGE'
    && `${liMessage.fromProfile?.firstName}${eventContent.removedParticipants?.length > 0 ? ` removed ${eventContent.removedParticipants?.join(', ')}` : ''}${eventContent.addedParticipants?.length > 0 ? ` added ${eventContent.addedParticipants?.join(', ')}` : ''}`

  return {
    _original: JSON.stringify(liMessage),
    id: liMessage.dashEntityUrn,
    cursor: String(liMessage.createdAt),
    timestamp: new Date(liMessage.createdAt),
    text: attributedBody?.text || customContent?.body || participantChangeText,
    isDeleted: !!eventContent.recalledAt,
    editedTimestamp: eventContent?.lastEditedAt ? new Date(eventContent?.lastEditedAt) : undefined,
    attachments,
    links,
    reactions,
    senderID,
    isSender: currentUserID === senderID,
    linkedMessage,
    seen: {},
    textAttributes,
    isAction,
  }
}

