import { describe, expect, it } from 'vitest'
import globalRaw from '../../public/boundaries/global.geojson?raw'
import usRaw from '../../public/boundaries/us.geojson?raw'
import anchors from '../../../backend/assets/geographic-anchors.json'
import {
  heatColor,
  intensity,
  legendValue,
  pickPolygon,
  preparePolygons,
} from './geography'
import type { Boundaries, Boundary } from './types'

describe('verified geographic heatmap outlines', () => {
  it('matches real Census state internal points to verified FIPS polygons', () => {
    const polygons = preparePolygons((JSON.parse(usRaw) as Boundaries).features)
    for (const anchor of anchors.filter((point) =>
      point.id.startsWith('state:'),
    )) {
      expect(
        pickPolygon(polygons, anchor.longitude, anchor.latitude)?.id,
        anchor.id,
      ).toBe(anchor.id)
    }
  })
  it('matches country visualization anchors and keeps France and French Guiana separate', () => {
    const boundaries = JSON.parse(globalRaw) as Boundaries
    expect(
      boundaries.features.find((feature) => feature.id === 'country:254'),
    ).toBeDefined()
    const polygons = preparePolygons(boundaries.features)
    for (const id of [
      'country:250',

      'country:356',
      'country:840',
      'country:036',
      'country:554',
      'country:242',
    ]) {
      const anchor = anchors.find((point) => point.id === id)!
      expect(
        pickPolygon(polygons, anchor.longitude, anchor.latitude)?.id,
        id,
      ).toBe(id)
    }
  })
  it('handles polygon holes and an antimeridian crossing without filling the rest of Earth', () => {
    const polygon: Boundary = {
      type: 'Feature',
      id: 'geometry-test',
      properties: { name: 'Geometry only (no migration observations)' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [170, -10],
              [-170, -10],
              [-170, 10],
              [170, 10],
              [170, -10],
            ],
            [
              [175, -5],
              [-175, -5],
              [-175, 5],
              [175, 5],
              [175, -5],
            ],
          ],
        ],
      },
    }
    const prepared = preparePolygons([polygon])
    expect(pickPolygon(prepared, 172, 0)?.id).toBe(polygon.id)
    expect(pickPolygon(prepared, -172, 0)?.id).toBe(polygon.id)
    expect(pickPolygon(prepared, 179, 0)).toBeNull()
    expect(pickPolygon(prepared, 0, 0)).toBeNull()
  })
  it('uses an invertible numeric log scale, distinguishing observed zero from unavailable', () => {
    expect(intensity(0, 1000000)).toBe(0)
    expect(intensity(1000000, 1000000)).toBe(1)
    expect(legendValue(intensity(500, 1000000) * 100, 1000000)).toBeCloseTo(500)
    expect(heatColor(0, 1000000)).not.toBe('#738295')
    expect(heatColor(0, 0)).toBe('rgb(40,114,177)')
  })
})
