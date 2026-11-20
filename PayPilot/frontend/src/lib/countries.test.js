import { describe, expect, it } from 'vitest'
import backendPostal from '../../../backend/app/data/postal_codes.json'
import postal from '../data/postal-codes.json'
import { countryList, filterPostalInput, findCountry, postalCodeError, postalHint, searchCountries } from './countries'

describe('country search', () => {
  it('finds the same country by name, ISO code or calling code', () => {
    for (const q of ['India', 'india', 'IND', 'in', '+91', '91']) {
      expect(searchCountries(q)[0]?.code, q).toBe('IN')
    }
  })

  it('ignores accents and matches words inside names', () => {
    expect(searchCountries('reunion').map((c) => c.code)).toContain('RE')
    expect(searchCountries('kingdom').map((c) => c.code)).toContain('GB')
  })

  it('lists every country sharing a calling code (+1)', () => {
    const codes = searchCountries('+1').filter((c) => c.callingCode === '1').map((c) => c.code)
    expect(codes).toEqual(expect.arrayContaining(['US', 'CA', 'JM']))
  })

  it('has a name and calling code for every country', () => {
    const list = countryList()
    expect(list.length).toBeGreaterThan(200)
    for (const c of list) expect(c.name && /^\d+$/.test(c.callingCode)).toBeTruthy()
    expect(findCountry('IN')).toMatchObject({ name: 'India', callingCode: '91' })
  })
})

describe('postal codes', () => {
  it('uses an exact copy of the backend formats', () => {
    expect(postal).toEqual(backendPostal)
  })

  it('accepts only digits for numeric-only countries', () => {
    expect(filterPostalInput('IN', '56a0-0b34')).toBe('560-034')
    expect(postalCodeError('IN', '560034')).toBeNull()
    expect(postalCodeError('IN', '56003A')).toMatch(/digits/)
    expect(postalCodeError('IN', '012345')).toMatch(/Not a valid postal code/) // PINs never start with 0
  })

  it('does not reject valid alphanumeric codes', () => {
    expect(filterPostalInput('GB', 'sw1a 1aa')).toBe('sw1a 1aa') // not stripped
    expect(postalCodeError('GB', 'sw1a 1aa')).toBeNull()
    expect(postalCodeError('CA', 'K1A 0B1')).toBeNull()
    expect(postalCodeError('NL', '1012 AB')).toBeNull()
    expect(postalCodeError('IE', 'D02 X285')).toBeNull()
    expect(postalCodeError('GB', '12345')).toMatch(/letters and digits/)
  })

  it('falls back to a generic check and explains each format', () => {
    expect(postalCodeError('XK', '10000')).toBeNull()
    expect(postalCodeError('XK', '10000!')).toMatch(/only contain/)
    expect(postalCodeError('US', '')).toBeNull() // optional
    expect(postalHint('IN')).toMatch(/digits only/)
    expect(postalHint('AE')).toMatch(/does not use postal codes/)
  })

  it('every example matches its own pattern', () => {
    for (const [code, fmt] of Object.entries(postal)) {
      if (fmt && fmt.pattern) expect(postalCodeError(code, fmt.example), code).toBeNull()
    }
  })
})
