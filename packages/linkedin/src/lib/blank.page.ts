import { LOGIN_URL, THREADS_URL } from "./constants/linkedin";
import { LinkedIn } from "./index";
import { LoginPage } from "./login.page";
import { MessagesPage } from "./messages.page";
import { Section } from "./pages";

const goToLogin = async (
  crawler: LinkedIn
): Promise<LinkedIn<typeof LoginPage>> => {
  await crawler.page.goto(LOGIN_URL);

  return { ...crawler, currentPage: LoginPage };
};

const setSessionCookie = async (
  crawler: LinkedIn,
  sessionCookie: string
): Promise<LinkedIn<typeof BlankPage>> => {
  const { page } = crawler;
  await page.setCookie({
    name: "li_at",
    value: sessionCookie,
    domain: ".www.linkedin.com",
  });

  return { ...crawler, page, currentPage: BlankPage };
};

const goToMessages = async (
  crawler: LinkedIn
): Promise<LinkedIn<typeof MessagesPage>> => {
  const { page } = crawler;

  await page.goto(THREADS_URL);

  const cookies = await page.cookies();
  const authCookie = cookies.find(({ name }) => name === "li_at");

  if (!authCookie) throw new Error("No session cookie found");

  return { ...crawler, currentPage: MessagesPage };
};

export const BlankPage = {
  setSessionCookie,
  goTo: {
    [Section.Login]: goToLogin,
    [Section.Messages]: goToMessages,
  },
};
