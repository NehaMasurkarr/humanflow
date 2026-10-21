import { expect, test, type Page } from '@playwright/test'

async function filters(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: /Filters/ }).click()
}
async function closeFilters(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Close filters' }).click()
}

test('renders real Earth, supports sources and filters, and has no console errors', async ({
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
  await expect(page.locator('.data-status')).toHaveCount(0)
  await expect(page.locator('.overview-stat strong')).toHaveText(
    isMobile ? '32' : '48',
  )
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Migration mode' })
    .getByRole('button', { name: 'United States' })
    .click()
  await expect(page.getByText(/255 values unavailable/)).toHaveCount(1)
  await filters(page, isMobile)
  await page.getByLabel('Data source').selectOption('irs_state_2223')
  await expect(page.locator('.timeline')).toContainText(
    '2022 → 2023 · filing years',
  )
  const response = page.waitForResponse(
    (r) =>
      r.url().includes('/corridors') &&
      r.url().includes('origin_id=state%3A06'),
  )
  await page.getByLabel('Origin', { exact: true }).selectOption('state:06')
  const data = await (await response).json()
  expect(data.items.length).toBeGreaterThan(0)
  expect(
    data.items.every(
      (r: { origin: { id: string } }) => r.origin.id === 'state:06',
    ),
  ).toBe(true)
  await closeFilters(page, isMobile)
  if (isMobile) await page.getByRole('button', { name: /Corridors/ }).click()
  await page.locator('.route-list button').first().click()
  await expect(
    page.getByRole('heading', { name: 'Connection detail' }),
  ).toBeVisible()
  await expect(page.locator('.detail-unit')).toContainText(
    'covered individuals',
  )
  await expect(
    page.getByRole('link', { name: /View official source/ }),
  ).toHaveAttribute('href', /irs.gov/)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false)
  expect(errors).toEqual([])
})

test('empty results are honest and filters can be reset', async ({
  page,
  isMobile,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.locator('.globe-viewport')).toHaveAttribute(
    'data-ready',
    'true',
  )
  await filters(page, isMobile)
  await page.getByLabel('Minimum observation value').fill('1000000000000')
  await page.getByRole('button', { name: 'Apply minimum value' }).click()
  await closeFilters(page, isMobile)
  await expect(
    page.getByRole('heading', { name: 'No connections match' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'No connections match' }),
  ).toHaveCount(0)
  await expect(page.locator('.overview-stat strong')).toHaveText(
    isMobile ? '32' : '48',
  )
})

test('camera responds to drag and zoom', async ({ page, isMobile }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.locator('.globe-viewport')).toHaveAttribute(
    'data-ready',
    'true',
  )
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  const canvas = page.locator('canvas')
  const before = await canvas.screenshot()
  if (isMobile) {
    const session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 180, y: 450, id: 0 }],
    })
    for (let step = 1; step <= 8; step++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 180 + step * 8, y: 450 + step * 3, id: 0 }],
      })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 145, y: 450, id: 0 },
        { x: 245, y: 450, id: 1 },
      ],
    })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 125, y: 450, id: 0 },
        { x: 265, y: 450, id: 1 },
      ],
    })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
  } else {
    await page.mouse.move(720, 450)
    await page.mouse.down()
    await page.mouse.move(850, 500, { steps: 12 })
    await page.mouse.up()
    await page.mouse.wheel(0, 180)
  }
  await page.waitForTimeout(1200)
  expect((await canvas.screenshot()).equals(before)).toBe(false)
})
