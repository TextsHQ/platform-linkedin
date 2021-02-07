import { Thread, Message, CurrentUser, Participant } from '@textshq/platform-sdk'

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

export const mapCurrentUser = (liCurrentUser: any): CurrentUser => {
  // id: { dmp: 'Ad-O9AwXmUgxi0kU4nViM4KcMRMA&v=2' },
  const { dmp } = liCurrentUser.id
  const id = dmp.split('&v')[0]

  return {
    id,
    displayText: liCurrentUser.userName,
  }
}
