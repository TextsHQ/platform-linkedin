import { FaLinkedin } from 'react-icons/fa'
import { PlatformInfo, MessageDeletionMode, Attribute } from '@textshq/platform-sdk'

const info: PlatformInfo = {
  name: 'linkedin',
  version: '0.0.1',
  displayName: 'LinkedIn',
  icon: FaLinkedin as any,
  loginMode: 'manual',
  deletionMode: MessageDeletionMode.UNSUPPORTED,
  attributes: new Set([
    Attribute.NO_CACHE,
  ]),
}

export default info
