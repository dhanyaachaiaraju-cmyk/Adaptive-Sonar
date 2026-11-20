// Human labels for payment states. Wording is deliberately precise: only
// "completed" means money was received and verified with PayPal.
export const PAYMENT_STATUS = {
  completed: { label: 'Completed', badge: 'paid', help: 'Captured and verified with PayPal' },
  pending: { label: 'Pending at PayPal', badge: 'pending', help: 'PayPal is holding the payment - not confirmed' },
  created: { label: 'Checkout started', badge: 'draft', help: 'Customer opened PayPal checkout - not paid' },
  declined: { label: 'Declined', badge: 'overdue', help: 'The payment was declined' },
  failed: { label: 'Failed', badge: 'overdue', help: 'The payment failed or could not be verified' },
  refunded: { label: 'Refunded', badge: 'refunded', help: 'Fully refunded or reversed in PayPal' },
  voided: { label: 'Voided', badge: 'cancelled', help: 'The payment was voided' },
}

export const PAYMENT_STATUS_KEYS = Object.keys(PAYMENT_STATUS)

export function paymentStatusInfo(status) {
  return PAYMENT_STATUS[status] ?? { label: status, badge: 'draft', help: '' }
}
