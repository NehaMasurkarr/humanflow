import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnalyticsDrawer from './AnalyticsDrawer'
import type { Corridor, Dataset, Geography } from '../lib/types'
import catalog from '../test/fixtures/catalog.json'
import geographies from '../test/fixtures/global-geographies.json'
import usGeographies from '../test/fixtures/us-geographies.json'
import routePage from '../test/fixtures/global-2024.json'
import trends from '../test/fixtures/analytics/trends.json'
import routeTrends from '../test/fixtures/analytics/route-trends.json'
import corridors from '../test/fixtures/analytics/corridors.json'
import nextPage from '../test/fixtures/analytics/corridors-page-2.json'
import origins from '../test/fixtures/analytics/origins.json'
import distribution from '../test/fixtures/analytics/distribution.json'
import comparisons from '../test/fixtures/analytics/comparisons.json'
import economics from '../test/fixtures/analytics/economics.json'
import population from '../test/fixtures/analytics/population.json'
import indicators from '../test/fixtures/analytics/indicators.json'
import empty from '../test/fixtures/analytics/empty.json'
import net from '../test/fixtures/analytics/net.json'

// Drawer behavior is independent of WebGL/chart layout; real SVG interaction is covered in Chromium.
vi.mock('./Chart', () => ({
  default: ({ page }: { page: { kind: string } }) => (
    <div data-testid="analytics-chart">{page.kind} chart</div>
  ),
}))
const requests = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input), 'http://localhost')
  const kind = url.pathname.split('/').at(-1)
  const data =
    kind === 'indicators'
      ? indicators
      : kind === 'trends'
        ? url.searchParams.has('origin_id')
          ? routeTrends
          : trends
        : kind === 'corridors'
          ? Number(url.searchParams.get('min_value')) >= 1e12
            ? empty
            : url.searchParams.get('offset') === '10'
              ? nextPage
              : corridors
          : kind === 'rankings'
            ? origins
            : kind === 'distribution'
              ? distribution
              : kind === 'net'
                ? net
                : kind === 'economics'
                  ? url.searchParams.get('indicator') === 'SP.POP.TOTL'
                    ? population
                    : economics
                  : comparisons
  return { ok: true, json: async () => data } as Response
})
const close = vi.fn()
const changeYear = vi.fn()
const base = () => ({
  dataset: catalog[0] as Dataset,
  year: 2024,
  measure: 'stock_persons',
  origin: '',
  destination: '',
  minimum: 0,
  entities: geographies.items as Geography[],
  onClose: close,
  onYearChange: changeYear,
})
beforeEach(() => {
  requests.mockClear()
  close.mockClear()
  changeYear.mockClear()
  vi.stubGlobal('fetch', requests)
})
afterEach(() => vi.unstubAllGlobals())
const tab = (name: string) => screen.getByRole('tab', { name })
const sent = (part: string) =>
  requests.mock.calls.some(([url]) => String(url).includes(part))

