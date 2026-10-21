import type { Boundary, Point } from './types'

export interface PreparedPolygon {
  id: string
  name: string
  rings: Point[][]
  bounds: [number, number, number, number]
}

/** Unwrap seams for polygon fills/picking; never interpolate migration observations. */
export function preparePolygons(features: Boundary[]): PreparedPolygon[] {
  const result: PreparedPolygon[] = []
  for (const feature of features)
    for (const polygon of feature.geometry.coordinates) {
      const rings: Point[][] = []
      let outerCenter = 0
      polygon.forEach((ring, index) => {
        const points: Point[] = []
        for (const [lon, lat] of ring) {
          let x = (lon + 180) / 360
          if (points.length) x += Math.round(points.at(-1)![0] - x)
          points.push([x, (90 - lat) / 180])
        }
        const center =
          points.reduce((sum, point) => sum + point[0], 0) / points.length
        if (index === 0) outerCenter = center
        else
          points.forEach((point) => {
            point[0] += Math.round(outerCenter - center)
          })
        rings.push(points)
      })
      const outer = rings[0]
      result.push({
        id: feature.id,
        name: feature.properties.name,
        rings,
        bounds: [
          Math.min(...outer.map((point) => point[0])),
          Math.min(...outer.map((point) => point[1])),
          Math.max(...outer.map((point) => point[0])),
          Math.max(...outer.map((point) => point[1])),
        ],
      })
    }
  return result
}
function insideRing(x: number, y: number, ring: Point[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}
export function pickPolygon(
  polygons: PreparedPolygon[],
  longitude: number,
  latitude: number,
) {
  const x = (longitude + 180) / 360,
    y = (90 - latitude) / 180
  for (const polygon of polygons) {
    const [minX, minY, maxX, maxY] = polygon.bounds
    if (y < minY || y > maxY) continue
    const shifted = x + Math.round((minX + maxX) / 2 - x)
    if (shifted < minX || shifted > maxX) continue
    if (
      insideRing(shifted, y, polygon.rings[0]) &&
      !polygon.rings.slice(1).some((ring) => insideRing(shifted, y, ring))
    )
      return polygon
  }
  return null
}
export function intensity(value: number, maximum: number) {
  return maximum > 0 ? Math.log1p(Math.max(0, value)) / Math.log1p(maximum) : 0
}
export function legendValue(percent: number, maximum: number) {
  return Math.expm1((Math.log1p(maximum) * percent) / 100)
}
export function heatColor(value: number, maximum: number) {
  const t = intensity(value, maximum)
  // Muted electric blue → cyan → gold, using the approved palette.
  const stops = [
    [40, 114, 177],
    [91, 192, 226],
    [224, 187, 108],
  ]
  const i = t < 0.5 ? 0 : 1,
    f = t < 0.5 ? t * 2 : (t - 0.5) * 2
  return `rgb(${stops[i].map((v, channel) => Math.round(v + (stops[i + 1][channel] - v) * f)).join(',')})`
}
