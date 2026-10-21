import { useEffect, useState } from 'react'

export function useResource<T>(url: string | null, revision = 0) {
  const key = `${url}:${revision}`
  const [result, setResult] = useState<{
    key: string
    data: T | null
    error: string | null
  } | null>(null)
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(url!, { signal: controller.signal })
        if (!response.ok)
          throw new Error(
            `Migration data could not be loaded (HTTP ${response.status}).`,
          )
        const data: T = await response.json()
        if (!controller.signal.aborted) setResult({ key, data, error: null })
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : 'Migration data could not be loaded.',
          })
      }
    }
    void load()
    return () => controller.abort()
  }, [url, key])
  const current = result?.key === key ? result : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: !!url && !current,
  }
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

export const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US').format(value)
export const unitLabel = (unit: string) =>
  ({
    persons: 'people',
    returns: 'tax returns',
    covered_individuals: 'covered individuals',
  })[unit] ?? unit.replaceAll('_', ' ')
