import type { Dataset, Measure, Period } from '../lib/types'
export type ViewLayer = 'arcs' | 'heatmap'
export type Direction = 'incoming' | 'outgoing'
export interface HeatmapValue {
  id: string
  name: string
  code: string
  iso3: string | null
  value: number | null
  status:
    'reported' | 'partial' | 'unavailable' | 'not_published' | 'filtered_out'
  observed: number
  included: number
  missing: number
  suppressed: number
  below_threshold: number
  published: number
  has_boundary: boolean
}
export interface HeatmapPage {
  dataset: Dataset
  period: Period
  measure: Measure
  direction: Direction
  items: HeatmapValue[]
  max_value: number
  scale: 'log1p'
  boundary_asset: string
  boundary_sha256: string
  boundary_source_url: string
  boundary_license: string
  unmatched_geographies: string[]
  note: string
}
export type Point = [number, number]
export interface Boundary {
  type: 'Feature'
  id: string
  properties: { name: string }
  geometry: { type: 'MultiPolygon'; coordinates: Point[][][] }
}
export interface Boundaries {
  type: 'FeatureCollection'
  features: Boundary[]
}
export interface HeatmapLayerState {
  page: HeatmapPage
  boundaries: Boundaries
  active: boolean
  opacity: number
  cutoff: number
  showUnavailable: boolean
}
export interface GeographicHover {
  id: string
  name: string
  x: number
  y: number
}
