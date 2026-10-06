import { describe, it, expect } from 'vitest'
import { CID } from 'multiformats/cid'
import { validateDocument } from '../src/index.js'

const ETHICS = CID.parse('baguqeeraoqsvkl57icpvp2tm52uhmryobrrof557ya5cpnq7isfstfgsxwoa')
const OLD = CID.parse('baguqeera23wj73l2maypjd4rsenk2gybqesgrydiyhia55u3t2zosx6at2va')
const DAG_PB = CID.parse('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')

const base = { stroc: '0.1', language: 'en', title: 'Tally Agreement' }

// Codes of all problems, optionally with their paths.
const codes = (doc: unknown) => validateDocument(doc).problems.map(p => p.code)
const at = (doc: unknown) => validateDocument(doc).problems.map(p => `${p.path.join('.')}:${p.code}`)

describe('valid documents', () => {
  it('accepts a minimal document', () => {
    expect(validateDocument(base)).toEqual({ valid: true, problems: [], warnings: [], external: [] })
  })
  it('accepts a full document', () => {
    const doc = {
      ...base,
      author: 'MyCHIPs.org',
      published: '2026-10-06',
      text: 'This Agreement is between the <b>Stock Holder</b> and the Foil Holder. See <ref:cure> and <ref:ethics/good-faith>.',
      parameters: [
        { key: 'stock-name', label: 'Stock Holder' },
        { key: 'limit', label: 'Maximum Balance', default: '24' },
      ],
      replaces: [OLD],
      sections: [
        { id: 'ethics', source: ETHICS },
        { title: 'Default', sections: [
          { id: 'notice', title: 'Notice of Default', text: 'Per <ref:cure>.' },
          { id: 'cure', title: 'Cure of Default', text: 'Within 10 days of <ref:notice>.' },
          { text: 'An untitled paragraph.' },
        ] },
      ],
    }
    const r = validateDocument(doc)
    expect(r.problems).toEqual([])
    expect(r.valid).toBe(true)
    expect(r.external).toEqual([{ path: ['ethics', 'good-faith'], at: ['text'], offset: 90 }])
  })
})

describe('malformed input never throws', () => {
  for (const [label, input] of [
    ['null', null], ['a number', 5], ['a string', 'doc'], ['an array', []],
    ['text array', { ...base, text: [['a']] }],
    ['title number', { ...base, title: 5 }],
    ['sections object', { ...base, sections: { a: 1 } }],
    ['section null', { ...base, sections: [null] }],
    ['parameters string', { ...base, parameters: 'x' }],
    ['source string', { ...base, sections: [{ id: 'a', source: 'baguqeera' }] }],
  ] as [string, unknown][]) {
    it(`reports ${label}`, () => {
      const r = validateDocument(input)
      expect(r.valid).toBe(false)
      expect(r.problems.length).toBeGreaterThan(0)
    })
  }
})

describe('document fields', () => {
  it('requires stroc, language, title', () => {
    expect(at({})).toEqual(['stroc:missing', 'language:missing', 'title:missing'])
  })
  it('rejects unknown fields', () => {
    expect(at({ ...base, name: 'X', version: 2 })).toEqual(['name:unknown-field', 'version:unknown-field'])
  })
  it('checks the format version', () => {
    expect(codes({ ...base, stroc: '1.0' })).toEqual(['version-too-new'])
    expect(codes({ ...base, stroc: 'banana' })).toEqual(['unknown-version'])
    expect(codes({ ...base, stroc: 0.1 })).toEqual(['not-string'])
  })
  it('checks the language tag', () => {
    expect(codes({ ...base, language: 'eng' })).toEqual([])
    expect(validateDocument({ ...base, language: 'en-us' }).problems[0].message).toContain('"en-US"')
    expect(codes({ ...base, language: 'Klingon!!' })).toEqual(['bad-language'])
  })
  it('checks the published date', () => {
    expect(codes({ ...base, published: '2026-02-30' })).toEqual(['bad-date'])
    expect(codes({ ...base, published: 'next tuesday' })).toEqual(['bad-date'])
  })
  it('applies text rules to every string', () => {
    expect(at({ ...base, title: ' Spaced', author: 'A B' })).toEqual(['title:leading-space', 'author:whitespace'])
  })
  it('rejects empty values instead of dropping them', () => {
    expect(at({ ...base, text: '' })).toEqual(['text:empty'])
    expect(at({ ...base, sections: [] })).toEqual(['sections:empty'])
  })
  it('allows markup characters as plain text in titles', () => {
    expect(codes({ ...base, title: 'A <b> \\ title' })).toEqual([])
  })
  it('checks markup in text', () => {
    expect(at({ ...base, text: 'if a < b' })).toEqual(['text:bad-tag'])
  })
  it('warns about entity-like text', () => {
    const r = validateDocument({ ...base, text: 'Tom &amp; Jerry' })
    expect(r.valid).toBe(true)
    expect(r.warnings.map(w => w.code)).toEqual(['entity-like'])
  })
})

