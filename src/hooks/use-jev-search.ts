"use client"

import * as React from "react"
import type { SearchEvent, SearchHit } from "@/lib/jev-search-core"

export type SearchPhase = "idle" | "lexical" | "judging" | "done" | "error"

export interface UseJevSearchOptions {
  /** Route that serves createJevSearchHandler. Default "/api/jev-search". */
  endpoint?: string
  /** Debounce in ms before hitting the endpoint. Lexical results are cached so 0 feels fine. Default 60. */
  debounceMs?: number
  minLength?: number
  /** Keep the keyword list on screen at least this long before swapping in
   *  Jev's ranking, so a fast or cached answer does not flash past. Default 200. */
  minDwellMs?: number
}

export interface JevSearchState {
  query: string
  setQuery: (q: string) => void
  hits: SearchHit[]
  /** The keyword pass on its own, before Jev spoke. Handy for before/after views. */
  lexicalHits: SearchHit[]
  /** The re-ranked list, or undefined until Jev answers. */
  jevHits?: SearchHit[]
  /** Judged but below threshold, ranked. Render these dimmed so the list
   *  does not collapse when the refined answer lands. */
  demoted: SearchHit[]
  phase: SearchPhase
  /** True once the visible hits are Jev-ranked (not just lexical). */
  judged: boolean
  lexicalMs?: number
  jevMs?: number
  judgedCount?: number
  /** Input tokens billed for this query. */
  inputTokens?: number
  answerable?: number
  model?: string
  cached?: boolean
  error?: string
  reset: () => void
}

interface Entry {
  lexical?: Extract<SearchEvent, { type: "lexical" }>
  jev?: Extract<SearchEvent, { type: "jev" }>
  error?: string
}

export function useJevSearch(options: UseJevSearchOptions = {}): JevSearchState {
  const { endpoint = "/api/jev-search", debounceMs = 60, minLength = 1, minDwellMs = 200 } = options
  const [query, setQuery] = React.useState("")
  const [entry, setEntry] = React.useState<Entry>({})
  const [phase, setPhase] = React.useState<SearchPhase>("idle")
  const cache = React.useRef(new Map<string, Entry>())
  const controller = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const q = query.trim()
    controller.current?.abort()
    if (q.length < minLength) {
      setEntry({})
      setPhase("idle")
      return
    }
    const key = q.toLowerCase()
    const hit = cache.current.get(key)
    if (hit?.jev) {
      setEntry(hit)
      setPhase("done")
      return
    }
    if (hit?.lexical) {
      setEntry(hit)
      setPhase("judging")
    }

    const ac = new AbortController()
    controller.current = ac
    const timer = setTimeout(async () => {
      const url = `${endpoint}?q=${encodeURIComponent(q)}`
      try {
        const res = await fetch(url, { signal: ac.signal })
        if (!res.ok || !res.body) throw new Error(`search endpoint responded ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        const current: Entry = { ...(cache.current.get(key) ?? {}) }
        let shownAt = 0
        const apply = async (line: string) => {
          if (!line.trim()) return
          const ev = JSON.parse(line) as SearchEvent
          if (ev.type === "lexical") {
            current.lexical = ev
            shownAt = performance.now()
            setPhase("judging")
          } else if (ev.type === "jev") {
            const held = minDwellMs - (performance.now() - shownAt)
            if (held > 0) await new Promise((r) => setTimeout(r, held))
            if (ac.signal.aborted) return
            current.jev = ev
            setPhase("done")
          } else {
            current.error = ev.message
            setPhase("error")
          }
          cache.current.set(key, { ...current })
          if (!ac.signal.aborted) setEntry({ ...current })
        }
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buffer.indexOf("\n")) >= 0) {
            await apply(buffer.slice(0, nl))
            buffer = buffer.slice(nl + 1)
          }
        }
        if (buffer.trim()) await apply(buffer)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setEntry((e) => ({ ...e, error: (err as Error).message }))
        setPhase("error")
      }
    }, debounceMs)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [query, endpoint, debounceMs, minLength, minDwellMs])

  const hits = entry.jev?.hits ?? entry.lexical?.hits ?? []
  return {
    query,
    setQuery,
    hits,
    lexicalHits: entry.lexical?.hits ?? [],
    jevHits: entry.jev?.hits,
    demoted: entry.jev?.demoted ?? [],
    phase,
    judged: Boolean(entry.jev),
    lexicalMs: entry.lexical?.tookMs,
    jevMs: entry.jev?.tookMs,
    judgedCount: entry.jev?.judged,
    inputTokens: entry.jev?.inputTokens,
    answerable: entry.jev?.answerable,
    model: entry.jev?.model,
    cached: entry.jev?.cached,
    error: entry.error,
    reset: () => {
      setQuery("")
      setEntry({})
      setPhase("idle")
    },
  }
}
