import { factories } from '@strapi/strapi'

import { TRANSCRIPT_UID } from '../lib/types'
import vocalstack from './vocalstack'

export default {
  // find / findOne / update for the content API (REST); enable them per role in Users & Permissions.
  transcript: factories.createCoreController(TRANSCRIPT_UID as never),
  vocalstack,
}
