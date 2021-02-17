import { Thread, Message, CurrentUser, Participant, User, MessageReaction, MessageAttachment, MessageAttachmentType, MessageLink } from '@textshq/platform-sdk'
import { orderBy } from 'lodash'

import { supportedReactions } from './constants'

const getSenderID = (from: string) =>
  // "*from": "urn:li:fs_messagingMember:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM)",
  from
    .split(',')
    .pop() // ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM)
    .replace(')', '')

const mapParticipants = (liParticipants: any[], entitiesMap: Record<string, any>) =>
  liParticipants.map<Participant>(p => {
    const id = getSenderID(p)
    const entity = entitiesMap[id]
    return {
      id,
      fullName: [entity.firstName, entity.lastName].filter(Boolean).join(' '),
      imgURL: entity.picture ? entity.picture.rootUrl + entity.picture.artifacts[0].fileIdentifyingUrlPathSegment : undefined,
    }
  })

const mapThread = (thread: any, entitiesMap: Record<string, any>): Thread => {
  const { conversation } = thread
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
    messages: { items: [], hasMore: true },
    participants: {
      items: mapParticipants(conversation['*participants'], entitiesMap),
      hasMore: false,
    },
  }
}

const groupEntities = (liThreads: any[]) => {
  const map = {}
  for (const liThread of liThreads) {
    // "entityUrn": "urn:li:fs_miniProfile:ACoAADRSJgABy3J9f7VTdTKCbW79SieJTT-sub0"
    const id = liThread.entity.entityUrn.split(':').pop()
    map[id] = liThread.entity
  }
  return map
}

export const mapThreads = (liThreads: any[]): Thread[] => {
  const grouped = groupEntities(liThreads)
  return orderBy(liThreads.map(thread => mapThread(thread, grouped)), 'lastActivityAt', 'desc')
}

export const mapReactionEmoji = (reactionKey: string) => supportedReactions[reactionKey]

export const mapReactions = (liReactionSummaries: any, { currentUserID, participantId }): MessageReaction => ({
  id: liReactionSummaries?.firstReactedAt,
  reactionKey: liReactionSummaries?.emoji,
  participantID: liReactionSummaries?.viewerReacted ? currentUserID : participantId,
  emoji: true,
})

const mapCustomContent = (liCustomMessage: any): MessageAttachment => {
  const { mediaType, id, media } = liCustomMessage

  const type = (() => {
    switch (mediaType) {
      case 'TENOR_GIF':
        return MessageAttachmentType.IMG

      default:
        return MessageAttachmentType.UNKNOWN
    }
  })()

  return {
    id,
    type,
    isGif: mediaType === 'TENOR_GIF',
    srcURL: media?.previewgif?.url ?? '',
  }
}

const mapAttachment = (liAttachment: any): MessageAttachment => {
  const { name, reference, mediaType, id, byteSize } = liAttachment

  const type = (() => {
    switch (mediaType) {
      default:
        return MessageAttachmentType.UNKNOWN
    }
  })()

  return {
    id,
    fileName: name,
    type,
    mimeType: mediaType,
    fileSize: byteSize,
    srcURL: reference,
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

export const mapMessage = (liMessage: any, currentUserID: string, participants: Participant[] = []): Message => {
  const { reactionSummaries } = liMessage
  const { attributedBody, customContent, attachments: liAttachments } = liMessage.eventContent

  const senderID = getSenderID(liMessage['*from'])
  const participantId = participants.find(({ id }) => id !== currentUserID).id
  const reactions = reactionSummaries.map((reaction: any) => mapReactions(reaction, { currentUserID, participantId }))

  let attachments = []
  let links = []

  if (liAttachments) attachments = liAttachments.map(liAttachment => mapAttachment(liAttachment))
  if (customContent) attachments = [...attachments, mapCustomContent(customContent)]
  if (liMessage.eventContent['*feedUpdate']) links = [mapFeedUpdate(liMessage.eventContent['*feedUpdate'])]

  return {
    _original: JSON.stringify(liMessage),
    id: liMessage.dashEntityUrn,
    timestamp: new Date(liMessage.createdAt),
    text: attributedBody.text,
    attachments,
    links,
    reactions,
    senderID,
    isSender: currentUserID === senderID,
  }
}

export const mapMiniProfile = (liMiniProfile: any): User => {
  // "entityUrn": "urn:li:fs_miniProfile:ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM"
  const id = liMiniProfile.entityUrn.split(':').pop()

  return {
    id,
    username: liMiniProfile.publicIdentifier,
    fullName: [liMiniProfile.firstName, liMiniProfile.lastName].filter(Boolean).join(' '),
    imgURL: liMiniProfile.picture ? liMiniProfile.picture.rootUrl + liMiniProfile.picture.artifacts[0].fileIdentifyingUrlPathSegment : undefined,
  }
}

export const mapCurrentUser = (liCurrentUser: any): CurrentUser => {
  // "entityUrn": "urn:li:fs_miniProfile:ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM"
  const id = liCurrentUser?.entityUrn?.split(':').pop()

  return {
    id,
    displayText: liCurrentUser?.publicIdentifier,
    username: liCurrentUser?.publicIdentifier,
    fullName: `${liCurrentUser?.firstName} ${liCurrentUser?.lastName}`,
  }
}
