import type { ComparisonSystem } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { num, percent } from '../../lib/format'

function pd(s: ComparisonSystem['stats']) {
  if (s.detection_rate == null) return '—'
  const ci = s.detection_ci95 ? ` (${percent(s.detection_ci95[0])}–${percent(s.detection_ci95[1])})` : ''
  return `${percent(s.detection_rate)}${ci}`
}

/** Live, sliding-window comparison. Every column is simulated; costs sit beside benefits. */
export function ComparisonTable({ systems, compact }: { systems: ComparisonSystem[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-xs', compact ? 'min-w-[480px]' : 'min-w-[760px]')}>
        <thead>
          <tr className="text-left text-2xs text-fg-subtle uppercase">
            <th className="pb-2 font-medium">System</th>
            <th className="pb-2 text-right font-medium">Pings</th>
            <th className="pb-2 text-right font-medium" title="Unambiguous detections per transmitted ping, Wilson 95 % interval">
              P(detect) · 95 % CI
            </th>
            {!compact && <th className="pb-2 text-right font-medium">Ambiguous</th>}
            <th className="pb-2 text-right font-medium">Mean |range err|</th>
            <th className="pb-2 text-right font-medium">Ping rate</th>
            {!compact && <th className="pb-2 text-right font-medium" title="Mean on-axis pulse energy, dB re 1 µPa²·s @ 1 m">Energy</th>}
            {!compact && <th className="pb-2 text-right font-medium">Resolution</th>}
          </tr>
        </thead>
        <tbody className="readout">
          {systems.map((s) => (
            <tr key={s.id} className="border-t border-line/60 align-top">
              <td className="py-1.5 pr-3 font-sans">
                <span className={cn('inline-flex items-center gap-1.5', s.kind === 'adaptive' ? 'text-fg' : 'text-fg-muted')}>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: s.kind === 'adaptive' ? 'var(--as-chart-1)' : 'var(--as-chart-2)' }}
                    aria-hidden
                  />
                  {s.label}
                </span>
              </td>
              <td className="py-1.5 text-right text-fg-muted">{s.stats.pings}</td>
              <td className="py-1.5 text-right text-fg">{pd(s.stats)}</td>
              {!compact && <td className="py-1.5 text-right text-fg-muted">{percent(s.stats.ambiguous_rate)}</td>}
              <td className="py-1.5 text-right text-fg">
                {s.stats.mean_abs_range_error_m == null ? '—' : `${num(s.stats.mean_abs_range_error_m, 2)} m`}
              </td>
              <td className="py-1.5 text-right text-fg-muted">{s.stats.ping_rate_hz == null ? '—' : `${num(s.stats.ping_rate_hz, 2)} Hz`}</td>
              {!compact && <td className="py-1.5 text-right text-fg-muted">{num(s.stats.mean_energy_db, 1)} dB</td>}
              {!compact && <td className="py-1.5 text-right text-fg-muted">{num(s.stats.mean_resolution_m, 3)} m</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
