import { describe, expect, it } from 'vitest'
import { callingCode, formatPhone, splitE164, toE164 } from './phone'

describe('toE164', () => {
  it('combines the calling code and national number into E.164', () => {
    expect(toE164('IN', '98765 43210')).toEqual({ e164: '+919876543210', error: null })
    expect(toE164('GB', '020 7946 0958')).toEqual({ e164: '+442079460958', error: null })
    expect(toE164('US', '(201) 555-0123')).toEqual({ e164: '+12015550123', error: null })
  })

  it('accepts a pasted international number regardless of the selected code', () => {
    expect(toE164('IN', '+44 20 7946 0958').e164).toBe('+442079460958')
  })

  it('treats an empty number as "no phone"', () => {
    expect(toE164('IN', '  ')).toEqual({ e164: null, error: null })
  })

  it('explains what is wrong', () => {
    expect(toE164('IN', '98765').error).toMatch(/too short/)
    expect(toE164('IN', '98765 43210 999').error).toMatch(/too long|wrong number|not valid/)
    expect(toE164('IN', '98765 43210 99999 9').error).toMatch(/too long/)
    expect(toE164('US', '201 055 0123').error).toMatch(/not valid/) // exchanges cannot start with 0
    expect(toE164('IN', 'call me').error).toMatch(/digits only/)
    expect(toE164(null, '9876543210').error).toMatch(/calling code/)
  })
})

describe('helpers', () => {
  it('splits a stored number back into calling code and national number', () => {
    expect(splitE164('+919876543210')).toEqual({ country: 'IN', national: '9876543210' })
    expect(toE164('IN', splitE164('+919876543210').national).e164).toBe('+919876543210') // round-trips
    expect(splitE164(null, 'GB')).toEqual({ country: 'GB', national: '' })
  })

  it('formats calling codes and numbers for display', () => {
    expect(callingCode('IN')).toBe('+91')
    expect(callingCode('ZZ')).toBe('')
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210')
  })
})
