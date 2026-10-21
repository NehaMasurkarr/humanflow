import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Corridor } from './lib/types'
import catalog from './test/fixtures/catalog.json'
import globalLocations from './test/fixtures/global-geographies.json'
import usLocations from './test/fixtures/us-geographies.json'
import globalPage from './test/fixtures/global-2024.json'
import olderPage from './test/fixtures/global-2020.json'
import censusPage from './test/fixtures/us-census.json'
import irsPage from './test/fixtures/us-irs.json'
import emptyPage from './test/fixtures/empty.json'
import analyticsTrends from './test/fixtures/analytics/trends.json'
import heatIncoming from './test/fixtures/heatmap/global-incoming.json'
import heatOutgoing from './test/fixtures/heatmap/global-outgoing.json'
import boundaryRaw from '../public/boundaries/global.geojson?raw'

vi.mock('./analytics/Chart', () => ({
  default: () => <div>Analytics chart loaded</div>,
}))

vi.mock('./globe/GlobeViewport', () => ({
  default: ({
    routes,
    onSelect,
  }: {
    routes: Corridor[]
    onSelect: (id: string) => void
  }) => (
    <div data-testid="globe">
      {routes.map((r) => (
        <button key={r.id} onClick={() => onSelect(r.id)}>
          Select 3D corridor {r.origin.name}
        </button>
      ))}
    </div>
  ),
}))

function responseFor(input: string | URL | Request) {
  const url = new URL(String(input), 'http://localhost')
  if (url.pathname.endsWith('.geojson')) return JSON.parse(boundaryRaw)
  if (url.pathname.endsWith('/heatmap'))
    return url.searchParams.get('direction') === 'outgoing'
      ? heatOutgoing
      : heatIncoming
  if (url.pathname.endsWith('/analytics/trends')) return analyticsTrends
  if (url.pathname.endsWith('/datasets')) return catalog
  if (url.pathname.endsWith('/geographies'))
    return url.searchParams.get('mode') === 'us' ? usLocations : globalLocations
  if (Number(url.searchParams.get('min_value')) >= 1e12) return emptyPage
  if (url.searchParams.get('dataset_id') === 'irs_state_2223') return irsPage
  if (url.searchParams.get('mode') === 'us') return censusPage
  return url.searchParams.get('year') === '2020' ? olderPage : globalPage
}
const fetcher = vi.fn(
  async (input: string | URL | Request) =>
    ({
      ok: true,
      json: async () => responseFor(input),
    }) as Response,
)

