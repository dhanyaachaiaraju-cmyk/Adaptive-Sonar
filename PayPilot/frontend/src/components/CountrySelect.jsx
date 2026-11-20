import { useEffect, useId, useMemo, useRef, useState } from 'react'
import 'flag-icons/css/flag-icons.min.css'
import { countryList, findCountry, searchCountries } from '../lib/countries'

export function Flag({ code, className = '' }) {
  // SVG flags (Windows does not render flag emoji). Decorative: the name is always shown as text.
  return code ? <span aria-hidden="true" className={`fi fi-${code.toLowerCase()} shrink-0 rounded-[2px] ${className}`} /> : null
}

/**
 * Searchable country picker (ARIA combobox). Search by name, ISO code or
 * calling code ("india", "IN", "+91" and "91" all find India).
 *
 * variant="country" shows the country name; variant="calling" is the compact
 * calling-code picker used in front of the phone number field.
 */
export default function CountrySelect({ id, value, onChange, variant = 'country', placeholder = 'Select a country', invalid, describedBy, ariaLabel }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-list`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = findCountry(value)
  const results = useMemo(() => searchCountries(query, countryList()), [query])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => !rootRef.current?.contains(e.target) && close()
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function choose(country) {
    onChange(country.code)
    close()
    inputRef.current?.focus()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault()
        choose(results[active])
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    } else if (e.key === 'Tab') {
      close()
    }
  }

  const display = selected
    ? variant === 'calling'
      ? `+${selected.callingCode}`
      : `${selected.name} (+${selected.callingCode})`
    : ''

  return (
    <div ref={rootRef} className={`relative ${variant === 'calling' ? 'w-28 shrink-0' : ''}`}>
      <div className="relative">
        {!open && selected && <Flag code={selected.code} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${results[active].code}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          placeholder={open ? (variant === 'calling' ? '+91 or India' : 'Search name or +code') : placeholder}
          value={open ? query : display}
          onFocus={() => setActive(0)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className={`w-full rounded-md border border-slate-300 bg-white py-2 pr-8 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-[invalid=true]:border-red-400 ${!open && selected ? 'pl-10' : 'pl-3'}`}
        />
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">▾</span>
      </div>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={variant === 'calling' ? 'Calling codes' : 'Countries'}
          className="absolute z-30 mt-1 max-h-64 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">No country matches “{query}”</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.code}
                id={`${listId}-${c.code}`}
                role="option"
                data-index={i}
                aria-selected={c.code === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === active ? 'bg-brand-50' : ''} ${c.code === value ? 'font-medium' : ''}`}
              >
                <Flag code={c.code} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs text-slate-500 tabular-nums">+{c.callingCode}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
