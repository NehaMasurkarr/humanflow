import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  anchorToVector,
  CorridorCurve,
  EARTH_RADIUS,
  magnitudeScale,
} from './geometry'
import page from '../test/fixtures/global-2024.json'

describe('geographic placement and route direction', () => {
  it('matches equirectangular cardinal coordinates without mirroring east/west', () => {
    expect(
      anchorToVector({ latitude: 0, longitude: 0 }).distanceTo(
        new Vector3(2, 0, 0),
      ),
    ).toBeLessThan(1e-10)
    expect(
      anchorToVector({ latitude: 0, longitude: 90 }).distanceTo(
        new Vector3(0, 0, -2),
      ),
    ).toBeLessThan(1e-10)
    expect(
      anchorToVector({ latitude: 90, longitude: 0 }).distanceTo(
        new Vector3(0, 2, 0),
      ),
    ).toBeLessThan(1e-10)
  })
  it('starts at the real origin, ends at the real destination, and stays outside Earth', () => {
    const route = page.items[0]
    const curve = new CorridorCurve(
      route.origin.anchor,
      route.destination.anchor,
    )
    expect(
      curve
        .getPoint(0)
        .distanceTo(anchorToVector(route.origin.anchor, EARTH_RADIUS + 0.018)),
    ).toBeLessThan(1e-8)
    expect(
      curve
        .getPoint(1)
        .distanceTo(
          anchorToVector(route.destination.anchor, EARTH_RADIUS + 0.018),
        ),
    ).toBeLessThan(1e-8)
    for (let step = 0; step <= 100; step++)
      expect(curve.getPoint(step / 100).length()).toBeGreaterThan(EARTH_RADIUS)
  })
  it('handles identical and antipodal anchors without NaNs', () => {
    const origin = { ...page.items[0].origin.anchor, latitude: 0, longitude: 0 }
    for (const longitude of [0, 180]) {
      const curve = new CorridorCurve(origin, { ...origin, longitude })
      for (const t of [0, 0.5, 1])
        expect(curve.getPoint(t).toArray().every(Number.isFinite)).toBe(true)
    }
  })
  it('scales magnitude monotonically and handles an empty range', () => {
    expect(magnitudeScale(100, 1000)).toBeLessThan(magnitudeScale(1000, 1000))
    expect(magnitudeScale(0, 0)).toBe(0)
  })
})
