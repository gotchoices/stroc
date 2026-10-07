// SHA-256 for CIDs, in pure JavaScript (@noble/hashes) so hashing works the same in browsers, Node
// and React Native (Hermes has no WebCrypto). The digest is the standard one; only the
// implementation differs from multiformats' default, which uses WebCrypto or Node's crypto.
import { from } from 'multiformats/hashes/hasher'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2'

export const sha256 = from({ name: 'sha2-256', code: 0x12, encode: (input: Uint8Array) => nobleSha256(input) })
