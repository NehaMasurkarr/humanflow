import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

async function openAnalytics(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: /Corridors/ }).click()
  await page.getByRole('button', { name: 'Analytics', exact: true }).click()
  const drawer = page.getByRole('region', { name: 'Migration analytics' })
  await expect(drawer).toBeVisible()
  return drawer
}

test('analytics charts, filters, tooltips, and complete CSV export use real API data', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(
    page.getByRole('region', { name: 'Migration analytics' }),
  ).toHaveCount(0)
  const drawer = await openAnalytics(page, isMobile)
  await expect(drawer.locator('.recharts-line')).toHaveCount(1)
  await expect(drawer.locator('.recharts-line-dots circle')).toHaveCount(8)
  await drawer.getByText(/View data table/).click()
  await expect(drawer.getByRole('table').getByRole('row')).toHaveCount(9)
  const downloadPromise = page.waitForEvent('download')
  await drawer.getByRole('button', { name: /Export filtered results/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('humanflow-trends-2024.csv')
  const path = await download.path()
  expect(path).not.toBeNull()
  const csv = await readFile(path!, 'utf8')
  expect(csv).toContain('source_sha256')
  expect(csv).toContain('mid-year stock')
  expect(csv).toContain('UN DESA')
  expect(csv.trim().split('\n')).toHaveLength(9)
  await drawer.getByRole('tab', { name: 'Rankings' }).click()
  await expect(drawer.locator('.recharts-bar-rectangle')).toHaveCount(10)
  await drawer
    .locator('.recharts-bar-rectangle')
    .first()
    .scrollIntoViewIfNeeded()
  if (isMobile) await drawer.locator('.recharts-bar-rectangle').first().tap()
  else await drawer.locator('.recharts-bar-rectangle').first().hover()
  await expect(drawer.locator('.analytics-tooltip')).toBeVisible()
  await expect(drawer.locator('.analytics-tooltip')).toContainText('stock')
  const next = page.waitForResponse(
    (response) =>
      response.url().includes('/analytics/corridors?') &&
      response.url().includes('offset=10'),
  )
  await drawer.getByRole('button', { name: 'Next analytics page' }).click()
  expect((await (await next).json()).offset).toBe(10)
  const distributionResponse = page.waitForResponse((response) =>
    response.url().includes('/analytics/distribution?'),
  )
  await drawer.getByLabel('Ranking type').selectOption('distribution')
  await expect(
    drawer.getByRole('heading', { name: 'Corridors by magnitude' }),
  ).toBeVisible()
  const distributionData = await (await distributionResponse).json()
  await expect(drawer.locator('.recharts-bar-rectangle')).toHaveCount(
    distributionData.items.length,
  )
  await drawer.getByRole('tab', { name: 'Comparisons' }).click()
  await expect(drawer.getByText(/Choose up to six/)).toBeVisible()
  await drawer
    .getByLabel('Add comparison geography')
    .selectOption('country:356')
  await drawer
    .getByLabel('Add comparison geography')
    .selectOption('country:840')
  await expect(drawer.locator('.recharts-bar-rectangle')).toHaveCount(2)
  await drawer.getByRole('tab', { name: 'Economics' }).click()
  await expect(drawer.locator('.recharts-scatter-symbol')).toHaveCount(2)
  await expect(drawer.getByText(/2 observed pairs/)).toContainText(
    'Correlation does not establish causation',
  )
  await drawer.getByLabel('Economic indicator').selectOption('SP.POP.TOTL')
  await expect(drawer.getByText(/X: Population/)).toBeVisible()
  await drawer.getByLabel('Analytics reporting period').selectOption('1990')
  await expect(
    drawer.getByText(/No .* observations at the exact 1990/),
  ).toBeVisible()
  const bounds = await drawer.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await drawer.getByRole('button', { name: 'Close analytics' }).click()
  await expect(drawer).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Analytics', exact: true }),
  ).toBeFocused()
  expect(errors).toEqual([])
})

test('globe route selection, mode switching, ACS net coverage and state economics stay consistent', async ({
  page,
  isMobile,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  if (isMobile) await page.getByRole('button', { name: /Corridors/ }).click()
  await page.locator('.route-list button').first().click()
  const drawer = await openAnalytics(page, false)
  await expect(
    drawer.getByRole('checkbox', { name: /Follow selected corridor/ }),
  ).toBeChecked()
  await expect(drawer.locator('.recharts-line-dots circle')).toHaveCount(8)
  await page
    .getByRole('navigation', { name: 'Migration mode' })
    .getByRole('button', { name: 'United States' })
    .click()
  await expect(drawer.getByLabel('Analytics reporting period')).toHaveValue(
    '2024',
  )
  await expect(drawer.getByRole('tab', { name: 'Trends' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(drawer.locator('.analytics-context')).toContainText('Census ACS')
  await drawer.getByRole('tab', { name: 'Comparisons' }).click()
  await drawer.getByLabel('Comparison type').selectOption('net')
  await expect(drawer.locator('.recharts-bar-rectangle')).toHaveCount(3)
  await expect(drawer.getByText(/Only states with all 100/)).toBeVisible()
  // ACS 2023 is a separate source release, selected through the existing globe source control.
  await drawer.getByRole('tab', { name: 'Economics' }).click()
  await expect(drawer.getByText(/No US state economic dataset/)).toBeVisible()
  await expect(drawer.locator('.recharts-scatter')).toHaveCount(0)
  await drawer.getByRole('button', { name: 'Close analytics' }).click()
})
