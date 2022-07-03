// urn:li:fs_conversation:2-YmU3NDYwNzctNTU0ZS00NjdhLTg3ZDktMjkwOTE5NDAxNGQ4XzAxMw==
// urn:li:fs_miniProfile:ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM
// urn:li:fsd_message:2-MTYxNzY2ODAyODc1N2IyNjY1MC0wMDQmZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==
export const urnID = (entityUrn: string) => entityUrn.split(':').pop()

// urn:li:fs_event:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,2-MTYxMzcwNjcxOTUzMWI2NTIzNi0wMDQmZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==)
// urn:li:fs_updateV2:(urn:li:activity:6767570017279066112,MESSAGING_RESHARE,EMPTY,DEFAULT,false)
export const eventUrnToThreadID = (eventUrn: string) => eventUrn.split(':(', 2)?.[1].split(',')[0]

export const eventUrnTupleToIDs = (eventUrn: string) => {
  const [, threadID, messageID] = /fs_event:\((.+),(.+)\)/.exec(eventUrn)
  return { threadID, messageID }
}

export const eventUrnToMessageID = (eventUrn: string) =>
  `urn:li:fsd_message:${eventUrn.split(',', 2)?.[1].replace(')', '')}`

// urn:SOMETHING:(FIRST_ENTITY,SECONDENTITY)
export const extractSecondEntity = (urn: string) => urn.split(',', 2)?.[1]?.replace(')', '')

// urn:li:fs_messagingMember:(2-YjM5NTM2YTEtMDBkNy00YjhlLTk4NzUtMmY5MTE3NjA0YmVkXzAxMw==,ACoAADRSJgABy3J9f7VTdTKCbW79SieJTT-sub0)
// urn:li:fs_messagingMember:(THREAD_ID,PARTICIPANT_ID)
// urn:li:fs_messagingMember:(2-ZTI4OTlmNDEtOGI1MC00ZGEyLWI3ODUtNjM5NGVjYTlhNWIwXzAxMg==,ACoAAB2EEb4BjsqIcMYQQ57SqWL6ihsOZCvTzWM)
export const getParticipantID = extractSecondEntity

export const getFeedUpdateURL = (feedUpdate: string) => {
  // urn:li:fs_updateV2:(urn:li:activity:6767570017279066112,MESSAGING_RESHARE,EMPTY,DEFAULT,false)
  const urn = feedUpdate.split(':(').pop().split(',')[0]
  const baseUrl = 'https://www.linkedin.com/feed/update'
  return `${baseUrl}/${urn}`
}
