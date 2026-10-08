// SHA-256 for CIDs. The default is pure JavaScript (@noble/hashes), so hashing works the same in
// browsers, Node and React Native (Hermes has no WebCrypto). An app may supply its own
// implementation (for example a native module on a phone) with setSha256; it is checked against
// known digests first, because a wrong implementation would silently produce wrong CIDs.
import { from } from 'multiformats/hashes/hasher'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'

export type Sha256 = (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>

let current: Sha256 = nobleSha256

export const sha256 = from({ name: 'sha2-256', code: 0x12, encode: (input: Uint8Array) => current(input) })

const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

// FIPS 180-2 test vectors, and a large input checked against the built-in implementation (which
// exercises block handling the short vectors do not).
const VECTORS: [Uint8Array, string][] = [
  [ascii(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  [ascii('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
]

// Use a different SHA-256 implementation from now on. Rejects (and keeps the current one) if it
// does not produce correct digests.
export async function setSha256(fn: Sha256): Promise<void> {
  const big = Uint8Array.from({ length: 1_000_003 }, (_, i) => (i * 31 + 7) & 255)
  const cases: [Uint8Array, string][] = [...VECTORS, [big, hex(nobleSha256(big))]]
  for (const [input, expected] of cases) {
    let got: string
    try { got = hex(await fn(input)) } catch (err) { throw new Error(`SHA-256 implementation failed its self-test: ${(err as Error).message}`) }
    if (got !== expected) throw new Error(`SHA-256 implementation failed its self-test (input of ${input.length} bytes)`)
  }
  current = fn
}

// Go back to the built-in pure-JavaScript implementation.
export function resetSha256(): void {
  current = nobleSha256
}
