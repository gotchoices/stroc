import { describe, it, expect } from 'vitest'
import { checkText, canonicalizeText, findEntityLike, isValidId, suggestId, isCanonicalLanguageTag, canonicalLanguageTag } from '../src/index.js'

const codes = (s: string) => checkText(s).map(i => i.code)

describe('checkText', () => {
  it('accepts canonical text', () => {
    expect(codes('The Stock Holder agrees.')).toEqual([])
    expect(codes('Café, naïve, 中文, עברית')).toEqual([])
  })
  it('rejects empty', () => expect(codes('')).toEqual(['empty']))
  it('rejects leading, trailing and double spaces', () => {
    expect(codes(' a')).toEqual(['leading-space'])
    expect(codes('a ')).toEqual(['trailing-space'])
    expect(codes('a  b')).toEqual(['double-space'])
  })
  it('rejects other whitespace', () => {
    expect(codes('a\tb')).toEqual(['whitespace'])
    expect(codes('a\nb')).toEqual(['whitespace'])
    expect(codes('Section 3')).toEqual(['whitespace'])
    expect(codes('a b')).toEqual(['whitespace'])
  })
  it('rejects forbidden invisible characters', () => {
    for (const ch of ['​', '⁠', '﻿', '­']) expect(codes(`a${ch}b`)).toEqual(['invisible'])
  })
  it('rejects control characters', () => {
    expect(codes('a\u0000b')).toEqual(['control'])
    expect(codes('a\u0085b')).toEqual(['control'])
  })
  it('allows joiners and bidi marks', () => {
    expect(codes('a‌b‍c‎d‏e⁦f⁩')).toEqual([])
  })
  it('rejects text not in NFC', () => {
    expect(codes('Café')).toEqual(['not-nfc'])
  })
  it('reports offsets', () => {
    expect(checkText('ab\tc')[0].offset).toBe(2)
  })
})

describe('canonicalizeText', () => {
  it('produces canonical text', () => {
    const fixed = canonicalizeText('  Café and\t\ttea​.\n')
    expect(fixed).toBe('Café and tea.')
    expect(checkText(fixed)).toEqual([])
  })
})

describe('findEntityLike', () => {
  it('finds entity-like sequences', () => {
    expect(findEntityLike('AT&T and &amp; and &#169;')).toEqual([9, 19])
  })
})

describe('ids', () => {
  it('validates ids', () => {
    for (const ok of ['a', 'cure', 'good-faith', 'p2', 'a1-b2-c3']) expect(isValidId(ok)).toBe(true)
    for (const bad of ['', 'Cure', '2a', '-a', 'a-', 'a--b', 'a_b', 'a b', 'a/b', 'x'.repeat(65)]) expect(isValidId(bad)).toBe(false)
  })
  it('suggests ids from titles', () => {
    expect(suggestId('Cure of Default')).toBe('cure-of-default')
    expect(suggestId('Résumé: 2nd draft!')).toBe('resume-2nd-draft')
    expect(suggestId('123')).toBe('section')
    expect(isValidId(suggestId('9. Notice (Default)'))).toBe(true)
  })
})

describe('language tags', () => {
  it('accepts canonical BCP 47 tags', () => {
    for (const ok of ['en', 'en-US', 'sr-Latn', 'zh-Hant-TW', 'es-419', 'de-CH-1996', 'en-x-legal']) {
      expect(isCanonicalLanguageTag(ok)).toBe(true)
    }
  })
  it('rejects wrong case and malformed tags', () => {
    for (const bad of ['EN', 'en-us', 'sr-latn', 'english', 'e', 'en_US', '']) expect(isCanonicalLanguageTag(bad)).toBe(false)
  })
  it('suggests canonical case', () => {
    expect(canonicalLanguageTag('EN-us')).toBe('en-US')
    expect(canonicalLanguageTag('sr_latn')).toBe('sr-Latn')
    expect(canonicalLanguageTag('english!')).toBeUndefined()
  })
})
