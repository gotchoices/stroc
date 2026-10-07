import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fromPlain } from '@stroc/core'
import { MemoryStore, compose } from '@stroc/compose'
import { findInScope, numberWithin, joinNumber } from '../src/includes.js'
import { normalizeSource } from '../src/sources.js'

const fixture = (name: string) => fromPlain(JSON.parse(readFileSync(
  new URL(`../../core/test/fixtures/${name}.json`, import.meta.url), 'utf8'))).value

async function contract() {
  const store = new MemoryStore()
  await store.putDocument(fixture('clause'))
  return compose(await store.putDocument(fixture('contract')), store)
}

describe('reference numbers within an included document', () => {
  it('finds ids in a document scope', async () => {
    const c = await contract()
    expect(findInScope(c.sections, 'terms')?.number).toEqual([2])
    expect(findInScope(c.sections, 'duties')?.number).toEqual([1])
  })
  it('does not find ids that belong to an included document without its path', async () => {
    const c = await contract()
    expect(findInScope(c.sections, 'cure')).toBeUndefined()
  })
  it('follows paths into includes', async () => {
    const c = await contract()
    expect(numberWithin(c, ['duties', 'cure'])).toEqual([1, 3])
    expect(numberWithin(c, ['duties'])).toEqual([1])
    expect(numberWithin(c, ['terms', 'x'])).toBeUndefined()
    expect(numberWithin(c, ['nope'])).toBeUndefined()
  })
  it('joins numbers under the including section', () => {
    expect(joinNumber('3', [1, 2])).toBe('3.1.2')
    expect(joinNumber('3', [])).toBe('3')
  })
})

describe('normalizeSource', () => {
  it('accepts hosts and URLs, dropping trailing slashes', () => {
    expect(normalizeSource('localhost:3001')).toBe('http://localhost:3001')
    expect(normalizeSource('https://example.org/stroc/')).toBe('https://example.org/stroc')
    expect(normalizeSource('https://ipfs.io')).toBe('https://ipfs.io')
  })
})
