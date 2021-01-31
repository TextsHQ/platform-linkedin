import type { Platform } from '@textshq/platform-sdk'

export default {
  get info() {
    // eslint-disable-next-line global-require
    return require('./info').default
  },

  get api() {
    // eslint-disable-next-line global-require
    return require('./api').default
  },
} as Platform
