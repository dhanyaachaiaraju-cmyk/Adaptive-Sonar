import { lazy, Suspense } from 'react'
import Spinner from '../../components/Spinner'

// The form pulls in libphonenumber's full metadata and the flag icons; load them
// only when a customer form is actually opened, not with every page.
const CustomerForm = lazy(() => import('./CustomerForm'))

export default function LazyCustomerForm(props) {
  return (
    <Suspense fallback={<Spinner label="Loading form" />}>
      <CustomerForm {...props} />
    </Suspense>
  )
}
