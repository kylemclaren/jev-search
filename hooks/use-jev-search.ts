"use client"

import * as React from "react"
import type { SearchEvent, SearchHit } from "@/lib/jev-search"

export type SearchPhase = "idle" | "lexical" | "judging" | "done" | "error"

export interface UseJevSearchOptions {
  /** Route that serves createJevSearchHandler. Default "/api/jev-search". */
  endpoint?: string
  /** Debounce in ms before hitting the endpoint. Lexical results are cached so 0 feels fine. Default 60. */
  debounceMs?: number
  minLength?: number
}

export interface JevSearchState {
  query: string
  setQuery: (q: string) => void
  hits: SearchHit[]
  phase: SearchPhase
  /** True once the visible hits are Jev-ranked (not just lexical). */
  judged: boolean
  lexicalMs?: number
  jevMs?: number
  judgedCount?: number
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
  const { endpoint = "/api/jev-search", debounceMs = 60, minLength = 1 } = options
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
        const apply = (line: string) => {
          if (!line.trim()) return
          const ev = JSON.parse(line) as SearchEvent
          if (ev.type === "lexical") {
            current.lexical = ev
            setPhase("judging")
          } else if (ev.type === "jev") {
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
            apply(buffer.slice(0, nl))
            buffer = buffer.slice(nl + 1)
          }
        }
        if (buffer.trim()) apply(buffer)
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
  }, [query, endpoint, debounceMs, minLength])

  const hits = entry.jev?.hits ?? entry.lexical?.hits ?? []
  return {
    query,
    setQuery,
    hits,
    phase,
    judged: Boolean(entry.jev),
    lexicalMs: entry.lexical?.tookMs,
    jevMs: entry.jev?.tookMs,
    judgedCount: entry.jev?.judged,
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
