import { describe, it, expect } from 'vitest'
import { fromPlain as coreFromPlain, documentCid } from '@stroc/core'
import {
  fromPlain, toPlain, newDoc, newSection, locate, allSections, sectionAtPath, moveUp, moveDown, indent,
  outdent, remove, place, splitParagraph, mergeWithPrevious, uniqueId, renameId, replaceInclude, includeCids,
  type EditDoc,
} from '../src/model.js'

const CLAUSE = 'baguqeerajvalsjwwhumendz7fedvc7sscqwvjcwiwdflwozdvhpor6jg32dq'

function sample(): EditDoc {
  return fromPlain({
    stroc: '0.1', language: 'en', title: 'T',
    text: 'See <ref:b> and <ref:inc/cure>.',
    sections: [
      { id: 'a', title: 'A', text: 'One.' },
      { id: 'b', title: 'B', sections: [{ text: 'B one.' }, { text: 'B two.' }] },
      { id: 'inc', source: { '/': CLAUSE } },
      { text: 'Last.' },
    ],
  })
}

const shape = (doc: EditDoc) => allSections(doc).map(s => `${s.number}:${s.section.title ?? s.section.text ?? s.section.source?.slice(0, 8)}`)

describe('conversion', () => {
  it('round-trips the plain form and stays hashable', async () => {
    const plain = toPlain(sample())
    expect(plain).toMatchObject({ sections: [{ id: 'a' }, { id: 'b' }, { id: 'inc', source: { '/': CLAUSE } }, { text: 'Last.' }] })
    const r = await documentCid(coreFromPlain(plain).value)
    expect(r.validation.problems).toEqual([])
    expect(toPlain(fromPlain(plain))).toEqual(plain)
  })
  it('drops empty sections and values, tidies text and markup', () => {
    const doc = newDoc()
    doc.title = '  Spaced  title '
    doc.sections.push(newSection(), newSection({ title: '', text: '' }), newSection({ text: '<i><b>x</b></i>  y ' }))
    doc.parameters.push({ key: '', label: '' })
    expect(toPlain(doc)).toEqual({ stroc: '0.1', language: 'en', title: 'Spaced title', sections: [{ text: '<b><i>x</i></b> y' }] })
  })
  it('accepts older files with as and string sources', () => {
    const doc = fromPlain({ stroc: '0.1', language: 'en', title: 'T', sections: [{ as: 'x', source: CLAUSE }] })
    expect(doc.sections[0]).toMatchObject({ id: 'x', source: CLAUSE })
  })
})

describe('navigation', () => {
  it('numbers sections, not descending into includes', () => {
    expect(shape(sample())).toEqual(['1:A', '2:B', '2.1:B one.', '2.2:B two.', '3:baguqeer', '4:Last.'])
  })
  it('finds the section at a validation path', () => {
    const doc = sample()
    expect(sectionAtPath(doc, ['sections', 1, 'sections', 0, 'text'])?.text).toBe('B one.')
    expect(sectionAtPath(doc, ['title'])).toBeUndefined()
  })
})

describe('structure', () => {
  it('moves, indents and outdents', () => {
    const doc = sample()
    const last = doc.sections[3].key
    expect(moveUp(doc, last)).toBe(true)
    expect(shape(doc)).toEqual(['1:A', '2:B', '2.1:B one.', '2.2:B two.', '3:Last.', '4:baguqeer'])
    const a = doc.sections[0].key
    expect(indent(doc, a)).toBe(false)           // first: nothing to indent under
    const bOne = doc.sections[1].sections[0].key
    expect(outdent(doc, bOne)).toBe(true)
    expect(shape(doc)).toEqual(['1:A', '2:B', '2.1:B two.', '3:B one.', '4:Last.', '5:baguqeer'])
    expect(indent(doc, bOne)).toBe(true)
    expect(shape(doc)).toEqual(['1:A', '2:B', '2.1:B two.', '2.2:B one.', '3:Last.', '4:baguqeer'])
    expect(moveDown(doc, a)).toBe(true)
  })
  it('will not indent under an include', () => {
    const doc = sample()
    expect(indent(doc, doc.sections[3].key)).toBe(false)
  })
  it('places before, after and into; copies with new keys and no ids', () => {
    const doc = sample()
    const [a, b] = [doc.sections[0], doc.sections[1]]
    expect(place(doc, a.key, b.key, 'into')).toBe(true)
    expect(shape(doc).slice(0, 4)).toEqual(['1:B', '1.1:B one.', '1.2:B two.', '1.3:A'])
    expect(place(doc, b.key, a.key, 'after')).toBe(false)   // not inside itself
    expect(place(doc, a.key, b.key, 'before', true)).toBe(true)
    expect(doc.sections[0].title).toBe('A')
    expect(doc.sections[0].key).not.toBe(a.key)
    expect(doc.sections[0].id).toBeUndefined()
  })
  it('splits and merges paragraphs', () => {
    const doc = sample()
    const last = doc.sections[3]
    last.text = 'First part. Second part.'
    const next = splitParagraph(doc, last.key, 'First part.', 'Second part.')!
    expect(shape(doc).slice(-2)).toEqual(['4:First part.', '5:Second part.'])
    expect(mergeWithPrevious(doc, next.key)).toEqual({ into: last, at: 11 })
    expect(last.text).toBe('First part. Second part.')
    expect(mergeWithPrevious(doc, doc.sections[1].key)).toBeUndefined()   // titled: no merge
  })
  it('removes and inlines an include', () => {
    const doc = sample()
    expect(includeCids(doc)).toEqual([CLAUSE])
    expect(replaceInclude(doc, doc.sections[2].key, { title: 'Clause', sections: [newSection({ text: 'x' })] })).toBe(true)
    expect(includeCids(doc)).toEqual([])
    expect(doc.sections[2]).toMatchObject({ id: 'inc', title: 'Clause' })
    expect(remove(doc, doc.sections[0].key)).toBe(true)
    expect(locate(doc, 'nope')).toBeUndefined()
  })
})

describe('ids', () => {
  it('suggests unique ids', () => {
    const doc = sample()
    expect(uniqueId(doc, 'A')).toBe('a-2')
    expect(uniqueId(doc, 'Cure of Default')).toBe('cure-of-default')
  })
  it('renames an id and every reference to it', () => {
    const doc = sample()
    expect(renameId(doc, 'inc', 'clause')).toBe(1)
    expect(doc.text).toBe('See <ref:b> and <ref:clause/cure>.')
    expect(doc.sections[2].id).toBe('clause')
    expect(renameId(doc, 'b', 'bee')).toBe(1)
    expect(doc.text).toBe('See <ref:bee> and <ref:clause/cure>.')
  })
})
