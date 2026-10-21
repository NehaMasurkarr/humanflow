import { formatNumber, unitLabel } from '../lib/api'
import type { HeatmapPage, HeatmapValue } from './types'
export function GeographicDetail({
  row,
  page,
}: {
  row: HeatmapValue | undefined
  page: HeatmapPage
}) {
  return (
    <>
      <strong>
        {row?.value == null ? 'Unavailable' : formatNumber(row.value)}{' '}
        <small>{unitLabel(page.measure.unit)}</small>
      </strong>
      <p>
        {page.direction === 'incoming'
          ? 'Reported incoming'
          : 'Reported outgoing'}{' '}
        · {page.measure.label}
      </p>
      <p>{page.period.label}</p>
      <p>
        {row
          ? `${row.included} included / ${row.observed} observed · ${row.missing} missing · ${row.suppressed} suppressed`
          : 'No matching integrated statistical geography'}
      </p>
      {row && (
        <p>
          Status: {row.status.replaceAll('_', ' ')}
          {row.below_threshold > 0
            ? ` · ${row.below_threshold} below the corridor threshold`
            : ''}
        </p>
      )}
      <p>{page.dataset.provider}</p>
      <p>{page.dataset.caveat}</p>
      <p>Geographic reported sum, not population density.</p>
    </>
  )
}
export default function HeatmapSummary({
  page,
  selected,
  onSelect,
}: {
  page: HeatmapPage
  selected?: HeatmapValue
  onSelect: (id: string) => void
}) {
  return (
    <div className="heatmap-summary">
      {!page.items.some((row) => row.included > 0) && (
        <p role="status">
          No reported values match these filters. Unavailable and
          threshold-excluded values remain distinct from zero.
        </p>
      )}
      {selected && (
        <section aria-label="Geographic migration detail">
          <h3>{selected.name}</h3>
          <GeographicDetail row={selected} page={page} />
        </section>
      )}
      <p>
        {page.period.label} · {page.dataset.provider}
      </p>
      <p>
        All matching geographic aggregates; independent of the paginated arcs.
      </p>
      <details>
        <summary>View geographic values ({page.items.length})</summary>
        <div className="heatmap-values">
          <table>
            <caption>
              {page.direction} · {unitLabel(page.measure.unit)}
            </caption>
            <thead>
              <tr>
                <th>Geography</th>
                <th>Reported value / coverage</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => (
                <tr key={row.id}>
                  <th>
                    <button onClick={() => onSelect(row.id)}>{row.name}</button>
                  </th>
                  <td>
                    {row.value === null
                      ? 'Unavailable'
                      : formatNumber(row.value)}
                    <small>
                      {row.status.replaceAll('_', ' ')} · {row.included}{' '}
                      included; {row.missing} missing; {row.suppressed}{' '}
                      suppressed{!row.has_boundary ? ' · no outline' : ''}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <a href={page.dataset.source_url} target="_blank" rel="noreferrer">
        Migration source ↗
      </a>
      <a href={page.boundary_source_url} target="_blank" rel="noreferrer">
        Boundary source · {page.boundary_license} ↗
      </a>
      <p>{page.note}</p>
    </div>
  )
}
