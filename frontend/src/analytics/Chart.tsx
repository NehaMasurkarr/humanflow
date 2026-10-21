import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { unitLabel } from '../lib/api'
import { compact, displayValue } from './format'
import type { AnalyticsPage, AnalyticsRow } from './types'

function ChartTooltip({
  active,
  payload,
  page,
}: Partial<TooltipContentProps> & { page: AnalyticsPage }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as AnalyticsRow
  return (
    <div className="analytics-tooltip">
      <strong>{row.label}</strong>
      <p>
        {displayValue(row.value)}{' '}
        {page.kind === 'distribution'
          ? 'corridors'
          : unitLabel(page.measure.unit)}
      </p>
      {page.indicator && (
        <p>
          {displayValue(row.economic_value)} {unitLabel(page.indicator.unit)}
        </p>
      )}
      <p>
        {row.year_start !== row.year_end
          ? `${row.year_start} → ${row.year_end}`
          : row.year_end}{' '}
        · {page.dataset.observation_type}
      </p>
      <p>
        {row.observed} observed · {row.unavailable} unavailable cells
      </p>
      {row.moe !== null && <p>MOE (90%): ±{displayValue(row.moe)}</p>}
      <p>
        {page.sources.find((source) => source.id === row.dataset_id)?.provider}
      </p>
    </div>
  )
}

export default function Chart({ page }: { page: AnalyticsPage }) {
  const tooltip = (
    <Tooltip content={(props) => <ChartTooltip {...props} page={page} />} />
  )
  const axes = {
    stroke: '#89a6b9',
    tick: { fontSize: 10 },
    tickLine: false,
    axisLine: false,
  }
  const margin = { top: 12, right: 16, bottom: 12, left: 4 }
  const dots = page.items.filter(
    (row) => row.value !== null && row.economic_value !== null,
  )
  const chart =
    page.kind === 'trends' ? (
      <LineChart
        data={page.items}
        margin={margin}
        title="Historical reported migration values"
      >
        <CartesianGrid stroke="#7198ae20" vertical={false} />
        <XAxis
          {...axes}
          dataKey="year_end"
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={page.items.map((row) => row.year_end)}
        />
        <YAxis {...axes} tickFormatter={compact} width={58} />
        {tooltip}
        <Line
          type="linear"
          dataKey="value"
          stroke="#6bd5ff"
          strokeWidth={2}
          dot={{ r: 3, fill: '#6bd5ff' }}
          activeDot={{ r: 5, fill: '#d8b76b' }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    ) : page.kind === 'economics' ? (
      <ScatterChart
        margin={margin}
        title="Country economic and migration comparison"
      >
        <CartesianGrid stroke="#7198ae20" />
        <XAxis
          {...axes}
          type="number"
          dataKey="economic_value"
          name={page.indicator?.name}
          tickFormatter={compact}
        />
        <YAxis
          {...axes}
          type="number"
          dataKey="value"
          tickFormatter={compact}
          width={58}
          name={page.measure.label}
        />
        {tooltip}
        <Scatter data={dots} fill="#6bd5ff" isAnimationActive={false} />
      </ScatterChart>
    ) : (
      <BarChart
        layout="vertical"
        data={page.items}
        margin={margin}
        title="Reported migration ranking"
      >
        <CartesianGrid stroke="#7198ae20" horizontal={false} />
        <XAxis {...axes} type="number" tickFormatter={compact} />
        <YAxis
          {...axes}
          type="category"
          dataKey="label"
          width={130}
          tickFormatter={(label: string) =>
            label.length > 21 ? `${label.slice(0, 20)}…` : label
          }
        />
        {tooltip}
        <Bar
          dataKey="value"
          fill="#6bd5ff"
          radius={[0, 3, 3, 0]}
          maxBarSize={22}
          isAnimationActive={false}
        />
      </BarChart>
    )
  return (
    <div className="analytics-chart" aria-label={`${page.kind} chart`}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 420, height: 280 }}
        debounce={100}
      >
        {chart}
      </ResponsiveContainer>
    </div>
  )
}
