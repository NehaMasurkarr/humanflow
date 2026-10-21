import { useEffect, useRef, useState } from 'react'
import { useResource, formatNumber, unitLabel } from '../lib/api'
import type { Corridor, Dataset, Geography } from '../lib/types'
import Chart from './Chart'
import ResultsTable from './ResultsTable'
import type { AnalysisKind, AnalyticsPage, Indicator, Tab } from './types'

interface Props {
  dataset: Dataset
  year: number
  measure: string
  origin: string
  destination: string
  minimum: number
  selected?: Corridor
  entities: Geography[]
  onClose: () => void
  onYearChange: (year: number) => void
}
const TABS: { id: Tab; label: string }[] = [
  { id: 'trends', label: 'Trends' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'comparisons', label: 'Comparisons' },
  { id: 'economics', label: 'Economics' },
]

export default function AnalyticsDrawer({
  dataset,
  year,
  measure,
  origin,
  destination,
  minimum,
  selected,
  entities,
  onClose,
  onYearChange,
}: Props) {
  const [tab, setTab] = useState<Tab>('trends')
  const [ranking, setRanking] = useState('corridors')
  const [comparison, setComparison] = useState<'comparisons' | 'net'>(
    'comparisons',
  )
  const [side, setSide] = useState<'origin' | 'destination'>('destination')
  const [indicatorId, setIndicatorId] = useState('NY.GDP.PCAP.CD')
  const [manualIds, setManualIds] = useState<string[] | null>(null)
  const [followRoute, setFollowRoute] = useState(true)
  const [pagination, setPagination] = useState({ key: '', offset: 0 })
  const [revision, setRevision] = useState(0)
  const [exportState, setExportState] = useState<{
    key: string
    loading: boolean
    error: string | null
  } | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeButton.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])
  const indicators = useResource<Indicator[]>(
    tab === 'economics' ? '/api/v1/analytics/indicators' : null,
    revision,
  )
  const indicator = indicators.data?.find((item) => item.code === indicatorId)
  const kind: AnalysisKind =
    tab === 'rankings'
      ? ranking === 'corridors'
        ? 'corridors'
        : ranking === 'distribution'
          ? 'distribution'
          : 'rankings'
      : tab === 'comparisons'
        ? comparison
        : tab
  const isComparison =
    kind === 'comparisons' || kind === 'economics' || kind === 'net'
  const ids =
    manualIds ?? (selected ? [selected.origin.id, selected.destination.id] : [])
  const routeScope = !!selected && followRoute && !isComparison
  const scopeOrigin = routeScope ? selected.origin.id : origin
  const scopeDestination = routeScope ? selected.destination.id : destination
  const params = new URLSearchParams({
    mode: dataset.mode,
    dataset_id: dataset.id,
    year: String(year),
    measure,
    min_value: String(minimum),
    side:
      tab === 'rankings' &&
      ranking !== 'distribution' &&
      ranking !== 'corridors'
        ? ranking
        : side,
    indicator: indicatorId,
    limit: kind === 'economics' ? '250' : '10',
  })
  if (scopeOrigin) params.set('origin_id', scopeOrigin)
  if (scopeDestination) params.set('destination_id', scopeDestination)
  if (isComparison) ids.forEach((id) => params.append('geography_ids', id))
  const key = `${kind}?${params}`
  const offset = pagination.key === key ? pagination.offset : 0
  params.set('offset', String(offset))
  let unavailable: string | null = null
  if (kind === 'comparisons' && !ids.length)
    unavailable = `Choose up to six ${dataset.mode === 'global' ? 'countries or areas' : 'states'} to compare reported ${side} values.`
  if (kind === 'net') {
    if (!dataset.id.startsWith('census_acs_'))
      unavailable =
        'Net migration is available only for complete Census ACS interstate flow observations. Stocks and disclosed IRS corridors cannot support this calculation.'
    else if (origin || destination || minimum)
      unavailable =
        'Reset the globe’s origin, destination, and minimum-value filters to calculate net migration from the complete incoming/outgoing universe.'
  }
  if (kind === 'economics') {
    if (dataset.mode === 'us')
      unavailable =
        'World Bank indicators are country-level. No US state economic dataset is integrated; national US values are not assigned to states.'
    else if (indicator && !indicator.years.includes(year))
      unavailable = `No ${indicator.name} observations at the exact ${year} migration reference year. Select 2015, 2020, or 2024 on the globe timeline; no nearest-year values are substituted.`
  }
  const result = useResource<AnalyticsPage>(
    unavailable || (kind === 'economics' && !indicator)
      ? null
      : `/api/v1/analytics/${kind}?${params}`,
    revision,
  )
  const page = result.data
  const error = result.error || (tab === 'economics' ? indicators.error : null)
  const loading = result.loading || indicators.loading
  const exportStatus = exportState?.key === key ? exportState : null
  const pointCount =
    page?.items.filter(
      (row) => row.value !== null && row.economic_value !== null,
    ).length ?? 0
  const unit =
    kind === 'distribution'
      ? 'corridors'
      : unitLabel(
          page?.measure.unit ??
            dataset.measures.find((m) => m.id === measure)?.unit ??
            '',
        )
  async function exportCsv() {
    setExportState({ key, loading: true, error: null })
    try {
      const response = await fetch(`/api/v1/analytics/${kind}/export?${params}`)
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: unknown }
        throw new Error(
          typeof problem.detail === 'string'
            ? problem.detail
            : `Export failed (HTTP ${response.status}).`,
        )
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `humanflow-${kind}-${year}.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportState({ key, loading: false, error: null })
    } catch (error) {
      setExportState({
        key,
        loading: false,
        error: error instanceof Error ? error.message : 'Export failed.',
      })
    }
  }
  return (
    <section
      className="analytics-drawer glass-panel"
      aria-label="Migration analytics"
      id="migration-analytics"
    >
      <header className="analytics-heading">
        <div>
          <p className="eyebrow">EXPLORE THE EVIDENCE</p>
          <h2>Migration analytics</h2>
        </div>
        <button
          className="icon-button"
          ref={closeButton}
          onClick={onClose}
          aria-label="Close analytics"
        >
          ×
        </button>
      </header>
      <div className="analytics-scroll">
        <p className="analytics-context">
          {dataset.name}
          <br />
          {dataset.periods.find((p) => p.year_end === year)?.label}
        </p>
        <label className="analytics-field">
          Reporting period
          <select
            aria-label="Analytics reporting period"
            value={year}
            onChange={(event) => onYearChange(Number(event.target.value))}
          >
            {dataset.periods.map((period) => (
              <option key={period.year_end} value={period.year_end}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <div
          className="analytics-tabs"
          role="tablist"
          aria-label="Analytics views"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              id={`analytics-tab-${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="analytics-content"
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault()
                  const index =
                    (TABS.findIndex((t) => t.id === tab) +
                      (event.key === 'ArrowRight' ? 1 : -1) +
                      TABS.length) %
                    TABS.length
                  setTab(TABS[index].id)
                  document
                    .getElementById(`analytics-tab-${TABS[index].id}`)
                    ?.focus()
                }
              }}
              tabIndex={tab === item.id ? 0 : -1}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="analytics-content"
          aria-labelledby={`analytics-tab-${tab}`}
        >
          {selected && !isComparison && (
            <label className="analytics-route-scope">
              <input
                type="checkbox"
                checked={followRoute}
                onChange={(event) => setFollowRoute(event.target.checked)}
              />{' '}
              Follow selected corridor: {selected.origin.name} →{' '}
              {selected.destination.name}
            </label>
          )}
          {tab === 'rankings' && (
            <label className="analytics-field">
              Ranking
              <select
                aria-label="Ranking type"
                value={ranking}
                onChange={(event) => setRanking(event.target.value)}
              >
                <option value="corridors">Top corridors</option>
                <option value="origin">Origin rankings</option>
                <option value="destination">Destination rankings</option>
                <option value="distribution">Magnitude distribution</option>
              </select>
            </label>
          )}
          {tab === 'comparisons' && (
            <label className="analytics-field">
              Comparison
              <select
                aria-label="Comparison type"
                value={comparison}
                onChange={(event) =>
                  setComparison(event.target.value as 'comparisons' | 'net')
                }
              >
                <option value="comparisons">Geography comparison</option>
                <option value="net">Net interstate migration</option>
              </select>
            </label>
          )}
          {(tab === 'comparisons' || tab === 'economics') && (
            <>
              {kind !== 'net' && (
                <label className="analytics-field">
                  Migration side
                  <select
                    aria-label="Migration side"
                    value={side}
                    onChange={(event) =>
                      setSide(event.target.value as 'origin' | 'destination')
                    }
                  >
                    <option value="destination">
                      Destination · reported incoming values
                    </option>
                    <option value="origin">
                      Origin · reported outgoing values
                    </option>
                  </select>
                </label>
              )}
              <label className="analytics-field">
                {dataset.mode === 'global'
                  ? 'Compare countries / areas'
                  : 'Compare states'}
                <select
                  aria-label="Add comparison geography"
                  value=""
                  disabled={ids.length >= 6}
                  onChange={(event) => {
                    if (event.target.value && !ids.includes(event.target.value))
                      setManualIds([...ids, event.target.value])
                  }}
                >
                  <option value="">
                    {ids.length >= 6
                      ? 'Six selected · remove one to change'
                      : 'Add a geography…'}
                  </option>
                  {entities
                    .filter((entity) => !ids.includes(entity.id))
                    .map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="analytics-chips">
                {ids.map((id) => (
                  <button
                    key={id}
                    aria-label={`Remove ${entities.find((entity) => entity.id === id)?.name ?? id}`}
                    onClick={() =>
                      setManualIds(ids.filter((item) => item !== id))
                    }
                  >
                    {entities.find((entity) => entity.id === id)?.name ?? id} ×
                  </button>
                ))}
              </div>
              {ids.length > 0 && (
                <button
                  className="analytics-text-button"
                  onClick={() => setManualIds([])}
                >
                  Clear comparison selection
                </button>
              )}
              <p className="analytics-small">
                Comparisons use the globe filters. Selecting a route proposes
                its endpoints; choose a migration side to compare reported
                values.
              </p>
            </>
          )}
          {tab === 'economics' && (
            <label className="analytics-field">
              World Bank indicator
              <select
                aria-label="Economic indicator"
                value={indicatorId}
                disabled={!indicators.data}
                onChange={(event) => setIndicatorId(event.target.value)}
              >
                {indicators.data?.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {loading && (
            <p className="analytics-state" role="status">
              Loading analytics from PostgreSQL…
            </p>
          )}
          {unavailable && (
            <p className="analytics-state" role="status">
              {unavailable}
            </p>
          )}
          {error && (
            <div className="analytics-state" role="alert">
              <p>Analytics could not be loaded. {error}</p>
              <button onClick={() => setRevision(revision + 1)}>
                Retry analytics
              </button>
            </div>
          )}
          {page && (
            <>
              <h3 className="analytics-chart-title">
                {kind === 'trends'
                  ? 'Historical reported values'
                  : kind === 'distribution'
                    ? 'Corridors by magnitude'
                    : kind === 'net'
                      ? 'Net interstate ACS estimates'
                      : kind === 'economics'
                        ? 'Economics and reported migration'
                        : kind === 'corridors'
                          ? 'Top origin → destination corridors'
                          : `Reported ${params.get('side') === 'origin' ? 'origin' : 'destination'} values`}
              </h3>
              <p className="analytics-small">
                {kind === 'trends'
                  ? 'Published reference periods · '
                  : `${page.period.label} · `}
                {unit}
                {kind !== 'distribution' &&
                kind !== 'net' &&
                kind !== 'corridors'
                  ? ' · sums of reported values'
                  : ''}
              </p>
              {!page.items.length ||
              !page.items.some((row) => row.value !== null) ? (
                <p className="analytics-state" role="status">
                  No analytics observations match. Try another geography or
                  reset the globe filters. Unavailable values are never replaced
                  with zero.
                </p>
              ) : kind === 'economics' && !pointCount ? (
                <p className="analytics-state" role="status">
                  No observed economic values match these countries and this
                  exact year. Missing values remain unavailable.
                </p>
              ) : (
                <Chart page={page} />
              )}
              {kind === 'trends' && page.items.length === 1 && (
                <p className="analytics-small">
                  Only one reporting period is integrated for this source; no
                  historical trend can be inferred.
                </p>
              )}
              {kind === 'economics' && (
                <p className="analytics-small">
                  X: {page.indicator?.name} (
                  {unitLabel(page.indicator?.unit ?? '')})<br />
                  Y: reported {page.measure.label.toLowerCase()} ({unit})<br />
                  {pointCount} observed pairs; {page.items.length - pointCount}{' '}
                  missing/unpublished pairs excluded from scatter. Correlation
                  does not establish causation.
                </p>
              )}
              <div className="analytics-coverage">
                <span>{formatNumber(page.observed)} observed cells</span>
                <span>{formatNumber(page.unavailable)} unavailable cells</span>
              </div>
              <p className="analytics-small">
                Coverage above describes the source and corridor filters before
                comparison-geography selection. Per-result coverage appears in
                the data table.
              </p>
              {page.unavailable > 0 && (
                <p className="analytics-warning">
                  {kind === 'net'
                    ? 'The full ACS matrix is incomplete. Only states with all incoming and outgoing cells observed are shown; this subset must not be summed as a national net estimate.'
                    : 'Coverage is incomplete. Sums include available cells only; changes may reflect missing observations. Do not treat them as complete totals.'}
                </p>
              )}
              <ResultsTable page={page} unit={unit} />
              {page.total > page.limit && (
                <div className="analytics-pagination">
                  <button
                    aria-label="Previous analytics page"
                    disabled={offset === 0}
                    onClick={() =>
                      setPagination({
                        key,
                        offset: Math.max(0, offset - page.limit),
                      })
                    }
                  >
                    ←
                  </button>
                  <span>
                    {offset + 1}–{Math.min(offset + page.limit, page.total)} of{' '}
                    {formatNumber(page.total)}
                  </span>
                  <button
                    aria-label="Next analytics page"
                    disabled={offset + page.limit >= page.total}
                    onClick={() =>
                      setPagination({ key, offset: offset + page.limit })
                    }
                  >
                    →
                  </button>
                </div>
              )}
              <button
                className="analytics-export"
                disabled={
                  !!exportStatus?.loading || !page.total || page.total > 5000
                }
                onClick={() => void exportCsv()}
              >
                {exportStatus?.loading
                  ? 'Preparing CSV…'
                  : 'Export filtered results · CSV ↗'}
              </button>
              {page.total > 5000 && (
                <p className="analytics-small">
                  Export exceeds 5,000 rows. Narrow the globe’s origin or
                  destination filters.
                </p>
              )}
              {exportStatus?.error && (
                <p className="analytics-warning" role="alert">
                  {exportStatus.error}
                </p>
              )}
              <p className="analytics-note">{page.note}</p>
              <div className="analytics-sources">
                {page.sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.provider} · {source.license} ↗
                  </a>
                ))}
                {page.indicator && (
                  <a
                    href={page.indicator.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {page.indicator.provider} · {page.indicator.license} ↗
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
