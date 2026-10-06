import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CID } from 'multiformats/cid'
import { fromPlain, toPlain, documentCid, verifyDocument, encodeDagJson, cidOfValue, computeCid } from '../src/index.js'

function fixture(name: string): unknown {
  const plain = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
  const { value, problems } = fromPlain(plain)
  expect(problems).toEqual([])
  return value
}

// GOLDEN VECTORS. These pin the whole hashing pipeline: canonical form, DAG-JSON encoding, SHA-256
// and CID construction. A failure here means every document published under the current format
// would get a new identity. Change an expected value only as a deliberate format change, together
// with the `stroc` version.
const GOLDEN: Record<string, string> = {
  minimal: 'baguqeera23wj73l2maypjd4rsenk2gybqesgrydiyhia55u3t2zosx6at2va',
  clause: 'baguqeerajvalsjwwhumendz7fedvc7sscqwvjcwiwdflwozdvhpor6jg32dq',
  markup: 'baguqeeral3x6fb2w2ki4tkdjvkchbqwtgrpf62ticqiqakwdj5vhccxb3uva',
  unicode: 'baguqeeraflz7y4q7nim4pqvgjwbeajmm2auo7azqfkhozuuzmawvhbay5yoq',
  contract: 'baguqeera7usd5pm43tx4rx6nretjizkmq3mvlprxhoodwqvgqmnoblz37swq',
}

describe('golden vectors', () => {
  for (const [name, expected] of Object.entries(GOLDEN)) {
    it(`${name} hashes to its recorded CID`, async () => {
      const r = await documentCid(fixture(name))
      expect(r.validation.problems).toEqual([])
      expect(r.cid?.toString()).toBe(expected)
    })
  }

  it('encodes canonical DAG-JSON exactly', () => {
    const text = new TextDecoder().decode(encodeDagJson(fixture('minimal')))
    expect(text).toBe('{"language":"en","stroc":"0.1","text":"This is a sentence.","title":"Example Document"}')
  })

  it('encodes a link as {"/": cid}', () => {
    const text = new TextDecoder().decode(encodeDagJson(fixture('contract')))
    expect(text).toContain('"source":{"/":"baguqeerajvalsjwwhumendz7fedvc7sscqwvjcwiwdflwozdvhpor6jg32dq"}')
  })

  it('the contract includes the clause by its golden CID', () => {
    const contract = fixture('contract') as { sections: { source?: CID }[] }
    expect(contract.sections[0].source?.toString()).toBe(GOLDEN.clause)
  })

  it('every Stroc CID begins baguqeera', () => {
    for (const cid of Object.values(GOLDEN)) expect(cid.startsWith('baguqeera')).toBe(true)
  })
})

describe('documentCid', () => {
  it('refuses a non-canonical document rather than fixing it', async () => {
    const r = await documentCid({ stroc: '0.1', language: 'en', title: 'Title ' })
    expect(r.cid).toBeUndefined()
    expect(r.validation.problems.map(p => p.code)).toEqual(['trailing-space'])
  })
  it('refuses unknown fields rather than dropping them', async () => {
    const r = await documentCid({ stroc: '0.1', language: 'en', title: 'T', name: 'x' })
    expect(r.cid).toBeUndefined()
  })
})

describe('verifyDocument', () => {
  const doc = () => fixture('clause')
  const bytes = () => encodeDagJson(doc())
  const enc = (s: string) => new TextEncoder().encode(s)

  it('accepts matching canonical bytes', async () => {
    const r = await verifyDocument(bytes(), GOLDEN.clause)
    expect(r.ok).toBe(true)
    expect(r.document?.title).toBe('Duties of the Parties')
  })
  it('accepts a CID object', async () => {
    expect((await verifyDocument(bytes(), CID.parse(GOLDEN.clause))).ok).toBe(true)
  })
  it('rejects a mismatch', async () => {
    const r = await verifyDocument(bytes(), GOLDEN.minimal)
    expect(r.problems.map(p => p.code)).toEqual(['cid-mismatch'])
  })
  it('rejects tampered bytes', async () => {
    const tampered = enc(new TextDecoder().decode(bytes()).replace('10 days', '30 days'))
    expect((await verifyDocument(tampered, GOLDEN.clause)).problems[0].code).toBe('cid-mismatch')
  })
  it('rejects non-canonical bytes even when the CID matches them', async () => {
    const pretty = enc(JSON.stringify(toPlain(doc()), null, 2))
    const r = await verifyDocument(pretty, await computeCid(pretty))
    expect(r.problems.map(p => p.code)).toEqual(['not-canonical'])
  })
  it('rejects valid DAG-JSON that is not a valid document', async () => {
    const value = { stroc: '0.1', language: 'en', title: 'T', name: 'extra' }
    const b = encodeDagJson(value)
    const r = await verifyDocument(b, await cidOfValue(value))
    expect(r.ok).toBe(false)
    expect(r.problems.map(p => p.code)).toEqual(['unknown-field'])
  })
  it('rejects claimed CIDs of the wrong kind', async () => {
    expect((await verifyDocument(bytes(), 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')).problems[0].code).toBe('bad-cid')
    expect((await verifyDocument(bytes(), 'not a cid')).problems[0].code).toBe('bad-cid')
  })
  it('rejects bytes that are not DAG-JSON', async () => {
    const junk = enc('not json')
    expect((await verifyDocument(junk, await computeCid(junk))).problems[0].code).toBe('bad-encoding')
  })
})

describe('fromPlain / toPlain', () => {
  it('round-trips links', () => {
    const plain = { source: { '/': GOLDEN.clause }, list: [{ '/': GOLDEN.minimal }] }
    const { value, problems } = fromPlain(plain)
    expect(problems).toEqual([])
    expect(CID.asCID((value as { source: unknown }).source)).toBeTruthy()
    expect(toPlain(value)).toEqual(plain)
  })
  it('reports malformed links', () => {
    expect(fromPlain({ s: { '/': 'nope' } }).problems.map(p => p.path.join('.'))).toEqual(['s'])
    expect(fromPlain({ s: { '/': GOLDEN.clause, x: 1 } }).problems[0].code).toBe('bad-link')
  })
})