describe('sections', () => {
  it('rejects empty sections', () => {
    expect(at({ ...base, sections: [{}] })).toEqual(['sections.0:empty-section'])
  })
  it('rejects unknown section fields, including the old alias', () => {
    expect(at({ ...base, sections: [{ title: 'A', as: 'x' }] })).toEqual(['sections.0.as:unknown-field'])
  })
  it('requires include sections to have exactly id and source', () => {
    expect(at({ ...base, sections: [{ source: ETHICS }] })).toEqual(['sections.0.id:missing-id'])
    expect(at({ ...base, sections: [{ id: 'e', source: ETHICS, text: 'x' }] })).toEqual(['sections.0.text:unknown-field'])
  })
  it('requires source to be a DAG-JSON link', () => {
    expect(at({ ...base, sections: [{ id: 'e', source: 'baguqeera...' }] })).toEqual(['sections.0.source:bad-link'])
    expect(at({ ...base, sections: [{ id: 'e', source: DAG_PB }] })).toEqual(['sections.0.source:bad-link'])
  })
})

describe('ids and references', () => {
  it('checks id syntax', () => {
    expect(at({ ...base, sections: [{ id: 'Cure', text: 'x' }] })).toEqual(['sections.0.id:bad-id'])
  })
  it('requires ids unique across the whole document', () => {
    const doc = { ...base, sections: [
      { id: 'a', text: 'x' },
      { title: 'B', sections: [{ id: 'a', text: 'y' }] },
    ] }
    expect(at(doc)).toEqual(['sections.1.sections.0.id:duplicate-id'])
  })
  it('allows duplicate titles', () => {
    expect(codes({ ...base, sections: [{ title: 'Same', text: 'a' }, { title: 'Same', text: 'b' }] })).toEqual([])
  })
  it('resolves references anywhere in the document', () => {
    const doc = { ...base, text: 'See <ref:deep>.', sections: [{ title: 'A', sections: [{ id: 'deep', text: 'x' }] }] }
    expect(codes(doc)).toEqual([])
  })
  it('reports unresolved references', () => {
    expect(at({ ...base, text: 'See <ref:nope>.' })).toEqual(['text:unresolved-ref'])
  })
  it('only continues a path through an include', () => {
    const doc = { ...base, text: 'See <ref:a/b>.', sections: [{ id: 'a', text: 'x' }] }
    expect(codes(doc)).toEqual(['bad-ref-path'])
  })
  it('returns references into includes for composition to check', () => {
    const doc = { ...base, sections: [{ id: 'e', source: ETHICS }, { text: 'Under <ref:e/x/y>.' }] }
    expect(validateDocument(doc).external).toEqual([{ path: ['e', 'x', 'y'], at: ['sections', 1, 'text'], offset: 6 }])
  })
})

describe('replaces', () => {
  it('requires DAG-JSON links without duplicates', () => {
    expect(at({ ...base, replaces: [OLD, OLD] })).toEqual(['replaces.1:duplicate'])
    expect(at({ ...base, replaces: ['baguqeera...'] })).toEqual(['replaces.0:bad-link'])
    expect(at({ ...base, replaces: [] })).toEqual(['replaces:empty'])
  })
})

describe('parameters', () => {
  it('checks keys, labels and defaults', () => {
    const doc = { ...base, parameters: [
      { key: 'a', label: 'A' },
      { key: 'a', label: 'Again' },
      { key: 'Bad Key', label: 'B' },
      { label: 'No key' },
      { key: 'c' },
      { key: 'd', label: 'D', default: '', type: 'date' },
    ] }
    expect(at(doc)).toEqual([
      'parameters.1.key:duplicate-key',
      'parameters.2.key:bad-id',
      'parameters.3.key:missing',
      'parameters.4.label:missing',
      'parameters.5.type:unknown-field',
      'parameters.5.default:empty',
    ])
  })
})
