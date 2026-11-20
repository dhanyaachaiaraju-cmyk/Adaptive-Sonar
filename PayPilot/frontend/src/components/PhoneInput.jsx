import { useId } from 'react'
import CountrySelect from './CountrySelect'
import { callingCode } from '../lib/phone'

/**
 * Phone number with a separate, visible calling code (e.g. +91) in front.
 * Controlled: `country` (ISO code for the calling code) and `national` (what the
 * user typed). The parent combines them with toE164() and stores E.164.
 */
export default function PhoneInput({ id, country, national, onCountryChange, onNationalChange, onBlur, error, hint }) {
  const generated = useId()
  const inputId = id ?? generated
  const messageId = `${inputId}-message`
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
      <div className="flex gap-2">
        <CountrySelect
          variant="calling"
          value={country}
          onChange={onCountryChange}
          placeholder="+code"
          ariaLabel="Phone calling code"
        />
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={25}
          value={national}
          onChange={(e) => onNationalChange(e.target.value)}
          onBlur={onBlur}
          placeholder={country ? `Number without ${callingCode(country)}` : 'Select a calling code first'}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-[invalid=true]:border-red-400"
        />
      </div>
      <p id={messageId} className={`mt-1 text-xs ${error ? 'text-red-600' : 'text-slate-500'}`} role={error ? 'alert' : undefined}>
        {error || hint || 'Format check only - this does not verify that the customer owns the number.'}
      </p>
    </div>
  )
}
