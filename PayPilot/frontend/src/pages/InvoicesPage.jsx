import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { formatDate, formatMoney } from '../lib/format'
import { Button, Card, EmptyState, ErrorBanner, Input, PageHeader, StatusBadge } from '../components/ui'
import Spinner from '../components/Spinner'

const TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'pending', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function InvoicesPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const customerId = params.get('customer_id') ?? ''
  const [q, setQ] = useState('')

  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (customerId) query.set('customer_id', customerId)
  if (q) query.set('q', q)

  const { data, error, loading } = useApi((signal) => api.get(`/v1/invoices?${query}`, { signal }), [status, customerId, q])

  const setStatus = (key) => {
    const next = new URLSearchParams(params)
    if (key) next.set('status', key)
    else next.delete('status')
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Drafts need your approval before they are issued with a payment link."
        actions={
          <>
            <Link to="/assistant"><Button variant="secondary">Create with AI</Button></Link>
            <Link to="/invoices/new"><Button>New invoice</Button></Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${status === t.key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <Input placeholder="Search number or customer" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>
      {customerId && (
        <p className="mb-3 text-sm text-slate-600">
          Filtered by customer.{' '}
          <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => { const n = new URLSearchParams(params); n.delete('customer_id'); setParams(n) }}>
            Clear
          </button>
        </p>
      )}

      <ErrorBanner error={error} className="mb-4" />

      <Card>
        {loading && !data ? (
          <div className="p-6"><Spinner label="Loading invoices" /></div>
        ) : data?.items.length === 0 ? (
          <EmptyState
            title="No invoices here"
            description="Create an invoice manually or describe it to the AI assistant in plain language."
            action={<Link to="/invoices/new"><Button>New invoice</Button></Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                        {inv.invoice_number ?? 'Draft'}
                      </Link>
                      {inv.source === 'ai' && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">AI</span>}
                    </td>
                    <td className="px-4 py-3">{inv.customer.name}</td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {formatDate(inv.due_date)}
                      {inv.days_overdue > 0 && <span className="ml-1 text-xs text-red-600">({inv.days_overdue}d late)</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={inv.display_status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(inv.total, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data && data.total > data.items.length && (
        <p className="mt-3 text-xs text-slate-500">Showing {data.items.length} of {data.total}. Refine the filters to narrow results.</p>
      )}
    </div>
  )
}
