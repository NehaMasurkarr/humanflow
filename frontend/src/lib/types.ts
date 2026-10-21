export type Mode = 'global' | 'us'
export interface Anchor {
  latitude: number
  longitude: number
  method: string
  source_url: string
  source_sha256: string
}
export interface Geography {
  id: string
  name: string
  level: 'country' | 'state'
  code: string
  iso3: string | null
  anchor: Anchor | null
}
export interface Period {
  year_start: number
  year_end: number
  label: string
}
export interface Measure {
  id: string
  label: string
  unit: string
}
export interface Dataset {
  id: string
  mode: Mode
  name: string
  provider: string
  observation_type: 'stock' | 'flow'
  definition: string
  scope: string
  period_type: string
  periods: Period[]
  measures: Measure[]
  source_url: string
  license: string
  caveat: string
  batch_id: string
  source_sha256: string
}
export interface Corridor {
  id: string
  origin: Geography
  destination: Geography
  value: number
  unit: string
  measure: string
  year_start: number
  year_end: number
  moe: number | null
  source_row: string
}
export interface CorridorPage {
  items: Corridor[]
  dataset: Dataset
  period: Period
  measure: Measure
  total: number
  matching_observations: number
  excluded_without_anchors: number
  unavailable_in_period: number
  limit: number
  offset: number
  max_value: number | null
  anchor_disclaimer: string
}
export interface GeographyPage {
  items: Geography[]
  total: number
  limit: number
  offset: number
}
