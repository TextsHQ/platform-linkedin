import * as puppeteer from "puppeteer";
import { filterByType } from "./helpers/filter-by-type";

export let messagesThreads = [];

export const interceptMessagesThreadsResponse = async (
  response: puppeteer.Response
): Promise<void> => {
  const conversationApiEndpoint = "/api/messaging/conversations";
  const responseUrl = response.url();
  const shouldIntercept = responseUrl.includes(conversationApiEndpoint);

  if (shouldIntercept) {
    const res: any = await response.json();
    const { included = [] } = res;

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

    messagesThreads = [...messagesThreads, ...parsedData];
  }
};
