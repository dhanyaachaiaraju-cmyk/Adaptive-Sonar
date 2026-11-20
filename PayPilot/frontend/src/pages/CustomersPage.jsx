import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, PageHeader } from '../components/ui'
import Spinner from '../components/Spinner'
import CustomerForm from '../features/customers/LazyCustomerForm'
import { notifyCustomersChanged } from '../lib/customerList'

export default function CustomersPage() {
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | customer
  const [actionError, setActionError] = useState(null)

  const { data, error, loading, reload } = useApi(
    (signal) =>
      api.get(`/v1/customers?${new URLSearchParams({ q, include_archived: String(showArchived) })}`, { signal }),
    [q, showArchived],
  )

  async function toggleArchive(customer) {
    setActionError(null)
    try {
      const updated = await api.post(`/v1/customers/${customer.id}/${customer.archived_at ? 'restore' : 'archive'}`)
      notifyCustomersChanged(updated)
      reload()
    } catch (err) {
      setActionError(err)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="The people and businesses you invoice."
        actions={<Button onClick={() => setEditing('new')}>Add customer</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search name, email or company" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <ErrorBanner error={error || actionError} className="mb-4" />

      <Card>
        {loading && !data ? (
          <div className="p-6"><Spinner label="Loading customers" /></div>
        ) : data?.items.length === 0 ? (
          <EmptyState
            title={q ? 'No customers match your search' : 'No customers yet'}
            description="Add a customer to start invoicing — or ask the AI assistant to create an invoice and it will offer to add them."
            action={!q && <Button onClick={() => setEditing('new')}>Add your first customer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Company</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((c) => (
                  <tr key={c.id} className={c.archived_at ? 'text-slate-400' : ''}>
                    <td className="px-4 py-3 font-medium">
                      {c.name}
                      {c.archived_at && <span className="ml-2 text-xs">(archived)</span>}
                    </td>
                    <td className="px-4 py-3">{c.email || <span className="text-slate-400">—</span>}</td>
                    <td className="hidden px-4 py-3 md:table-cell">{c.company_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link to={`/invoices?customer_id=${c.id}`} className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">
                          Invoices
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleArchive(c)}>
                          {c.archived_at ? 'Restore' : 'Archive'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={editing !== null} title={editing === 'new' ? 'Add customer' : 'Edit customer'} onClose={() => setEditing(null)} size="lg">
        {editing !== null && (
          <CustomerForm
            customer={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
          />
        )}
      </Modal>
    </div>
  )
}
