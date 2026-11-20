import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { useCustomers } from '../hooks/useCustomers'
import { Button, ErrorBanner, Textarea } from '../components/ui'
import Spinner from '../components/Spinner'
import ProposalCard from '../features/assistant/ProposalCard'

const SUGGESTIONS = [
  'Create an invoice for Bright Bakery (orders@brightbakery.com) for a logo redesign, $450, due in 14 days',
  'Which invoices are overdue?',
  'Show my most recent invoices',
  'What is the status of INV-0001?',
  'How do this month’s collections compare with last month?',
  'Which customers pay late, and what is my on-time payment rate this year?',
]

export default function AssistantPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const shared = useApi(
    (signal) =>
      Promise.all([
        api.get('/v1/assistant/status', { signal }),
        api.get('/v1/assistant/conversations', { signal }),
        api.get('/v1/settings/business', { signal }),
        api.get('/v1/settings/currencies', { signal }),
      ]),
    [conversationId],
  )
  const { customers } = useCustomers()

  if (shared.error) return <ErrorBanner error={shared.error} />
  if (!shared.data) return <Spinner label="Loading assistant" />
  const [status, conversations, business, currencies] = shared.data

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <Button className="w-full" onClick={() => navigate('/assistant')}>New conversation</Button>
        <nav className="space-y-1" aria-label="Conversations">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/assistant/${c.id}`)}
              className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm ${c.id === conversationId ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {c.title || 'Untitled'}
            </button>
          ))}
        </nav>
      </aside>
      <section>
        {!status.configured && (
          <ErrorBanner className="mb-4" error="The AI assistant is not configured on the server yet (GEMINI_API_KEY is missing in backend/.env)." />
        )}
        <Chat
          key={conversationId ?? 'new'}
          conversationId={conversationId}
          onCreated={(id) => navigate(`/assistant/${id}`, { replace: true })}
          business={business}
          currencies={currencies}
          customers={customers}
          disabled={!status.configured}
        />
      </section>
    </div>
  )
}

function Chat({ conversationId, onCreated, business, currencies, customers, disabled }) {
  const [messages, setMessages] = useState([])
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(Boolean(conversationId))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const pendingFirstMessage = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!conversationId) return undefined
    const controller = new AbortController()
    api
      .get(`/v1/assistant/conversations/${conversationId}`, { signal: controller.signal })
      .then((data) => {
        setMessages(data.messages)
        setProposals(data.proposals)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err)
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending])

  async function send(text) {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setError(null)
    setDraft('')
    const optimistic = { id: `local-${Date.now()}`, role: 'user', content }
    setMessages((m) => [...m, optimistic])
    try {
      let id = conversationId
      if (!id) {
        const conv = await api.post('/v1/assistant/conversations', {})
        id = conv.id
        pendingFirstMessage.current = id
      }
      const res = await api.post(`/v1/assistant/conversations/${id}/messages`, { content })
      setMessages((m) => [...m, res.message])
      setProposals((p) => [...p, ...res.proposals])
      if (pendingFirstMessage.current === id && !conversationId) onCreated(id)
    } catch (err) {
      setError(err)
      setMessages((m) => m.filter((x) => x.id !== optimistic.id))
      setDraft(content)
    } finally {
      setSending(false)
    }
  }

  const proposalsByMessage = (messageId) => proposals.filter((p) => p.message_id === messageId)

  if (loading) return <Spinner label="Loading conversation" />

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6">
            <p className="text-sm font-medium text-slate-900">Ask about your invoices or describe an invoice to create.</p>
            <p className="mt-1 text-xs text-slate-500">
              The assistant answers from your real records and only prepares invoices for your approval — it never creates, sends or charges anything on its own.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" disabled={disabled} onClick={() => send(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-700 hover:border-brand-300 disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white' : 'w-full'}>
              {m.role === 'user' ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : (
                <>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                  {m.unverified_figures?.length > 0 && (
                    <p role="note" className="mt-1 max-w-[85%] rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                      ⚠ These figures could not be matched to your records and may be wrong: {m.unverified_figures.join(', ')}.
                      Check the dashboard for verified numbers.
                    </p>
                  )}
                  {proposalsByMessage(m.id).map((p) => (
                    <ProposalCard key={p.id} proposal={p} business={business} currencies={currencies} customers={customers} />
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
        {sending && <Spinner label="Thinking" />}
        <div ref={bottomRef} />
      </div>

      <ErrorBanner error={error} className="my-3" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="sticky bottom-0 mt-4 flex gap-2 border-t border-slate-200 bg-slate-50 py-3"
      >
        <Textarea
          rows={2}
          maxLength={4000}
          value={draft}
          disabled={disabled}
          placeholder="e.g. Invoice Acme Ltd $1,200 for website design, due next Friday"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
        />
        <Button type="submit" disabled={disabled || sending || !draft.trim()} className="self-end">Send</Button>
      </form>
    </div>
  )
}
