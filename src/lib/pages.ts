// eslint-disable-next-line import/no-cycle
import { BlankPage } from './blank.page'
// eslint-disable-next-line import/no-cycle
import { LoginPage } from './login.page'
// eslint-disable-next-line import/no-cycle
import { MessagesPage } from './messages.page'
import { Section } from './types/sections.types'

export const SectionPages: any = {
  [Section.Blank]: BlankPage,
  [Section.Login]: LoginPage,
  [Section.Messages]: MessagesPage,
}
