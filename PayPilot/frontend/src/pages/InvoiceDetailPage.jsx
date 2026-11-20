import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatMoney } from '../lib/format'
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader } from '../components/ui'
import Spinner from '../components/Spinner'
import InvoicePreview from '../features/invoices/InvoicePreview'
import PaymentActivity from '../features/payments/PaymentActivity'

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, setData, reload } = useApi(
    (signal) =>
      Promise.all([api.get(`/v1/invoices/${invoiceId}`, { signal }), api.get('/v1/settings/business', { signal })]),
    [invoiceId],
  )
  const [dialog, setDialog] = useState(null) // 'issue' | 'cancel' | 'delete'
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState(false)

  if (loading && !data) return <Spinner label="Loading invoice" />
  if (error) return <ErrorBanner error={error} />
  const [invoice, business] = data

  async function run(action) {
    setBusy(true)
    setActionError(null)
    try {
      if (action === 'delete') {
        await api.delete(`/v1/invoices/${invoice.id}`)
        navigate('/invoices')
        return
      }
      const body = action === 'cancel' ? { version: invoice.version, reason: reason || null } : { version: invoice.version }
      const updated = await api.post(`/v1/invoices/${invoice.id}/${action}`, body)
      setData([updated, business])
      setDialog(null)
    } catch (err) {
      setActionError(err)
      if (err.code === 'version_conflict') reload()
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invoice.payment_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setActionError('Could not copy automatically. Select the link and copy it manually.')
    }
  }

  const isDraft = invoice.status === 'draft'
  const canCancel = ['draft', 'pending'].includes(invoice.status)

  return (
    <div>
      <PageHeader
        title={invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : 'Draft invoice'}
        description={
          isDraft
            ? 'Review the preview carefully. Approving issues the invoice and creates the customer payment link.'
            : `Issued ${formatDateTime(invoice.issued_at)}`
        }
        actions={
          <>
            {isDraft && <Link to={`/invoices/${invoice.id}/edit`}><Button variant="secondary">Edit</Button></Link>}
            {isDraft && <Button variant="ghost" onClick={() => setDialog('delete')}>Delete draft</Button>}
            {canCancel && !isDraft && <Button variant="secondary" onClick={() => setDialog('cancel')}>Cancel invoice</Button>}
            {isDraft && <Button onClick={() => setDialog('issue')}>Approve &amp; issue</Button>}
          </>
        }
      />
      <ErrorBanner error={!dialog && actionError} className="mb-4" />

      {invoice.payment_url && invoice.status === 'pending' && (
        <Card className="mb-6 p-4">
          <p className="text-sm font-medium text-slate-900">Customer payment link</p>
          <p className="mt-1 text-xs text-slate-500">
            Share this link with {invoice.customer.name}. PayPilot does not email it automatically — send it yourself.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={invoice.payment_url} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button variant="secondary" onClick={copyLink} className="shrink-0">{copied ? 'Copied ✓' : 'Copy link'}</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InvoicePreview invoice={invoice} business={business} />
        </div>
        <div className="space-y-6">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Total</dt><dd className="font-medium tabular-nums">{formatMoney(invoice.total, invoice.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="tabular-nums">{formatMoney(invoice.amount_paid, invoice.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Balance due</dt><dd className="font-medium tabular-nums">{formatMoney(invoice.balance_due, invoice.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Created via</dt><dd>{invoice.source === 'ai' ? 'AI assistant' : 'Manual'}</dd></div>
              {invoice.paid_at && <div className="flex justify-between"><dt className="text-slate-500">Paid at</dt><dd>{formatDateTime(invoice.paid_at)}</dd></div>}
            </dl>
          </Card>
          {!isDraft && <PaymentActivity invoiceId={invoice.id} />}
        </div>
      </div>

      <Modal
        open={dialog === 'issue'}
        title="Approve and issue this invoice?"
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>Back</Button>
            <Button onClick={() => run('issue')} disabled={busy}>{busy ? 'Issuing…' : `Issue for ${formatMoney(invoice.total, invoice.currency)}`}</Button>
          </>
        }
      >
        <ErrorBanner error={actionError} className="mb-3" />
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>An invoice number is assigned and the amounts are locked.</li>
          <li>A secure payment link is created for <strong>{invoice.customer.name}</strong>.</li>
          <li>Nothing is emailed automatically; you choose how to share the link.</li>
        </ul>
      </Modal>

      <Modal
        open={dialog === 'cancel'}
        title="Cancel this invoice?"
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>Keep invoice</Button>
            <Button variant="danger" onClick={() => run('cancel')} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel invoice'}</Button>
          </>
        }
      >
        <ErrorBanner error={actionError} className="mb-3" />
        <p className="mb-3 text-sm text-slate-600">The payment link stops accepting payments. The invoice stays in your records.</p>
        <Field label="Reason (optional)">{(id) => <Input id={id} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </Modal>

      <Modal
        open={dialog === 'delete'}
        title="Delete this draft?"
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>Keep draft</Button>
            <Button variant="danger" onClick={() => run('delete')} disabled={busy}>Delete</Button>
          </>
        }
      >
        <ErrorBanner error={actionError} className="mb-3" />
        <p className="text-sm text-slate-600">This draft was never issued, so it can be removed permanently.</p>
      </Modal>
    </div>
  )
}
