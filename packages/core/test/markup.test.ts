import { describe, it, expect } from 'vitest'
import { parseMarkup, findReferences, markupToPlainText, escapeMarkupText } from '../src/index.js'

const codes = (s: string) => parseMarkup(s).issues.map(i => i.code)

describe('parseMarkup: valid text', () => {
  it('parses plain text', () => {
    expect(parseMarkup('Hello.')).toEqual({ nodes: [{ type: 'text', value: 'Hello.' }], issues: [] })
  })
  it('parses emphasis and references', () => {
    const { nodes, issues } = parseMarkup('The <b>Stock Holder</b> must <i>not</i> see <ref:ethics/good-faith>.')
    expect(issues).toEqual([])
    expect(nodes.map(n => n.type)).toEqual(['text', 'emphasis', 'text', 'emphasis', 'text', 'ref', 'text'])
    expect(findReferences(nodes)).toEqual([{ path: ['ethics', 'good-faith'], offset: 44 }])
    expect(markupToPlainText(nodes)).toBe('The Stock Holder must not see ethics/good-faith.')
  })
  it('accepts canonical nesting', () => {
    expect(codes('<b><i><u>x</u></i></b>')).toEqual([])
    expect(codes('<b>a <i>b</i> c</b>')).toEqual([])
    expect(codes('<b>see <ref:cure></b>')).toEqual([])
    expect(codes('<b>a</b> <b>b</b>')).toEqual([])
  })
  it('resolves escapes', () => {
    const { nodes, issues } = parseMarkup('if a \\< b and c\\\\d')
    expect(issues).toEqual([])
    expect(markupToPlainText(nodes)).toBe('if a < b and c\\d')
  })
  it('treats > and & as literal', () => {
    expect(codes('a > b & c')).toEqual([])
  })
})

describe('parseMarkup: errors', () => {
  it('rejects a bare <', () => expect(codes('if a < b')).toEqual(['bad-tag']))
  it('rejects tag look-alikes', () => {
    expect(codes('<B>x</B>')).toEqual(['bad-tag', 'bad-tag'])
    expect(codes('<b class="x">y</b>')).toEqual(['bad-tag', 'unbalanced'])
    expect(codes('<script>x</script>')).toEqual(['bad-tag', 'bad-tag'])
    expect(codes('<br>')).toEqual(['bad-tag'])
  })
  it('rejects bad escapes', () => {
    expect(codes('a\\nb')).toEqual(['bad-escape'])
    expect(codes('trailing\\')).toEqual(['bad-escape'])
  })
  it('rejects bad references', () => {
    expect(codes('<ref:>')).toEqual(['bad-ref'])
    expect(codes('<ref:Cure>')).toEqual(['bad-ref'])
    expect(codes('<ref:a//b>')).toEqual(['bad-ref'])
    expect(codes('<ref:cure')).toEqual(['bad-ref'])
    expect(codes('<ref:a b>')).toEqual(['bad-ref'])
  })
  it('rejects unbalanced and unclosed tags', () => {
    expect(codes('<b>x')).toEqual(['unclosed'])
    expect(codes('x</b>')).toEqual(['unbalanced'])
    expect(codes('<b><i>x</b></i>')).toContain('unbalanced')
  })
  it('enforces one spelling', () => {
    expect(codes('<b></b>')).toEqual(['empty-emphasis'])
    expect(codes('<b>a <b>b</b></b>')).toEqual(['nested-same'])
    expect(codes('<i><b>x</b></i>')).toEqual(['emphasis-order'])
    expect(codes('<u><i>x</i></u>')).toEqual(['emphasis-order'])
    expect(codes('<b>a</b><b>b</b>')).toEqual(['adjacent-emphasis'])
    expect(codes('<b> a</b>')).toEqual(['emphasis-edge-space'])
    expect(codes('<b>a </b>b')).toEqual(['emphasis-edge-space'])
  })
  it('reports offsets', () => {
    expect(parseMarkup('ok <x> ok').issues[0].offset).toBe(3)
  })
})

describe('escapeMarkupText', () => {
  it('round-trips literal text', () => {
    const literal = 'if a < b then c\\d'
    expect(markupToPlainText(parseMarkup(escapeMarkupText(literal)).nodes)).toBe(literal)
  })
})
