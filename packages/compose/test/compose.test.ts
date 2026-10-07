import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CID } from 'multiformats/cid'
import { fromPlain, encodeDagJson } from '@stroc/core'
import { MemoryStore, compose, findMissing, firstOf, formatNumber, type ComposedInline, type ComposedSection, type Resolver } from '../src/index.js'

const fixture = (name: string) => fromPlain(JSON.parse(readFileSync(
  new URL(`../../core/test/fixtures/${name}.json`, import.meta.url), 'utf8'))).value as Record<string, unknown>

const CLAUSE = 'baguqeerajvalsjwwhumendz7fedvc7sscqwvjcwiwdflwozdvhpor6jg32dq'
const base = { stroc: '0.1', language: 'en' }

async function library(...docs: unknown[]) {
  const store = new MemoryStore()
  const cids: CID[] = []
  for (const d of docs) cids.push(await store.putDocument(d))
  return { store, cids }
}

const refTargets = (nodes?: ComposedInline[]): (string | undefined)[] => (nodes ?? []).flatMap(n =>
  n.type === 'ref' ? [n.target && formatNumber(n.target)] : n.type === 'emphasis' ? refTargets(n.children) : [])

const find = (sections: ComposedSection[], number: string): ComposedSection | undefined => {
  for (const s of sections) {
    if (formatNumber(s.number) === number) return s
    const inner = find(s.sections, number)
    if (inner) return inner
  }
}

describe('compose', () => {
  it('composes a contract with its included clause', async () => {
    const { store, cids } = await library(fixture('clause'), fixture('contract'))
    expect(cids[0].toString()).toBe(CLAUSE)
    const c = await compose(cids[1], store)
    expect(c.problems).toEqual([])
    expect(c.title).toBe('Tally Agreement')
    const duties = c.sections[0]
    expect(duties.number).toEqual([1])
    expect(duties.title).toBe('Duties of the Parties')
    expect(duties.include?.cid.toString()).toBe(CLAUSE)
    expect(duties.sections.map(s => [formatNumber(s.number), s.title])).toEqual([
      ['1.1', 'Good Faith'], ['1.2', 'Notice of Default'], ['1.3', 'Cure of Default'], ['1.4', undefined],
    ])
    expect(c.sections[1].number).toEqual([2])
  })

  it('resolves references in every scope', async () => {
    const { store, cids } = await library(fixture('clause'), fixture('contract'))
    const c = await compose(cids[1], store)
    expect(refTargets(c.text)).toEqual(['1.2'])                       // <ref:duties/notice>
    expect(refTargets(find(c.sections, '2')?.text)).toEqual(['2'])     // <ref:terms>
    expect(refTargets(find(c.sections, '1.2')?.text)).toEqual(['1.3']) // clause's <ref:cure>
    expect(refTargets(find(c.sections, '1.3')?.text)).toEqual(['1.2']) // clause's <ref:notice>
  })

  it('gathers parameters with their paths', async () => {
    const clause = { ...fixture('clause'), parameters: [{ key: 'days', label: 'Cure Period', default: '10' }] }
    const { store, cids } = await library(clause)
    const contract = { ...base, title: 'C', parameters: [{ key: 'party', label: 'Party' }], sections: [{ id: 'duties', source: cids[0] }] }
    const root = await store.putDocument(contract)
    const c = await compose(root, store)
    expect(c.parameters.map(g => [g.prefix.join('/'), g.section && formatNumber(g.section.number), g.parameters.map(p => p.key)])).toEqual([
      ['', undefined, ['party']],
      ['duties', '1', ['days']],
    ])
  })

  it('numbers a document included twice in both places', async () => {
    const { store, cids } = await library(fixture('minimal'))
    const root = await store.putDocument({ ...base, title: 'Twice', sections: [{ id: 'a', source: cids[0] }, { id: 'b', source: cids[0] }] })
    const c = await compose(root, store)
    expect(c.problems).toEqual([])
    expect(c.sections.map(s => [s.number, s.title])).toEqual([[[1], 'Example Document'], [[2], 'Example Document']])
  })

  it('reports a missing included document', async () => {
    const store = new MemoryStore()
    const root = await store.putDocument(fixture('contract'))
    const c = await compose(root, store)
    expect(c.problems.map(p => p.code)).toEqual(['missing-document', 'unresolved-ref'])
    expect((await findMissing(root, store)).map(String)).toEqual([CLAUSE])
  })

  it('rejects content that does not match its CID', async () => {
    const liar: Resolver = { get: async () => encodeDagJson(fixture('minimal')) }
    const c = await compose(CLAUSE, liar)
    expect(c.document).toBeUndefined()
    expect(c.problems.map(p => p.code)).toEqual(['invalid-document'])
  })

  it('reports references that do not resolve after composition', async () => {
    const { store, cids } = await library(fixture('clause'))
    const root = await store.putDocument({ ...base, title: 'Bad', text: 'See <ref:duties/nope>.', sections: [{ id: 'duties', source: cids[0] }] })
    const c = await compose(root, store)
    expect(c.problems.map(p => p.code)).toEqual(['unresolved-ref'])
  })

  it('tries resolvers in order', async () => {
    const a = new MemoryStore(), b = new MemoryStore()
    const cid = await b.putDocument(fixture('minimal'))
    expect(await firstOf(a, b).get(cid)).toBeDefined()
    expect(await firstOf(a).get(cid)).toBeUndefined()
  })
})