describe('approved analytics drawer', () => {
  it('shows stock trend coverage, data table, source, and reporting-period control', async () => {
    render(<AnalyticsDrawer {...base()} />)
    await screen.findByTestId('analytics-chart')
    expect(
      screen.getByText(/stock changes are not annual flows/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Coverage is incomplete/)).toBeInTheDocument()
    await userEvent.click(screen.getByText(/View data table/))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    expect(within(table).getAllByText('2024').length).toBeGreaterThan(0)
    await userEvent.selectOptions(
      screen.getByLabelText('Analytics reporting period'),
      '2020',
    )
    expect(changeYear).toHaveBeenCalledWith(2020)
    expect(screen.getByRole('link', { name: /UN DESA/ })).toHaveAttribute(
      'href',
      trends.dataset.source_url,
    )
    await userEvent.keyboard('{Escape}')
    expect(close).toHaveBeenCalledOnce()
  })

  it('requests ranking pagination, origin rankings, and magnitude distributions', async () => {
    render(<AnalyticsDrawer {...base()} />)
    await screen.findByTestId('analytics-chart')
    await userEvent.click(tab('Rankings'))
    await screen.findByRole('button', { name: 'Next analytics page' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Next analytics page' }),
    )
    await waitFor(() => expect(sent('offset=10')).toBe(true))
    await userEvent.selectOptions(
      screen.getByLabelText('Ranking type'),
      'origin',
    )
    await waitFor(() => expect(sent('side=origin')).toBe(true))
    await userEvent.selectOptions(
      screen.getByLabelText('Ranking type'),
      'distribution',
    )
    await screen.findByText('Corridors by magnitude')
    expect(screen.getByTestId('analytics-chart')).toHaveTextContent(
      'distribution',
    )
    expect(requests.mock.calls.at(-1)?.[0]).toContain('offset=0')
  })

  it('sends real geography identifiers and economic indicators without pooling sources', async () => {
    render(<AnalyticsDrawer {...base()} />)
    await userEvent.click(tab('Comparisons'))
    expect(await screen.findByText(/Choose up to six/)).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Add comparison geography'),
      'country:356',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Add comparison geography'),
      'country:840',
    )
    await waitFor(() =>
      expect(
        sent('geography_ids=country%3A356&geography_ids=country%3A840'),
      ).toBe(true),
    )
    await userEvent.click(tab('Economics'))
    await screen.findByText(/2 observed pairs/)
    expect(
      screen.getByText(/Correlation does not establish causation/),
    ).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Economic indicator'),
      'SP.POP.TOTL',
    )
    await waitFor(() => expect(sent('indicator=SP.POP.TOTL')).toBe(true))
    await userEvent.selectOptions(
      screen.getByLabelText('Migration side'),
      'origin',
    )
    await waitFor(() =>
      expect(sent('economics?') && requests.mock.calls.at(-1)?.[0]).toContain(
        'side=origin',
      ),
    )
  })

  it('follows the selected route and can return to the globe filters', async () => {
    const route = routePage.items[0] as Corridor
    render(<AnalyticsDrawer {...base()} selected={route} />)
    await screen.findByTestId('analytics-chart')
    expect(sent(`origin_id=${encodeURIComponent(route.origin.id)}`)).toBe(true)
    expect(
      sent(`destination_id=${encodeURIComponent(route.destination.id)}`),
    ).toBe(true)
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Follow selected corridor/ }),
    )
    await waitFor(() =>
      expect(String(requests.mock.calls.at(-1)?.[0])).not.toContain(
        'origin_id=',
      ),
    )
    await userEvent.click(tab('Comparisons'))
    expect(
      screen.getByRole('button', { name: `Remove ${route.origin.name}` }),
    ).toBeInTheDocument()
  })

  it('explains unsupported economics and net calculations rather than requesting them', async () => {
    const props = { ...base(), year: 1990 }
    const view = render(<AnalyticsDrawer {...props} />)
    await userEvent.click(tab('Economics'))
    expect(
      await screen.findByText(/No .* observations at the exact 1990/),
    ).toBeInTheDocument()
    expect(
      requests.mock.calls.some(([url]) => String(url).includes('/economics?')),
    ).toBe(false)
    await userEvent.click(tab('Comparisons'))
    await userEvent.selectOptions(
      screen.getByLabelText('Comparison type'),
      'net',
    )
    expect(
      screen.getByText(/Stocks and disclosed IRS corridors/),
    ).toBeInTheDocument()
    view.rerender(
      <AnalyticsDrawer
        {...base()}
        dataset={catalog.find((d) => d.id === 'census_acs_2024') as Dataset}
        entities={usGeographies.items as Geography[]}
        measure="acs_movers"
      />,
    )
    await screen.findByText('Net interstate ACS estimates')
    expect(sent('/net?')).toBe(true)
    view.rerender(
      <AnalyticsDrawer
        {...base()}
        dataset={catalog.find((d) => d.id === 'census_acs_2024') as Dataset}
        entities={usGeographies.items as Geography[]}
        measure="acs_movers"
        origin="state:06"
      />,
    )
    expect(screen.getByText(/Reset the globe’s origin/)).toBeInTheDocument()
    await userEvent.click(tab('Economics'))
    expect(screen.getByText(/No US state economic dataset/)).toBeInTheDocument()
  })

  it('reports failed CSV downloads and explains oversized exports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes('/export?'))
          return {
            ok: false,
            status: 503,
            json: async () => ({
              detail: 'Migration data is temporarily unavailable',
            }),
          } as Response
        return requests(input)
      }),
    )
    render(<AnalyticsDrawer {...base()} />)
    await screen.findByTestId('analytics-chart')
    await userEvent.click(
      screen.getByRole('button', { name: /Export filtered results/ }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Migration data is temporarily unavailable',
    )
    expect(
      screen.getByRole('button', { name: /Export filtered results/ }),
    ).not.toBeDisabled()
    await userEvent.click(tab('Rankings'))
    expect(
      await screen.findByText(/Export exceeds 5,000 rows/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Export filtered results/ }),
    ).toBeDisabled()
  })

  it('offers loading, empty, and retry states without fallback statistics', async () => {
    let resolve: ((value: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done
          }),
      ),
    )
    const view = render(<AnalyticsDrawer {...base()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading analytics')
    await waitFor(() => expect(resolve).toBeDefined())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    )
    view.rerender(<AnalyticsDrawer {...base()} minimum={1e12} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Analytics could not be loaded',
    )
    vi.stubGlobal('fetch', requests)
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry analytics' }),
    )
    await screen.findByTestId('analytics-chart')
    await userEvent.click(tab('Rankings'))
    expect(
      await screen.findByText(/No analytics observations match/),
    ).toBeInTheDocument()
  })
})
