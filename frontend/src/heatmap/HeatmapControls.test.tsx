import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import HeatmapControls from './HeatmapControls'
import HeatmapSummary, { GeographicDetail } from './HeatmapSummary'
import response from '../test/fixtures/heatmap/global-incoming.json'
import filtered from '../test/fixtures/heatmap/filtered.json'
import type { HeatmapPage } from './types'

const page = response as unknown as HeatmapPage

describe('heatmap interpretation and controls', () => {
  it('does not present an empty intensity domain as observed zero migration', () => {
    render(
      <HeatmapControls
        page={filtered as unknown as HeatmapPage}
        direction="incoming"
        onDirection={vi.fn()}
        opacity={0.48}
        onOpacity={vi.fn()}
        highlight={0}
        onHighlight={vi.fn()}
        showUnavailable
        onShowUnavailable={vi.fn()}
      />,
    )
    expect(
      screen.getByText('No reported values for intensity scaling.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Heatmap legend threshold')).toBeDisabled()
    expect(
      screen.queryByText('All reported values are zero.'),
    ).not.toBeInTheDocument()
  })

  it('exposes direction, opacity, legend highlight, and unavailable-data controls', async () => {
    const direction = vi.fn(),
      opacity = vi.fn(),
      highlight = vi.fn(),
      unavailable = vi.fn()
    render(
      <HeatmapControls
        page={page}
        direction="incoming"
        onDirection={direction}
        opacity={0.48}
        onOpacity={opacity}
        highlight={0}
        onHighlight={highlight}
        showUnavailable
        onShowUnavailable={unavailable}
      />,
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Heatmap direction'),
      'outgoing',
    )
    expect(direction).toHaveBeenCalledWith('outgoing')
    fireEvent.change(screen.getByLabelText('Heatmap opacity'), {
      target: { value: '35' },
    })
    expect(opacity).toHaveBeenCalledWith(0.35)
    await userEvent.click(
      screen.getByRole('button', { name: 'Highlight at 50% of color scale' }),
    )
    expect(highlight).toHaveBeenCalledWith(50)
    fireEvent.change(screen.getByLabelText('Heatmap legend threshold'), {
      target: { value: '75' },
    })
    expect(highlight).toHaveBeenCalledWith(75)
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Show unavailable/ }),
    )
    expect(unavailable).toHaveBeenCalledWith(false)
    expect(screen.getByText(/Zero is blue/)).toBeInTheDocument()
    expect(screen.getByText(/Logarithmic color scale/)).toBeInTheDocument()
  })
  it('keeps unavailable geographic values distinct and exposes source, period and units', () => {
    const missing = page.items.find((row) => row.value === null)!
    render(<GeographicDetail row={missing} page={page} />)
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText(/not published/)).toBeInTheDocument()
    expect(screen.getByText(page.period.label)).toBeInTheDocument()
    expect(screen.getByText(page.dataset.caveat)).toBeInTheDocument()
  })
  it('makes all geographic values including unmatched boundaries accessible without WebGL', async () => {
    const select = vi.fn()
    render(<HeatmapSummary page={page} onSelect={select} />)
    await userEvent.click(screen.getByText(/View geographic values/))
    await userEvent.click(screen.getByRole('button', { name: 'Gibraltar' }))
    expect(select).toHaveBeenCalledWith('country:292')
    expect(screen.getByText(/no outline/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Boundary source/ }),
    ).toHaveAttribute('href', page.boundary_source_url)
  })
})
