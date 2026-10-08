import { describe, it, expect, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { setSha256, resetSha256, documentCid, verifyDocument, encodeDagJson } from '../src/index.js'

const doc = { stroc: '1.0', language: 'en', title: 'Example Document', text: 'This is a sentence.' }
const GOLDEN = 'baguqeeracqxwoqi4pg3ab52w46ilo7rshuk7l2agc7erux64ocjkiqk22zeq'   // minimal fixture
const nodeSha = (b: Uint8Array) => new Uint8Array(createHash('sha256').update(b).digest())

afterEach(() => resetSha256())

describe('setSha256', () => {
  it('accepts a correct implementation, and CIDs are unchanged', async () => {
    let calls = 0
    await setSha256(b => { calls++; return nodeSha(b) })
    expect((await documentCid(doc)).cid?.toString()).toBe(GOLDEN)
    expect(calls).toBeGreaterThan(4)            // self-test plus the document
  })
  it('accepts an asynchronous (for example native) implementation', async () => {
    await setSha256(async b => nodeSha(b))
    expect((await documentCid(doc)).cid?.toString()).toBe(GOLDEN)
    expect((await verifyDocument(encodeDagJson(doc), GOLDEN)).ok).toBe(true)
  })
  it('rejects a wrong implementation and keeps the previous one', async () => {
    await expect(setSha256(() => new Uint8Array(32))).rejects.toThrow('self-test')
    await expect(setSha256(b => nodeSha(b.length > 1000 ? b.slice(1) : b))).rejects.toThrow('1000003 bytes')
    await expect(setSha256(() => { throw new Error('native module missing') })).rejects.toThrow('native module missing')
    expect((await documentCid(doc)).cid?.toString()).toBe(GOLDEN)
  })
})
