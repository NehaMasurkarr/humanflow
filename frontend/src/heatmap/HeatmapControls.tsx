import { useState } from 'react'
import { formatNumber, unitLabel } from '../lib/api'
import { legendValue } from './geography'
import type { Direction, HeatmapPage } from './types'

export default function HeatmapControls({
  page,
  direction,
  onDirection,
  opacity,
  onOpacity,
  highlight,
  onHighlight,
  showUnavailable,
  onShowUnavailable,
}: {
  page: HeatmapPage | null
  direction: Direction
  onDirection: (direction: Direction) => void
  opacity: number
  onOpacity: (opacity: number) => void
  highlight: number
  onHighlight: (percent: number) => void
  showUnavailable: boolean
  onShowUnavailable: (visible: boolean) => void
}) {
  const [legendHover, setLegendHover] = useState<number | null>(null)
  const hasObserved = page?.items.some((row) => row.included > 0) ?? false
  const max = page?.max_value ?? 0
  const unit = unitLabel(page?.measure.unit ?? '')
  return (
    <div className="heatmap-controls" aria-label="Heatmap controls">
      <label>
        Direction
        <select
          aria-label="Heatmap direction"
          value={direction}
          onChange={(event) => onDirection(event.target.value as Direction)}
        >
          <option value="incoming">Incoming · destination sums</option>
          <option value="outgoing">Outgoing · origin sums</option>
        </select>
      </label>
      <label>
        Overlay opacity <output>{Math.round(opacity * 100)}%</output>
        <input
          aria-label="Heatmap opacity"
          type="range"
          min="0"
          max="85"
          value={Math.round(opacity * 100)}
          onChange={(event) => onOpacity(Number(event.target.value) / 100)}
        />
      </label>
      <div className="heatmap-legend" aria-label="Migration intensity legend">
        <p>Reported magnitude · {unit || 'loading units'}</p>
        <div
          className="heatmap-gradient"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            setLegendHover(
              Math.max(
                0,
                Math.min(100, ((event.clientX - box.left) / box.width) * 100),
              ),
            )
          }}
          onPointerLeave={() => setLegendHover(null)}
          aria-hidden="true"
        />
        {legendHover !== null && hasObserved && (
          <p role="tooltip">
            {formatNumber(Math.round(legendValue(legendHover, max)))} {unit}
          </p>
        )}
        {!hasObserved && <p>No reported values for intensity scaling.</p>}
        {hasObserved && max === 0 && <p>All reported values are zero.</p>}
        <div className="heatmap-ticks">
          {[0, 25, 50, 75, 100].map((percent) => (
            <button
              key={percent}
              disabled={!hasObserved}
              aria-label={`Highlight at ${percent}% of color scale`}
              onClick={() => onHighlight(percent)}
              title={`${formatNumber(Math.round(legendValue(percent, max)))} ${unit}`}
            >
              {Intl.NumberFormat('en-US', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(legendValue(percent, max))}
            </button>
          ))}
        </div>
        <label>
          Highlight ≥ {formatNumber(Math.round(legendValue(highlight, max)))}{' '}
          {unit}
          <input
            disabled={!hasObserved}
            aria-label="Heatmap legend threshold"
            aria-valuetext={`${formatNumber(Math.round(legendValue(highlight, max)))} ${unit}`}
            type="range"
            min="0"
            max="100"
            value={highlight}
            onChange={(event) => onHighlight(Number(event.target.value))}
          />
        </label>
        <p>
          Logarithmic color scale · resets to each selection’s maximum. Lower
          values are dimmed, not removed.
        </p>
        <label className="heatmap-unavailable">
          <input
            type="checkbox"
            checked={showUnavailable}
            onChange={(event) => onShowUnavailable(event.target.checked)}
          />{' '}
          Show unavailable / unpublished (gray hatch)
        </label>
        <p>
          Zero is blue; partial reported sums are hatched. Color is not
          population density.
        </p>
      </div>
      {page && (
        <p className="heatmap-coverage">
          {page.items.filter((row) => row.has_boundary).length}/
          {page.items.length} geographies have outlines.{' '}
          {page.unmatched_geographies.length > 0 &&
            'Unmatched areas remain in the table below.'}
        </p>
      )}
    </div>
  )
}
