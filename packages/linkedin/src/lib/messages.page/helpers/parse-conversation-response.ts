import { filterByType } from "./filter-by-type";

// FIXME: Add type
export const parseConversationResponse = (response): any[] => {
  const { included = [] } = response;

  const entities = filterByType(
    included,
    "com.linkedin.voyager.identity.shared.MiniProfile"
  );

  const conversations = filterByType(
    included,
    "com.linkedin.voyager.messaging.Conversation"
  );

  const messagingMembers = filterByType(
    included,
    "com.linkedin.voyager.messaging.MessagingMember"
  );

  const parsedData = entities.reduce((prev, current) => {
    const entityId = current?.entityUrn.split(":").pop();

    const conversation = conversations.find((conversation) => {
      return conversation["*participants"].some((participant) =>
        participant.includes(entityId)
      );
    });

    const messagingMember = messagingMembers.find((member) => {
      return member.entityUrn.includes(entityId);
    });

    const currentData = {
      entity: current,
      messagingMember,
      conversation,
    };

    return [...prev, currentData];
  }, []);

  return parsedData;
};
