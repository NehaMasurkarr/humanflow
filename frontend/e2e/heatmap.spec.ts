import { test, expect, type Page } from '@playwright/test'

async function filters(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: /Filters/ }).click()
}
async function closeFilters(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Close filters' }).click()
}
async function controls(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: /Corridors/ }).click()
}
async function closeControls(page: Page, mobile: boolean) {
  if (mobile)
    await page.getByRole('button', { name: 'Close corridors' }).click()
}

test('real geographic overlay supports legend, opacity, tooltips, and arc switching', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.locator('.globe-viewport')).toHaveAttribute(
    'data-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  await filters(page, isMobile)
  const response = page.waitForResponse((r) => r.url().includes('/v1/heatmap?'))
  await page.getByRole('button', { name: 'Heatmap', exact: true }).click()
  const data = await (await response).json()
  expect(
    data.items.some((row: { value: number | null }) => row.value !== null),
  ).toBe(true)
  await closeFilters(page, isMobile)
  await expect(page.locator('.globe-viewport')).toHaveAttribute(
    'data-layer',
    'heatmap',
  )
  await expect(page.locator('.globe-viewport')).toHaveAttribute(
    'data-heatmap-ready',
    'true',
  )
  await controls(page, isMobile)
  await page
    .getByRole('button', { name: 'Highlight at 50% of color scale' })
    .click()
  await expect(page.getByLabel('Heatmap legend threshold')).toHaveValue('50')
  await page
    .getByRole('button', { name: 'Highlight at 0% of color scale' })
    .click()
  await page.getByLabel('Heatmap opacity').fill('0')
  await closeControls(page, isMobile)
  await page.waitForTimeout(600) // Wait for the documented opacity transition, with globe motion paused.
  const transparent = await page.locator('.globe-viewport canvas').screenshot()
  await controls(page, isMobile)
  await page.getByLabel('Heatmap opacity').fill('65')
  await closeControls(page, isMobile)
  await page.waitForTimeout(600)
  const colored = await page.locator('.globe-viewport canvas').screenshot()
  expect(colored.equals(transparent)).toBe(false)
  // Exercise actual globe raycasting, not a mocked geographic tooltip.
  const canvas = await page.locator('.globe-viewport canvas').boundingBox()
  let found = false
  for (const y of [0.4, 0.55, 0.3, 0.65]) {
    for (const x of [0.58, 0.48, 0.65, 0.4, 0.7]) {
      const point = {
        x: canvas!.x + canvas!.width * x,
        y: canvas!.y + canvas!.height * y,
      }
      if (isMobile) await page.touchscreen.tap(point.x, point.y)
      else await page.mouse.move(point.x, point.y)
      if (await page.locator('.geographic-tooltip').isVisible()) {
        found = true
        break
      }
    }
    if (found) break
  }
  expect(found).toBe(true)
  await expect(page.locator('.geographic-tooltip')).toContainText(
    'mid-year stock',
  )
  await expect(page.locator('.geographic-tooltip')).toContainText(
    'not annual migration flows',
  )
  await expect(page.locator('.geographic-tooltip')).toContainText(
    'not population density',
  )
  await filters(page, isMobile)
  await page.getByRole('button', { name: 'Arcs', exact: true }).click()
  await closeFilters(page, isMobile)
  await expect(page.locator('.globe-viewport')).toHaveAttribute(
    'data-layer',
    'arcs',
  )
  expect(errors).toEqual([])
})

test('heatmap source, reference period, direction, and geographic filters remain compatible', async ({
  page,
  isMobile,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  // These assertions exercise filters, not automatic motion; keep software-WebGL work bounded.
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  await filters(page, isMobile)
  await page.getByRole('button', { name: 'Heatmap', exact: true }).click()
  await closeFilters(page, isMobile)
  await controls(page, isMobile)
  const outgoing = page.waitForResponse(
    (r) =>
      r.url().includes('/heatmap?') && r.url().includes('direction=outgoing'),
  )
  await page.getByLabel('Heatmap direction').selectOption('outgoing')
  expect((await (await outgoing).json()).direction).toBe('outgoing')
  await closeControls(page, isMobile)
  const historic = page.waitForResponse(
    (r) => r.url().includes('/heatmap?') && r.url().includes('year=2020'),
  )
  await page.getByRole('button', { name: '2020', exact: true }).click()
  expect((await (await historic).json()).period.year_end).toBe(2020)
  await page
    .getByRole('navigation', { name: 'Migration mode' })
    .getByRole('button', { name: 'United States' })
    .click()
  await filters(page, isMobile)
  const irs = page.waitForResponse(
    (r) =>
      r.url().includes('/heatmap?') &&
      r.url().includes('dataset_id=irs_state_2223'),
  )
  await page.getByLabel('Data source').selectOption('irs_state_2223')
  const irsData = await (await irs).json()
  expect(irsData.period.year_start).toBe(2022)
  expect(irsData.items).toHaveLength(51)
  const geographic = page.waitForResponse(
    (r) =>
      r.url().includes('/heatmap?') && r.url().includes('origin_id=state%3A06'),
  )
  await page.getByLabel('Origin', { exact: true }).selectOption('state:06')
  const selected = await (await geographic).json()
  expect(selected.filters.origin_id).toBe('state:06')
  expect(selected.dataset.id).toBe('irs_state_2223')
  expect(
    selected.items.every((row: { has_boundary: boolean }) => row.has_boundary),
  ).toBe(true)
  await closeFilters(page, isMobile)
  await controls(page, isMobile)
  await expect(
    page.getByText(/2022 → 2023 · filing years/).first(),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: /Show unavailable/ }).uncheck()
  await expect(
    page.getByRole('checkbox', { name: /Show unavailable/ }),
  ).not.toBeChecked()
})
