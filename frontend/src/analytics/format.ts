import { formatNumber } from '../lib/api'

export const compact = (value: number) =>
  Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
export const displayValue = (value: number | null | undefined) =>
  value == null ? 'Unavailable' : formatNumber(value)
