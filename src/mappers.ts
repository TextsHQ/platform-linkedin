import { Thread, Message, CurrentUser, Participant, User } from '@textshq/platform-sdk'

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
    messages: { items: [], hasMore: false },
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
  return liThreads.map(thread => mapThread(thread, grouped))
}

export const mapMessage = (liMessage: any, currentUserID: string): Message => {
  const { attributedBody } = liMessage.eventContent

  const senderID = getSenderID(liMessage['*from'])

  return {
    _original: JSON.stringify(liMessage),
    id: liMessage.dashEntityUrn,
    timestamp: new Date(liMessage.createdAt),
    text: attributedBody.text,
    attachments: [],
    reactions: [],
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
  const id = liCurrentUser.entityUrn.split(':').pop()

  return {
    id,
    displayText: liCurrentUser.publicIdentifier,
    username: liCurrentUser.publicIdentifier,
    fullName: `${liCurrentUser.firstName} ${liCurrentUser.lastName}`,
  }
}
