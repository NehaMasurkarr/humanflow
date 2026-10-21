import { lazy, Suspense, useCallback, useState, type FormEvent } from 'react'
import { formatNumber, unitLabel, useMediaQuery, useResource } from './lib/api'
import type {
  Corridor,
  CorridorPage,
  Dataset,
  GeographyPage,
  Mode,
} from './lib/types'
import './App.css'
import './analytics/analytics.css'

const AnalyticsDrawer = lazy(() => import('./analytics/AnalyticsDrawer'))
const GlobeViewport = lazy(() => import('./globe/GlobeViewport'))
const EMPTY_ROUTES: Corridor[] = []

function BrandMark() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="14" />
      <ellipse cx="18" cy="18" rx="6" ry="14" />
      <path d="M4 18h28M7 10c6 5 16 5 22 0M7 26c6-5 16-5 22 0" />
    </svg>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('global')
  const [datasetId, setDatasetId] = useState('un_stock_2024')
  const [year, setYear] = useState(2024)
  const [measure, setMeasure] = useState('stock_persons')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [search, setSearch] = useState('')
  const [minimumInput, setMinimumInput] = useState('0')
  const [minimum, setMinimum] = useState(0)
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<{
    route: Corridor
    x: number
    y: number
  } | null>(null)
  const [motionEnabled, setMotionEnabled] = useState(true)
  const [lowPower, setLowPower] = useState(false)
  const [reset, setReset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [mobilePanel, setMobilePanel] = useState<'filters' | 'insights' | null>(
    null,
  )
  const [about, setAbout] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const closeAnalytics = useCallback(() => {
    setAnalyticsOpen(false)
    setMobilePanel('insights')
    window.setTimeout(() => document.getElementById('open-analytics')?.focus(), 0)
  }, [])
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const mobile = useMediaQuery('(max-width: 760px)')
  const limit = lowPower ? 24 : mobile ? 32 : 48
  const catalog = useResource<Dataset[]>('/api/v1/datasets', revision)
  const locations = useResource<GeographyPage>(
    `/api/v1/geographies?mode=${mode}&limit=250`,
    revision,
  )
  const dataset = catalog.data?.find(
    (d) => d.id === datasetId && d.mode === mode,
  )
  const params = new URLSearchParams({
    mode,
    dataset_id: datasetId,
    year: String(year),
    measure,
    min_value: String(minimum),
    limit: String(limit),
    offset: String(offset),
  })
  if (origin) params.set('origin_id', origin)
  if (destination) params.set('destination_id', destination)
  const corridors = useResource<CorridorPage>(
    dataset ? `/api/v1/corridors?${params}` : null,
    revision,
  )
  const page = corridors.data
  const routes = page?.items ?? EMPTY_ROUTES
  const selected = routes.find((r) => r.id === selectedId)
  const hovered =
    hover && routes.find((r) => r.id === hover.route.id) ? hover : null
  const error = catalog.error || locations.error || corridors.error
  const loading = catalog.loading || locations.loading || corridors.loading
  const entities = locations.data?.items ?? []
  const filteredEntities = entities.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()),
  )
  const period = dataset?.periods.find((p) => p.year_end === year)
  const motion = motionEnabled && !reducedMotion && !lowPower
  const clearSelection = () => {
    setSelectedId(null)
    setHover(null)
    setOffset(0)
  }
  const changeDataset = (id: string, nextMode: Mode = mode) => {
    const next = catalog.data?.find((d) => d.id === id)
    setMode(nextMode)
    setDatasetId(id)
    setYear(next?.periods[0]?.year_end ?? 2024)
    setMeasure(
      next?.measures[0]?.id ??
        (nextMode === 'global' ? 'stock_persons' : 'acs_movers'),
    )
    setOrigin('')
    setDestination('')
    setSearch('')
    setMinimum(0)
    setMinimumInput('0')
    clearSelection()
  }
  const onHover = useCallback((route: Corridor | null, x = 0, y = 0) => {
    setHover(route ? { route, x, y } : null)
  }, [])
  const selectRoute = useCallback((id: string) => {
    setSelectedId(id)
    setHover(null)
    if (window.matchMedia('(max-width: 760px)').matches)
      setMobilePanel('insights')
  }, [])
  const applyMinimum = (event: FormEvent) => {
    event.preventDefault()
    const value = Number(minimumInput)
    if (Number.isSafeInteger(value) && value >= 0 && value <= 1e12) {
      setMinimum(value)
      clearSelection()
    }
  }

  return (
    <main className={`app-shell mode-${mode}`}>
      <div className="space-grain" aria-hidden="true" />
      <Suspense
        fallback={
          <div className="earth-loading" role="status">
            Loading the Earth renderer…
          </div>
        }
      >
        <GlobeViewport
          routes={routes}
          mode={mode}
          selected={selected?.id ?? null}
          motion={motion && !hovered}
          lowPower={lowPower}
          reset={reset}
          onSelect={selectRoute}
          onHover={onHover}
        />
      </Suspense>

      <header className="topbar">
        <a className="brand" href="/" aria-label="HumanFlow home">
          <BrandMark />
          <span>
            Human<span className="brand-light">Flow</span>
          </span>
        </a>
        <nav className="mode-switch" aria-label="Migration mode">
          <button
            aria-pressed={mode === 'global'}
            onClick={() => changeDataset('un_stock_2024', 'global')}
          >
            <span aria-hidden="true">◎</span> Global
          </button>
          <button
            aria-pressed={mode === 'us'}
            onClick={() => changeDataset('census_acs_2024', 'us')}
          >
            <span aria-hidden="true">◈</span> United States
          </button>
        </nav>
        <button className="about-button" onClick={() => setAbout(true)}>
          <span className="live-dot" /> Behind the data{' '}
          <span aria-hidden="true">↗</span>
        </button>
      </header>

      <section className="introduction" aria-label="Introduction">
        <p className="eyebrow">
          <span className="short-line" /> THE GEOGRAPHY OF HUMAN CONNECTION
        </p>
        <h1>
          Every connection.
          <br />
          <span>A human story.</span>
        </h1>
        <p className="intro-copy">
          Explore the patterns that connect our world.
        </p>
        <span className="mode-caption">
          {mode === 'global'
            ? '01 / INTERNATIONAL MIGRANT STOCK'
            : '02 / US DOMESTIC MIGRATION'}
        </span>
      </section>

      <div className="mobile-panel-toggle" aria-label="Explore controls">
        <button
          aria-expanded={mobilePanel === 'filters'}
          onClick={() =>
            setMobilePanel(mobilePanel === 'filters' ? null : 'filters')
          }
        >
          Filters <span>⚙</span>
        </button>
        <button
          aria-expanded={mobilePanel === 'insights'}
          onClick={() =>
            setMobilePanel(mobilePanel === 'insights' ? null : 'insights')
          }
        >
          Corridors <span>↗</span>
        </button>
      </div>

      <aside
        className={`filter-panel glass-panel ${mobilePanel === 'filters' ? 'mobile-open' : ''}`}
        aria-label="Migration filters"
      >
        <div className="panel-heading">
          <h2>Explore connections</h2>
          <button
            className="close-mobile"
            aria-label="Close filters"
            onClick={() => setMobilePanel(null)}
          >
            ×
          </button>
        </div>
        <label>
          Data source
          <select
            value={datasetId}
            disabled={!catalog.data}
            onChange={(e) => changeDataset(e.target.value)}
          >
            {(catalog.data ?? [])
              .filter((d) => d.mode === mode)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <label className="search-label">
          <span className="sr-only">Search countries or states</span>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder={
              mode === 'global' ? 'Find a country…' : 'Find a state…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {search && (
          <p className="search-status" role="status">
            {filteredEntities.length} places found. Choose origin or
            destination.
          </p>
        )}
        <div className="place-fields">
          <label>
            Origin
            <select
              aria-label="Origin"
              value={origin}
              disabled={locations.loading}
              onChange={(e) => {
                setOrigin(e.target.value)
                setSearch('')
                clearSelection()
              }}
            >
              <option value="">
                All {mode === 'global' ? 'countries' : 'states'}
              </option>
              {entities
                .filter(
                  (g) =>
                    !search || filteredEntities.includes(g) || g.id === origin,
                )
                .map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                    {!g.anchor ? ' (no anchor)' : ''}
                  </option>
                ))}
            </select>
          </label>
          <span className="direction-marker" aria-hidden="true">
            ↓
          </span>
          <label>
            Destination
            <select
              aria-label="Destination"
              value={destination}
              disabled={locations.loading}
              onChange={(e) => {
                setDestination(e.target.value)
                setSearch('')
                clearSelection()
              }}
            >
              <option value="">
                All {mode === 'global' ? 'countries' : 'states'}
              </option>
              {entities
                .filter(
                  (g) =>
                    !search ||
                    filteredEntities.includes(g) ||
                    g.id === destination,
                )
                .map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                    {!g.anchor ? ' (no anchor)' : ''}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {dataset && dataset.measures.length > 1 && (
          <label>
            Observation measure
            <select
              value={measure}
              onChange={(e) => {
                setMeasure(e.target.value)
                clearSelection()
              }}
            >
              {dataset.measures.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <form onSubmit={applyMinimum} className="magnitude-form">
          <label htmlFor="minimum">Minimum observation value</label>
          <div>
            <input
              id="minimum"
              type="number"
              min="0"
              max="1000000000000"
              step="1"
              value={minimumInput}
              onChange={(e) => setMinimumInput(e.target.value)}
            />
            <button type="submit" aria-label="Apply minimum value">
              Apply
            </button>
          </div>
        </form>
        <button
          className="reset-filters"
          onClick={() => changeDataset(datasetId)}
        >
          ↺ Reset filters
        </button>
        <div className="source-note">
          <span className="live-dot" />
          <span>
            {mode === 'global'
              ? 'Stocks, not annual flows'
              : 'Source-specific migration estimates'}
          </span>
        </div>
      </aside>

      <aside
        className={`insight-panel glass-panel ${mobilePanel === 'insights' ? 'mobile-open' : ''}`}
        aria-label="Corridor insights"
      >
        <div className="panel-heading">
          <h2>{selected ? 'Connection detail' : 'At a glance'}</h2>
          {selected ? (
            <button
              className="icon-button"
              aria-label="Clear selected corridor"
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>
          ) : (
            <span className="panel-kicker">{year}</span>
          )}
          <button
            className="close-mobile"
            aria-label="Close corridors"
            onClick={() => setMobilePanel(null)}
          >
            ×
          </button>
        </div>
        {selected && page ? (
          <div className="route-detail">
            <p className="eyebrow">ORIGIN → DESTINATION</p>
            <h3>
              {selected.origin.name}
              <span>→</span>
              {selected.destination.name}
            </h3>
            <p className="detail-value">{formatNumber(selected.value)}</p>
            <p className="detail-unit">
              {unitLabel(selected.unit)} · {page.measure.label}
            </p>
            <dl>
              <div>
                <dt>Reporting period</dt>
                <dd>{page.period.label}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{page.dataset.provider}</dd>
              </div>
              {selected.moe !== null && (
                <div>
                  <dt>Margin of error (90%)</dt>
                  <dd>± {formatNumber(selected.moe)}</dd>
                </div>
              )}
              <div>
                <dt>Source row</dt>
                <dd>{selected.source_row}</dd>
              </div>
            </dl>
            <a href={page.dataset.source_url} target="_blank" rel="noreferrer">
              View official source ↗
            </a>
            <p className="detail-caveat">{page.dataset.caveat}</p>
          </div>
        ) : (
          <>
            <div className="overview-stat">
              <strong>{loading ? '—' : routes.length}</strong>
              <span>corridors on screen</span>
            </div>
            <p className="overview-caption">
              {page
                ? `${formatNumber(page.total)} drawable connections match your filters`
                : 'Connections grounded in official data'}
            </p>
            <div className="panel-divider" />
            <div className="panel-subheading">
              <h3>Largest shown</h3>
              <span>ORIGIN → DESTINATION</span>
            </div>
            <div className="route-list">
              {routes.slice(0, 5).map((route, index) => (
                <button key={route.id} onClick={() => selectRoute(route.id)}>
                  <span className="route-rank">
                    {String(offset + index + 1).padStart(2, '0')}
                  </span>
                  <span className="route-name">
                    {route.origin.name}
                    <span>→ {route.destination.name}</span>
                  </span>
                  <span className="route-count">
                    {Intl.NumberFormat('en-US', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(route.value)}
                  </span>
                </button>
              ))}
            </div>
            <div className="pagination">
              <button
                disabled={!page || loading || offset === 0}
                aria-label="Previous corridors"
                onClick={() => {
                  setOffset(Math.max(0, offset - limit))
                  setSelectedId(null)
                }}
              >
                ←
              </button>
              <span>
                {page?.total
                  ? `${offset + 1}–${Math.min(offset + limit, page.total)} of ${formatNumber(page.total)}`
                  : 'No corridors'}
              </span>
              <button
                disabled={!page || loading || offset + limit >= page.total}
                aria-label="Next corridors"
                onClick={() => {
                  setOffset(offset + limit)
                  setSelectedId(null)
                }}
              >
                →
              </button>
            </div>
          </>
        )}
        {page && (
          <div className="coverage-note">
            {page.excluded_without_anchors > 0 && (
              <p>
                {formatNumber(page.excluded_without_anchors)} matching
                observations lack a geographic anchor.
              </p>
            )}
            {page.unavailable_in_period > 0 && (
              <p>
                {formatNumber(page.unavailable_in_period)} values unavailable in
                this reporting period.
              </p>
            )}
          </div>
        )}
        <button
          className="analytics-launch"
          id="open-analytics"
          aria-expanded={analyticsOpen}
          aria-controls="migration-analytics"
          disabled={!dataset}
          onClick={() => {
            setMobilePanel(null)
            setAnalyticsOpen(true)
          }}
        >
          Analytics <span aria-hidden="true">↗</span>
        </button>
      </aside>

      {analyticsOpen && dataset && (
        <Suspense
          fallback={
            <div className="data-status" role="status">
              Loading analytics interface…
            </div>
          }
        >
          <AnalyticsDrawer
            key={`${mode}:${datasetId}:${measure}`}
            dataset={dataset}
            year={year}
            measure={measure}
            origin={origin}
            destination={destination}
            minimum={minimum}
            selected={selected}
            entities={entities}
            onClose={closeAnalytics}
            onYearChange={(nextYear) => {
              setYear(nextYear)
              clearSelection()
            }}
          />
        </Suspense>
      )}

      <div className="view-controls" aria-label="Globe controls">
        <button
          aria-label={motion ? 'Pause motion' : 'Motion paused'}
          aria-pressed={motionEnabled && !reducedMotion}
          disabled={reducedMotion || lowPower}
          onClick={() => setMotionEnabled(!motionEnabled)}
        >
          {motion ? 'Ⅱ' : '▷'}{' '}
          <span>{motion ? 'Pause motion' : 'Motion paused'}</span>
        </button>
        <button
          onClick={() => setReset(reset + 1)}
          aria-label="Reset globe view"
        >
          ⟳ <span>Reset view</span>
        </button>
        <button
          aria-label="Low power"
          aria-pressed={lowPower}
          onClick={() => {
            setLowPower(!lowPower)
            setOffset(0)
          }}
        >
          ◌ <span>Low power</span>
        </button>
      </div>

      <section className="timeline glass-panel" aria-label="Reporting period">
        <div className="timeline-label">
          <span className="eyebrow">
            {mode === 'global' ? 'REFERENCE YEAR' : 'REPORTING PERIOD'}
          </span>
          <span>{period?.label ?? 'Loading periods'}</span>
        </div>
        <div className="year-options">
          {dataset?.periods
            .slice()
            .reverse()
            .map((p) => (
              <button
                key={p.year_end}
                aria-pressed={year === p.year_end}
                onClick={() => {
                  setYear(p.year_end)
                  clearSelection()
                }}
              >
                {p.year_start !== p.year_end
                  ? `${p.year_start}–${p.year_end}`
                  : p.year_end}
              </button>
            ))}
        </div>
      </section>

      {loading && (
        <div className="data-status" role="status">
          <span className="live-dot" /> Loading official observations…
        </div>
      )}
      {error && (
        <div className="message-card glass-panel" role="alert">
          <h2>Data is temporarily unavailable</h2>
          <p>{error}</p>
          <button onClick={() => setRevision(revision + 1)}>Try again</button>
        </div>
      )}
      {!loading && !error && page && !routes.length && (
        <div className="message-card glass-panel" role="status">
          <h2>No connections match</h2>
          <p>
            Try a different origin, destination, or minimum value. Missing
            observations are never replaced with zero.
          </p>
          <button onClick={() => changeDataset(datasetId)}>
            Reset filters
          </button>
        </div>
      )}

      {hovered && page && (
        <div
          className="route-tooltip"
          role="tooltip"
          style={{
            left: Math.min(hovered.x + 18, window.innerWidth - 300),
            top: Math.min(hovered.y + 12, window.innerHeight - 190),
          }}
        >
          <p>
            {hovered.route.origin.name} <span>→</span>{' '}
            {hovered.route.destination.name}
          </p>
          <strong>
            {formatNumber(hovered.route.value)}{' '}
            <small>{unitLabel(hovered.route.unit)}</small>
          </strong>
          <span>{page.period.label}</span>
          <span>{page.dataset.provider}</span>
          <span className="tooltip-hint">Click to explore this connection</span>
        </div>
      )}

      <footer className="footer">
        <p>
          <span className="legend-line" /> Origin → destination{' '}
          <span className="footer-separator">/</span>{' '}
          <span>Arcs are relationships, not travel paths.</span>
        </p>
        <button onClick={() => setAbout(true)}>
          NASA Earth imagery · Sources & notes ↗
        </button>
      </footer>
      <p className="interaction-hint">
        Drag to rotate <span>·</span> Scroll or pinch to zoom
      </p>

      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            className="about-dialog glass-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Sources and visualization notes"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h2>Grounded in real data.</h2>
              <button
                className="icon-button"
                aria-label="Close sources"
                onClick={() => setAbout(false)}
              >
                ×
              </button>
            </div>
            <p>{dataset?.caveat}</p>
            <p>{dataset?.definition}</p>
            <p>
              Endpoints use World Bank capital-city coordinates and Census state
              internal points. These are visualization anchors, not actual
              migrant travel paths. Moving particles indicate
              origin-to-destination direction, not journeys in progress.
            </p>
            <p>
              Day and night imagery: NASA Blue Marble (2004) and Black Marble
              (2016). Lighting is illustrative, not a live solar simulation.
              Historical migration years do not change the imagery date.
            </p>
            <p>
              At most {limit} corridors are drawn at a time. Width reflects
              relative magnitude within the displayed page. Low-power mode
              limits routes and stops animation.
            </p>
            {dataset && (
              <a href={dataset.source_url} target="_blank" rel="noreferrer">
                {dataset.provider} · Official source ↗
              </a>
            )}
            <a
              href="https://www.nasa.gov/nasa-brand-center/images-and-media/"
              target="_blank"
              rel="noreferrer"
            >
              NASA imagery usage & credits ↗
            </a>
          </section>
        </div>
      )}
    </main>
  )
}
