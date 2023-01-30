import { Thread, Message, CurrentUser, Participant, User, MessageReaction, Attachment, AttachmentType, MessageLink, MessagePreview, TextAttributes, TextEntity, texts, MessageSeen, UNKNOWN_DATE } from '@textshq/platform-sdk'
import { orderBy } from 'lodash'

import { LinkedInAPITypes, LinkedInURLs } from './constants'
import { urnID, getFeedUpdateURL, getParticipantID, extractSecondEntity, extractFirstEntity } from './util'

import type { GraphQLMessage, HostUrnData, Reaction, RichReaction } from './lib/types'
import type { GraphQLConversation } from './lib/types/conversations'
import type { ConversationParticipant } from './lib/types/users'

type LIMappedThread = { conversation: any, messages: any[] }
type LIMessage = any

export type ParticipantSeenMap = Map<string, [string, Date]>
// threadID: participantID: [messageID, Date]
export type ThreadSeenMap = Map<string, ParticipantSeenMap>

const mapPicture = (liMiniProfile: any): string | undefined => (liMiniProfile?.picture?.rootUrl
  // eslint-disable-next-line no-unsafe-optional-chaining
  ? liMiniProfile?.picture?.rootUrl + liMiniProfile?.picture?.artifacts[0]?.fileIdentifyingUrlPathSegment
  : undefined)

const mapMediaType = (mediaType: string): AttachmentType => {
  if (mediaType.startsWith('image')) return AttachmentType.IMG
  if (mediaType.startsWith('video')) return AttachmentType.VIDEO
  if (mediaType.startsWith('audio')) return AttachmentType.AUDIO
  return AttachmentType.UNKNOWN
}

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

