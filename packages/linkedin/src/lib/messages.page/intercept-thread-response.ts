import * as puppeteer from "puppeteer";
import { LINKEDIN_CONVERSATIONS_ENDPOINT } from "../constants/linkedin";
import { filterByType } from "./helpers/filter-by-type";

export let thread: any = {};

export const interceptThreadResponse = async (
  response: puppeteer.Response
): Promise<void> => {
  const responseUrl = response.url();
  const shouldIntercept = responseUrl.includes(LINKEDIN_CONVERSATIONS_ENDPOINT);

  if (shouldIntercept) {
    const res: any = await response.json();
    const { included = [] } = res;

    const entities = filterByType(
      included,
      "com.linkedin.voyager.identity.shared.MiniProfile"
    );

    let events = filterByType(included, "com.linkedin.voyager.messaging.Event");

    const members = filterByType(
      included,
      "com.linkedin.voyager.messaging.MessagingMember"
    );

    if (thread?.events) events = [...thread?.events, ...events];

    thread = {
      ...thread,
      members,
      entities,
      events,
    };
  }
};
