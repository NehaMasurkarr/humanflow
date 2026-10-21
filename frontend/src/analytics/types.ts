import type { Dataset, Measure, Mode, Period } from '../lib/types'

export type AnalysisKind =
  | 'trends'
  | 'corridors'
  | 'rankings'
  | 'comparisons'
  | 'distribution'
  | 'net'
  | 'economics'
export type Tab = 'trends' | 'rankings' | 'comparisons' | 'economics'
export interface Indicator {
  code: string
  name: string
  unit: string
  years: number[]
  provider: string
  source_url: string
  license: string
  source_sha256: string
  dataset_id: string
  batch_id: string
}
export interface AnalyticsRow {
  label: string
  value: number | null
  observed: number
  unavailable: number
  dataset_id: string
  year_start: number
  year_end: number
  geography_id: string | null
  origin_id: string | null
  destination_id: string | null
  incoming: number | null
  outgoing: number | null
  economic_value: number | null
  economic_status: string | null
  economic_source_row: string | null
  moe: number | null
  source_row: string | null
}
export interface AnalyticsFilters {
  mode: Mode
  dataset_id: string
  year: number
  measure: string
  origin_id?: string | null
  destination_id?: string | null
  min_value: number
  side: 'origin' | 'destination'
  geography_ids: string[]
  indicator: string
  limit: number
  offset: number
}
export interface AnalyticsPage {
  kind: AnalysisKind
  dataset: Dataset
  sources: Dataset[]
  period: Period
  measure: Measure
  indicator: Indicator | null
  items: AnalyticsRow[]
  total: number
  limit: number
  offset: number
  observed: number
  unavailable: number
  note: string
  filters: AnalyticsFilters
}