const mapMessageSeen = (messageID: string, seenMap: ParticipantSeenMap): MessageSeen => {
  if (!seenMap) return
  const seen: Record<string, Date> = {}
  for (const [userID, [seenMessageID, seenAt]] of seenMap.entries()) {
    if (messageID === seenMessageID) {
      seen[userID] = new Date(seenAt)
    }
  }
  return seen
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

const mapThread = (thread: LIMappedThread, allProfiles: Record<string, any>, currentUserID: string, threadSeenMap: ThreadSeenMap): Thread => {
  const { conversation, messages: liMessages = [] } = thread

  const participantsItems = (conversation['*participants'] as string[])?.map(pid => {
    const entity = allProfiles[getParticipantID(pid)]
    return entity ? mapParticipant(entity) : undefined
  }).filter(Boolean) || []

  const id = urnID(conversation.entityUrn)

  const messages = (liMessages as any[])
    ?.map<Message>(liMessage => mapMessage(liMessage, currentUserID, threadSeenMap.get(id))) || []

  return {
    _original: JSON.stringify(thread),
    id,
    type: conversation.groupChat ? 'group' : 'single',
    title: conversation.name,
    isUnread: !conversation.read,
    timestamp: new Date(conversation.lastActivityAt),
    isReadOnly: false,
    mutedUntil: conversation.muted ? 'forever' : undefined,
    messages: { items: messages, hasMore: true },
    participants: { items: participantsItems, hasMore: false },
    isArchived: conversation.archived || undefined,
  }
}

export const groupEntities = (liResponse: any) => {
  const { included = [] } = liResponse || {}

  const allProfiles: Record<string, any> = {}
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
  return { conversations, allProfiles }
}

export const mapThreads = (conversations: LIMappedThread[], allProfiles: Record<string, any>, currentUserID: string, threadSeenMap: ThreadSeenMap): Thread[] => {
  const threads = conversations.map(thread => mapThread(thread, allProfiles, currentUserID, threadSeenMap))
  return orderBy(threads, 'timestamp', 'desc')
}

export const mapReactions = (liReactionSummaries: any, { currentUserID, participantId }): MessageReaction => {
  const participantID = liReactionSummaries?.viewerReacted ? currentUserID : participantId
  const reactionKey = liReactionSummaries?.emoji
  return {
    id: `${participantID}${reactionKey}`,
    reactionKey,
    participantID,
    emoji: true,
  }
}

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

const mapAttachment = (liAttachment: any): Attachment => {
  const { name, reference: ref, mediaType, id, byteSize } = liAttachment
  const reference = typeof ref === 'string' ? ref : ref?.string

  const type = mapMediaType(mediaType)

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

const mapMediaAudio = (liMediaAttachment: any): Attachment => ({
  id: liMediaAttachment?.audioMetadata?.urn,
  srcURL: `asset://$accountID/proxy/${Buffer.from(liMediaAttachment?.audioMetadata?.url).toString('hex')}`,
  type: AttachmentType.AUDIO,
  isVoiceNote: true, // @TODO: any other way to send audio
})

const mapMediaAttachments = (liAttachments: any[], extras: { seen?: ParticipantSeenMap, currentUserID?: string } = {}): Attachment[] => {
  if (!liAttachments?.length) return []

  const audios = liAttachments.filter(({ mediaType }) => mediaType === 'AUDIO')

  return [...audios?.map(mapMediaAudio)]
}

const mapFeedUpdate = (liFeedUpdate: string): MessageLink => ({
  url: getFeedUpdateURL(liFeedUpdate),
  title: 'Feed Update',
})

const mapTextAttributes = (liTextAttributes: any[]): TextAttributes => {
  const entities = liTextAttributes.map<TextEntity>(liEntity => {
    /**
     * Type can come in two different forms (it'll depend on LinkedIn's API version).
     * It can come like:
     * {
     *  type: { $type: 'com.linkedin....' }
     * }
     * or implicit in the first field of the type object
     * {
     *  type: { "com.linkedin....": { ... } }
     * }
     */
    const type = liEntity.type.$type || Object.keys(liEntity.type)?.[0]

    switch (type) {
      case 'com.linkedin.pemberly.text.Entity': {
        const urn = liEntity.type.urn || liEntity.type?.[type]?.urn
        if (!urn) return undefined

        return {
          from: liEntity.start,
          to: liEntity.start + liEntity.length,
          mentionedUser: { id: urnID(urn) },
        }
      }
      case 'com.linkedin.pemberly.text.Bold':
        return {
          from: liEntity.start,
          to: liEntity.start + liEntity.length,
          bold: true,
        }
      case 'com.linkedin.pemberly.text.Italic':
        return {
          from: liEntity.start,
          to: liEntity.start + liEntity.length,
          italic: true,
        }
      case 'com.linkedin.pemberly.text.Underline':
        return {
          from: liEntity.start,
          to: liEntity.start + liEntity.length,
          underline: true,
        }
      default:
        return undefined
    }
  }).filter(Boolean)
  if (!entities.length) return
  return { entities }
}

const extractName = (participantEventProfile: any) => {
  const mp = participantEventProfile?.['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile
  if (mp) return [mp.firstName, mp.lastName].filter(Boolean).join(' ')
}
const getParticipantChangeText = (liMsg: any) => {
  if (liMsg.subtype !== 'PARTICIPANT_CHANGE') return undefined

  const changeEvent = liMsg.eventContent['com.linkedin.voyager.messaging.event.ParticipantChangeEvent']
  const removedNames = (liMsg.eventContent['*removedParticipants'] as any[])?.map(p => `{{${getParticipantID(p)}}}`)
    || changeEvent?.removedParticipants?.map(extractName)
  const addedNames = (liMsg.eventContent['*addedParticipants'] as any[])?.map(p => `{{${getParticipantID(p)}}}`)
    || changeEvent?.addedParticipants?.map(extractName)

  if (removedNames?.length > 0 && addedNames?.length > 0) {
    return `{{sender}} removed ${removedNames} and added ${addedNames}`
  }
  if (removedNames?.length > 0) return `{{sender}} removed ${removedNames}`
  if (addedNames?.length > 0) return `{{sender}} added ${addedNames}`
}

const mapMediaCustomAttachment = (liCustomContent: any): Attachment[] => {
  if (liCustomContent?.mediaType !== 'TENOR_GIF') return []

  const { media: { gif }, id } = liCustomContent

  return [{
    id: `${id}`,
    isGif: true,
    srcURL: gif.url,
    type: AttachmentType.IMG,
  }]
}

const mapMessageInner = (liMessage: LIMessage, currentUserID: string, senderID: string, participantSeenMap: ParticipantSeenMap): Message => {
  const { reactionSummaries, subtype } = liMessage
  // liMessage.eventContent['com.linkedin.voyager.messaging.event.MessageEvent'] is present in real time events
  const eventContent = liMessage.eventContent['com.linkedin.voyager.messaging.event.MessageEvent'] || liMessage.eventContent
  const { attributedBody, customContent, attachments: liAttachments, mediaAttachments } = eventContent

  let textAttributes: TextAttributes
  if (attributedBody?.attributes?.length > 0) {
    textAttributes = mapTextAttributes(attributedBody?.attributes)
  }

  const linkedMessage = customContent?.forwardedContentType ? mapForwardedMessage(customContent) : undefined

  // linkedin seems to have broken reactions?
  const reactions = (reactionSummaries as any[] || []).map(reaction => mapReactions(reaction, { currentUserID, participantId: senderID }))

  const attachments = [
    ...((liAttachments as any[])?.map(liAttachment => mapAttachment(liAttachment)).filter(Boolean) || []),
    ...(mapMediaAttachments(mediaAttachments, { seen: participantSeenMap, currentUserID }) || []),
    ...(mapMediaCustomAttachment(customContent) || []),
  ]

  const isAction = customContent?.$type === 'com.linkedin.voyager.messaging.event.message.ConversationNameUpdateContent' || subtype === 'PARTICIPANT_CHANGE' || subtype === 'CONVERSATION_UPDATE'

  const links = eventContent['*feedUpdate'] ? [mapFeedUpdate(eventContent['*feedUpdate'])] : []
  const participantChangeText = getParticipantChangeText(liMessage)

  return {
    _original: JSON.stringify(liMessage),
    id: liMessage.backendUrn || liMessage.dashEntityUrn,
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
    seen: mapMessageSeen(liMessage.dashEntityUrn, participantSeenMap),
  }
}

export const mapMessage = (liMessage: any, currentUserID: string, participantSeenMap: ParticipantSeenMap): Message => {
  const senderID = getParticipantID(liMessage['*from'])
  return mapMessageInner(liMessage, currentUserID, senderID, participantSeenMap)
}

export const mapNewMessage = (liMessage: any, currentUserID: string, participantSeenMap: ParticipantSeenMap): Message => {
  const senderID = getParticipantID(liMessage.from[LinkedInAPITypes.member].entityUrn)
  return mapMessageInner(liMessage, currentUserID, senderID, participantSeenMap)
}

const mapVideo = (video: GraphQLMessage['renderContent'][number]['video']): Attachment => ({
  id: video.entityUrn,
  type: AttachmentType.VIDEO,
  // @FIXME: don't use only first element - check for multiple progressive streams sources
  srcURL: `asset://$accountID/proxy/${Buffer.from(video.progressiveStreams?.[0]?.streamingLocations?.[0]?.url).toString('hex')}`,
  size: {
    width: video.progressiveStreams?.[0]?.width,
    height: video.progressiveStreams?.[0]?.height,
  },
})

const mapAudio = (audio: GraphQLMessage['renderContent'][number]['audio']): Attachment => ({
  id: audio.url,
  type: AttachmentType.AUDIO,
  srcURL: `asset://$accountID/proxy/${Buffer.from(audio.url).toString('hex')}`,
})

const mapFile = (file: GraphQLMessage['renderContent'][number]['file']): Attachment => ({
  id: file.assetUrn,
  fileName: file.name,
  type: mapMediaType(file.mediaType),
  mimeType: file.mediaType,
  fileSize: file.byteSize,
  srcURL: 'asset://$accountID/proxy/' + Buffer.from(file.url).toString('hex'),
})

const mapImage = (image: GraphQLMessage['renderContent'][number]['vectorImage']): Attachment => ({
  id: image.digitalmediaAsset,
  type: AttachmentType.IMG,
  srcURL: `asset://$accountID/proxy/${Buffer.from(image.rootUrl).toString('hex')}`,
})

const mapAttachments = (content: GraphQLMessage['renderContent']): Attachment[] => {
  const images = content.filter(x => !!x.vectorImage)
  const videos = content.filter(x => !!x.video)
  const audios = content.filter(x => !!x.audio)
  const files = content.filter(x => !!x.file)

  return [
    ...images.map(image => mapImage(image.vectorImage)),
    ...videos.map(video => mapVideo(video.video)),
    ...audios.map(audio => mapAudio(audio.audio)),
    ...files.map(file => mapFile(file.file)),
  ]
}

const isRichReaction = (reaction: Reaction | RichReaction): reaction is RichReaction => !!(reaction as RichReaction).participant

const mapGraphQLReaction = (
  reaction: Reaction | RichReaction,
  { currentUserID, participantID }: { currentUserID: string, participantID: string },
): MessageReaction => {
  if (!reaction) return null

  const finalParticipantID = isRichReaction(reaction)
    ? urnID(reaction.participant.hostIdentityUrn)
    : (reaction.viewerReacted ? currentUserID : participantID)

  return {
    id: String(`${finalParticipantID}${reaction?.emoji}`),
    reactionKey: reaction?.emoji,
    emoji: true,
    participantID: finalParticipantID,
  }
}

const mapGraphQLAttributes = (attributes: GraphQLMessage['body']['attributes']): TextAttributes => {
  const entities = attributes.map(attribute => ({
    from: attribute.start,
    to: attribute.start + attribute.length,
    bold: !!attribute.attributeKind.bold,
    italic: !!attribute.attributeKind.italic,
    underline: !!attribute.attributeKind.underline,
    mentionedUser: attribute.attributeKind.entity
      ? { id: urnID(attribute.attributeKind.entity.urn) }
      : undefined,
  } as TextEntity))

  return { entities }
}

const mapHostUrnData = (urn: HostUrnData): { text: string, attributes: TextAttributes } => {
  if (urn.type === 'FEED_UPDATE') {
    const activityUrn = extractFirstEntity(urn.hostUrn)
    const url = `${LinkedInURLs.FEED_ACTIVITY}/${activityUrn}/`

    return {
      text: url,
      attributes: {
        entities: [{
          from: 0,
          to: url.length,
          link: url,
        }],
      },
    }
  }

  return { text: '', attributes: {} }
}

export const mapGraphQLMessage = (
  message: GraphQLMessage,
  currentUserID: string,
  threadSeenMap: ThreadSeenMap,
  reactionsMap: Map<string, RichReaction[]> = new Map(),
): Message => {
  const senderID = urnID(message.sender.hostIdentityUrn)
  const reactionsToMap = reactionsMap.get(message.backendUrn) || message.reactionSummaries || []
  const reactions = (reactionsToMap || []).map(reaction => mapGraphQLReaction(reaction, { currentUserID, participantID: senderID }))

  const isAction = message.body?._type === 'com.linkedin.voyager.messaging.event.message.ConversationNameUpdateContent'
    || message.messageBodyRenderFormat === 'SYSTEM'
  const attachments = mapAttachments(message.renderContent)

  const conversationId = extractSecondEntity(message.conversation.entityUrn)
  const participantSeenMap = threadSeenMap.get(conversationId)
  /**
   * @FIXME
   *  This needs to be fixed once we migrate seen response to graphql.
   *  We are getting seen status from conversation's endpoint instead of graphql, so we convert
   *  message id to "old" message entityUrn (adding 'fsd_message' prefix).
   */
  const messageUrn = urnID(message.backendUrn)
  const oldMessageEntityUrn = `urn:li:fsd_message:${messageUrn}`
  const seen = participantSeenMap ? mapMessageSeen(oldMessageEntityUrn, participantSeenMap) : undefined

  const bodyTextAttributes = mapGraphQLAttributes(message.body.attributes || [])

  const firstHostUrnData = message.renderContent.find(x => x.hostUrnData)?.hostUrnData
  const hostUrnData = firstHostUrnData ? mapHostUrnData(firstHostUrnData) : { text: undefined, attributes: undefined }
  const textAttributes = { ...bodyTextAttributes, ...(hostUrnData.attributes || {}) }

  return {
    _original: JSON.stringify(message),
    id: message.backendUrn,
    cursor: String(message.deliveredAt),
    timestamp: new Date(message.deliveredAt),
    text: message?.body.text || hostUrnData?.text,
    isSender: senderID === currentUserID,
    textAttributes,
    senderID,
    isAction,
    reactions,
    attachments,
    seen,
    /** We don't have editedAt with the newest graphql type */
    editedTimestamp: message.messageBodyRenderFormat === 'EDITED' ? UNKNOWN_DATE : undefined,
    isDeleted: message.messageBodyRenderFormat === 'RECALLED',
  }
}

export const mapConversationParticipant = (participant: ConversationParticipant): Participant => {
  const { profilePicture } = participant.participantType?.member || {}
  const [smallerPhoto] = profilePicture?.artifacts || []

  return {
    id: urnID(participant.hostIdentityUrn),
    username: participant.participantType?.member.firstName.text,
    fullName: `${participant.participantType?.member.firstName.text} ${participant.participantType?.member.lastName.text}`,
    imgURL: profilePicture ? `${profilePicture.rootUrl}${smallerPhoto.fileIdentifyingUrlPathSegment}` : undefined,
  }
}

export const mapGraphQLConversation = (conversation: GraphQLConversation, currentUserId: string): Thread => {
  const conversationId = extractSecondEntity(conversation.entityUrn)
  const participantsNotCurrentUser = conversation.conversationParticipants.filter(participant => participant.participantType?.member?.distance !== 'SELF')
  const title = participantsNotCurrentUser.map(mapConversationParticipant).map(({ fullName }) => fullName).join(', ')

  return {
    _original: JSON.stringify(conversation),
    id: conversationId,
    type: conversation.groupChat ? 'group' : 'single',
    title: conversation.groupChat ? conversation.title || title : undefined,
    timestamp: new Date(conversation.lastActivityAt),
    isReadOnly: false,
    isUnread: !conversation.read,
    messages: { items: conversation.messages.elements.map(message => mapGraphQLMessage(message, currentUserId, new Map())), hasMore: true },
    participants: { items: conversation.conversationParticipants.map(mapConversationParticipant), hasMore: false },
  }
}
