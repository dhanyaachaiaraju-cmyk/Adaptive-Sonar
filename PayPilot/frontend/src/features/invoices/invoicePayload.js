export const emptyItem = () => ({ description: '', quantity: '1', unit_price: '' })

/** Convert editor state into the API's draft payload (decimals as strings). */
export function toInvoicePayload(value) {
  return {
    customer_id: value.customer_id || null,
    currency: value.currency,
    issue_date: value.issue_date || null,
    due_date: value.due_date || null,
    tax_rate: value.tax_rate === '' || value.tax_rate == null ? '0' : String(value.tax_rate),
    notes: value.notes?.trim() ? value.notes : null,
    items: value.items.map((it) => ({
      description: it.description,
      quantity: String(it.quantity),
      unit_price: String(it.unit_price === '' ? '0' : it.unit_price),
    })),
  }
}

export function fromInvoice(inv) {
  return {
    customer_id: inv.customer.id,
    currency: inv.currency,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    tax_rate: inv.tax_rate,
    notes: inv.notes ?? '',
    items: inv.items.map((it) => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price })),
  }
}
