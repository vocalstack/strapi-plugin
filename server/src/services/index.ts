import { factories } from '@strapi/strapi'

import { TRANSCRIPT_UID } from '../lib/types'
import settings from './settings'
import transcriber from './transcriber'

export default {
  settings,
  // The core service behind the content API's transcript controller.
  transcript: factories.createCoreService(TRANSCRIPT_UID as never),
  transcriber,
}