beforeEach(() => {
  fetcher.mockClear()
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => vi.unstubAllGlobals())
const navigation = () =>
  within(screen.getByRole('navigation', { name: 'Migration mode' }))

describe('HumanFlow interactive exploration', () => {
  it('reports heatmap API failure and retries without substituting corridor statistics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/heatmap?')
          ? ({ ok: false, status: 503 } as Response)
          : fetcher(input),
      ),
    )
    render(<App />)
    await screen.findByText('corridors on screen')
    await userEvent.click(screen.getByRole('button', { name: 'Heatmap' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503')
    expect(screen.getByText('corridors on screen')).not.toBeVisible()
    vi.stubGlobal('fetch', fetcher)
    await userEvent.click(screen.getByRole('button', { name: 'Retry heatmap' }))
    await screen.findByText(/View geographic values/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('switches arcs and geographic heatmap with shared source/year and direction controls', async () => {
    render(<App />)
    await screen.findByText('corridors on screen')
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes('/heatmap?')),
    ).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Heatmap' }))
    await screen.findByText(/View geographic values/)
    expect(
      screen.getByRole('heading', { name: 'Migration heatmap' }),
    ).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Heatmap direction'),
      'outgoing',
    )
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) =>
          String(url).includes('direction=outgoing'),
        ),
      ).toBe(true),
    )
    fireEvent.change(screen.getByLabelText('Heatmap opacity'), {
      target: { value: '30' },
    })
    expect(screen.getByLabelText('Heatmap opacity')).toHaveValue('30')
    await userEvent.click(screen.getByRole('button', { name: 'Arcs' }))
    expect(
      screen.queryByRole('heading', { name: 'Migration heatmap' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('corridors on screen')).toBeVisible()
  })

  it('loads analytics only on demand and restores focus when dismissed', async () => {
    render(<App />)
    await screen.findByText('corridors on screen')
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes('/analytics/')),
    ).toBe(false)
    const launcher = screen.getByRole('button', { name: 'Analytics' })
    await userEvent.click(launcher)
    expect(
      await screen.findByRole('region', { name: 'Migration analytics' }),
    ).toBeInTheDocument()
    await screen.findByText('Analytics chart loaded')
    await userEvent.click(
      screen.getByRole('button', { name: 'Close analytics' }),
    )
    expect(
      screen.queryByRole('region', { name: 'Migration analytics' }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(launcher).toHaveFocus())
  })

  it('renders real stock values and opens route provenance from the globe', async () => {
    render(<App />)
    expect(await screen.findByText('corridors on screen')).toBeInTheDocument()
    await screen.findByRole('button', {
      name: `Select 3D corridor ${globalPage.items[0].origin.name}`,
    })
    expect(screen.getByText('Stocks, not annual flows')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', {
        name: `Select 3D corridor ${globalPage.items[0].origin.name}`,
      }),
    )
    expect(
      screen.getByRole('heading', { name: 'Connection detail' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(globalPage.items[0].value.toLocaleString('en-US')),
    ).toBeInTheDocument()
    expect(screen.getByText(globalPage.dataset.caveat)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /View official source/ }),
    ).toHaveAttribute('href', globalPage.dataset.source_url)
  })

  it('switches to US Census and then IRS without mixing measures or periods', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByLabelText('Data source')).not.toBeDisabled(),
    )
    await userEvent.click(
      navigation().getByRole('button', { name: /United States/ }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Data source')).toHaveValue(
        'census_acs_2024',
      ),
    )
    expect(
      await screen.findByText(/255 values unavailable/),
    ).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Data source'),
      'irs_state_2223',
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Observation measure')).toHaveValue(
        'tax_individuals',
      ),
    )
    expect(
      await screen.findByText('2022 → 2023 · filing years'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Stocks, not annual flows'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2022–2023' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('sends explicit geographic filters and only supported reference years', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByLabelText('Origin')).not.toBeDisabled(),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Origin'),
      'country:356',
    )
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) =>
          String(url).includes('origin_id=country%3A356'),
        ),
      ).toBe(true),
    )
    await userEvent.click(screen.getByRole('button', { name: '2020' }))
    expect(await screen.findByText('2020 · mid-year stock')).toBeInTheDocument()
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes('year=2020')),
    ).toBe(true)
  })

  it('shows a genuine empty result and allows filter reset', async () => {
    render(<App />)
    await screen.findByText('corridors on screen')
    const input = screen.getByLabelText('Minimum observation value')
    await userEvent.clear(input)
    await userEvent.type(input, '1000000000000')
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply minimum value' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'No connections match' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'No connections match' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('offers an error state and retry without inventing fallback data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    )
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Data is temporarily unavailable',
    )
    expect(
      screen.queryByRole('button', { name: /Select 3D corridor/ }),
    ).not.toBeInTheDocument()
    vi.stubGlobal('fetch', fetcher)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
  })

  it('bounds low-power requests and stops automatic motion', async () => {
    render(<App />)
    await screen.findByText('corridors on screen')
    await userEvent.click(screen.getByRole('button', { name: 'Low power' }))
    expect(screen.getByRole('button', { name: 'Motion paused' })).toBeDisabled()
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) => String(url).includes('limit=24')),
      ).toBe(true),
    )
  })

  it('discards an old global response after switching to US mode', async () => {
    let finish: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input.includes('/corridors') && input.includes('mode=global')) {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return fetcher(input)
      }),
    )
    render(<App />)
    await waitFor(() => expect(finish).toBeDefined())
    await userEvent.click(
      navigation().getByRole('button', { name: /United States/ }),
    )
    await screen.findByText(/255 values unavailable/)
    await act(async () =>
      finish?.({ ok: true, json: async () => globalPage } as Response),
    )
    expect(
      screen.queryByText('Stocks, not annual flows'),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/255 values unavailable/)).toBeInTheDocument()
  })
})
