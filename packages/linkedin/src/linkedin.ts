import * as puppeteer from "puppeteer";
import { Page, Browser } from "puppeteer";

class LinkedIn {
  readonly options: any = {
    sessionCookieValue: "",
    keepAlive: false,
    timeout: 10000,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
    headless: false,
  };

  private browser: Browser | null = null;
  private sessionCookie: string | null = null;

  constructor() {}

  /**
   * Setup function
   *
   * @returns {void}
   */
  public setup = async (): Promise<void> => {
    try {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          ...(this.options.headless
            ? "---single-process"
            : "---start-maximized"),
        ],
        timeout: this.options.timeout,
      });
    } catch (err) {
      this.browser.close();
      throw err;
    }
  };

  /**
   * Log in and get 'li_at' cookie value
   *
   * @returns {string} cookie value
   */
  public async login(): Promise<string> {
    try {
      await this.setup();

      const page: Page = await this.browser.newPage();
      await page.goto("https://www.linkedin.com/login");
      // This needs to be refactored because waitFor function will be deprecated
      // in a future. I've tried with waitForFunction but has some problems with
      // async functions
      // @ts-ignore
      await page.waitFor(() => !document.querySelector("#password"));

      const cookies = await page.cookies();
      const authCookie = cookies.find(({ name }) => name === "li_at");

      if (authCookie) this.sessionCookie = authCookie.value;
      else throw new Error("Error Getting Cookie");

      return this.sessionCookie;
    } catch (error) {
      throw new Error(error.message);
    } finally {
      this.browser.close();
    }
  }

  /**
   *
   */
  public async getMessages(sessionCookie: string): Promise<any[]> {
    try {
      await this.setup();

      const page: Page = await this.browser.newPage();
      await page.setCookie({
        name: "li_at",
        value: sessionCookie,
        domain: ".www.linkedin.com",
      });

      await page.goto("https://www.linkedin.com/messaging");

      await page.setRequestInterception(true);

      page.on("request", (request) => {
        request.continue();
      });

      let messagesThreads = [];

      page.on("response", async (response) => {
        const conversationApiEndpoint = "/api/messaging/conversations";
        if (response.url().includes(conversationApiEndpoint)) {
          const res: any = await response.json();

          const entities = res?.included?.filter(
            (thread) =>
              thread?.$type ===
              "com.linkedin.voyager.identity.shared.MiniProfile"
          );

          const conversations = res?.included?.filter(
            (thread) =>
              thread?.$type === "com.linkedin.voyager.messaging.Conversation"
          );

          const messagingMembers = res?.included?.filter(
            (thread) =>
              thread?.$type === "com.linkedin.voyager.messaging.MessagingMember"
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
              ...messagingMember,
              ...conversation,
              ...current,
            };

            return [...prev, currentData];
          }, []);

          messagesThreads = [...messagesThreads, ...parsedData];
        }
      });

      const container = ".msg-conversations-container__conversations-list";
      await page.waitForSelector(
        ".msg-conversations-container__conversations-list"
      );

      let threads = [];
      const maxThreads = 100;
      let previousHeight;
      let keepSearching = true;
      const containerElement = await page.$(container);

      while (threads.length < maxThreads && keepSearching) {
        threads = [...(await page.$$("li.msg-conversation-listitem"))];

        const newPreviousHeight = await page.evaluate(
          (e) => e.scrollHeight,
          containerElement
        );

        if (newPreviousHeight !== previousHeight)
          previousHeight = newPreviousHeight;
        else keepSearching = false;

        await page.evaluate(
          // @ts-ignore
          (e) => e.scrollTo(0, e.scrollHeight),
          containerElement
        );

        await page.waitForFunction(
          (e, ph) => e.scrollHeight >= ph,
          {},
          containerElement,
          previousHeight
        );

        await page.waitForTimeout(1000);
      }

      messagesThreads = messagesThreads.sort((a, b) => b?.lastActivityAt - a?.lastActivityAt);

      return threads;
    } catch (error) {
      throw new Error(error.message);
    } finally {
      this.browser.close();
    }
  }
}

export default LinkedIn;
