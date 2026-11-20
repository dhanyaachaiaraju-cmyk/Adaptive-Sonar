import { useState } from 'react'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { useDateRangeParam } from '../hooks/useDateRangeParam'
import { useDebounced } from '../hooks/useDebounced'
import { formatDate } from '../lib/format'
import { PAYMENT_STATUS, PAYMENT_STATUS_KEYS } from '../lib/paymentStatus'
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, PageHeader, Select } from '../components/ui'
import DateRangeFilter from '../components/DateRangeFilter'
import Spinner from '../components/Spinner'
import TransactionsTable from '../features/payments/TransactionsTable'
import TransactionDetail from '../features/payments/TransactionDetail'

const PAGE_SIZE = 50

export default function PaymentsPage() {
  const [range, setRange, params, setParams] = useDateRangeParam('30d')
  const status = PAYMENT_STATUS_KEYS.includes(params.get('status')) ? params.get('status') : ''
  const currency = /^[A-Z]{3}$/.test(params.get('currency') || '') ? params.get('currency') : ''
  const includeStarted = params.get('include_started') === 'true'
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)

  const query = new URLSearchParams({ date_from: range.from, date_to: range.to, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
  if (status) query.set('status', status)
  if (currency) query.set('currency', currency)
  if (q) query.set('q', q.slice(0, 100))
  if (includeStarted) query.set('include_started', 'true')
  const qs = query.toString()

  const { data, error, loading } = useApi(
    (signal) => Promise.all([api.get(`/v1/tracker/transactions?${qs}`, { signal }), api.get('/v1/settings/currencies', { signal })]),
    [qs],
  )
  const [tx, currencies] = data ?? []

  const setFilter = (key, value) => {
    setPage(0)
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (value) p.set(key, value)
      else p.delete(key)
      return p
    }, { replace: true })
  }

  const pages = tx ? Math.max(1, Math.ceil(tx.total / PAGE_SIZE)) : 1

  return (
    <div>
      <PageHeader
        title="Payments"
        description={
          tx ? `${formatDate(tx.period.date_from)} – ${formatDate(tx.period.date_to)} · ${tx.total} transaction${tx.total === 1 ? '' : 's'}` : 'Every PayPal payment attempt and its verified status.'
        }
      />

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <DateRangeFilter
          key={`${range.preset}-${range.from}-${range.to}`}
          value={range}
          onChange={(r) => {
            setPage(0)
            setRange(r)
          }}
        />
        <Select aria-label="Payment status" value={status} onChange={(e) => setFilter('status', e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          {PAYMENT_STATUS_KEYS.map((k) => (
            <option key={k} value={k}>{PAYMENT_STATUS[k].label}</option>
          ))}
        </Select>
        <Select aria-label="Currency" value={currency} onChange={(e) => setFilter('currency', e.target.value)} className="w-auto">
          <option value="">All currencies</option>
          {(currencies ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input
          aria-label="Search"
          placeholder="Invoice, customer or payer email"
          maxLength={100}
          value={search}
          onChange={(e) => {
            setPage(0)
            setSearch(e.target.value)
          }}
          className="max-w-xs"
        />
        {!status && (
          <label className="flex items-center gap-2 self-center text-sm text-slate-600">
            <input type="checkbox" checked={includeStarted} onChange={(e) => setFilter('include_started', e.target.checked ? 'true' : '')} />
            Include abandoned checkouts
          </label>
        )}
      </div>

      <ErrorBanner error={error} className="mb-4" />

      <Card>
        {loading && !data ? (
          <div className="p-6"><Spinner label="Loading payments" /></div>
        ) : tx?.items.length === 0 ? (
          <EmptyState title="No payments match these filters" description="Try a wider date range or clear the filters." />
        ) : (
          tx && <TransactionsTable items={tx.items} onSelect={(t) => setSelected(t.id)} />
        )}
      </Card>

      {tx && tx.total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-slate-600">Page {page + 1} of {pages}</span>
          <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Only <strong>Completed</strong> payments are money received; they are confirmed by PayPal's capture response or a verified PayPal webhook.
        Dates use your business timezone.
      </p>

      <Modal open={selected !== null} title="Transaction details" onClose={() => setSelected(null)} size="lg">
        {selected && <TransactionDetail paymentId={selected} />}
      </Modal>
    </div>
  )
}
