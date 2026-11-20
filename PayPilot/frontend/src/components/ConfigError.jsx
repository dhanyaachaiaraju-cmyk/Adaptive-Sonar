export default function ConfigError({ missing }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-xl border border-amber-300 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">PayPilot is not configured yet</h1>
        <p className="mt-2 text-sm text-amber-800">
          Copy <code className="font-mono">frontend/.env.example</code> to{' '}
          <code className="font-mono">frontend/.env.local</code> and set these values, then restart the dev server:
        </p>
        <ul className="mt-3 list-disc pl-5 font-mono text-sm text-amber-900">
          {missing.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
