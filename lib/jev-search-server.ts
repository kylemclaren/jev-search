/**
 * jev-search — server side.
 *
 * Runs the lexical first pass over your index, then asks TypeSafe's Jev model
 * to judge the top candidates against the query. Jev returns a calibrated
 * relevance for every candidate in one request, so a query costs one round
 * trip and a few hundred input tokens.
 *
 * Works anywhere the Fetch API exists: Next.js route handlers, Remix, Hono,
 * Bun, Deno, Cloudflare Workers.
 */
import { buildIndex, lexicalSearch, type LexicalIndex, type SearchDocument, type SearchEvent, type SearchHit } from "./jev-search-core"

export interface JevSearchOptions {
  documents: SearchDocument[]
  /** Defaults to process.env.TYPESAFE_API_KEY. */
  apiKey?: string
  /** Defaults to process.env.TYPESAFE_API_URL or https://api.typesafe.ai/v1/systemone. */
  apiUrl?: string
  /** Defaults to "jev-latest". */
  model?: string
  /** How many lexical hits Jev judges. 8–16 is the sweet spot. Default 12. */
  candidates?: number
  /** Hits below this relevance are dropped once Jev has spoken. Default 0.15. */
  threshold?: number
  /** Characters of body text sent to Jev per candidate. Default 320. */
  excerptLength?: number
  /** Number of queries kept in the in-memory cache. Default 1000. */
  cacheSize?: number
  /** Abort the Jev call after this long and fall back to lexical order. Default 4000. */
  timeoutMs?: number
  /** Blend between Jev's per-page relevance and its "best answer" share. Default 0.75 (mostly relevance). */
  relevanceWeight?: number
}

export interface JevRanking {
  hits: SearchHit[]
  model: string
  judged: number
  answerable: number
  tookMs: number
  cached: boolean
}

interface TypeSafeAnswer {
  type: string
  noul?: number
  choice?: string
  probabilities?: Record<string, number>
  confidence?: number
}

interface TypeSafeResponse {
  model: string
  answers: Record<string, TypeSafeAnswer>
  usage?: { input_tokens: number; output_tokens: number }
}

class LRU<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}
  get(key: string): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }
  set(key: string, value: V) {
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }
}

export function createJevSearch(options: JevSearchOptions) {
  const {
    documents,
    model = "jev-latest",
    candidates: candidateCount = 12,
    threshold = 0.15,
    excerptLength = 320,
    cacheSize = 1000,
    timeoutMs = 4000,
    relevanceWeight = 0.75,
  } = options
  const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY
  const apiUrl = options.apiUrl ?? process.env.TYPESAFE_API_URL ?? "https://api.typesafe.ai/v1/systemone"

  const index: LexicalIndex = buildIndex(documents)
  const byId = new Map(documents.map((d) => [d.id, d]))
  const cache = new LRU<Omit<JevRanking, "cached">>(cacheSize)

  function normalize(query: string): string {
    return query.trim().replace(/\s+/g, " ").toLowerCase()
  }

  function lexical(query: string, limit = 20): SearchHit[] {
    return lexicalSearch(index, query, { limit })
  }

  async function judge(query: string, hits: SearchHit[]): Promise<JevRanking> {
    const key = `${model}\u0000${normalize(query)}`
    const cached = cache.get(key)
    if (cached) return { ...cached, cached: true }
    if (!apiKey) throw new Error("jev-search: TYPESAFE_API_KEY is not set")

    const started = performance.now()
    const cands = hits.slice(0, candidateCount)
    if (cands.length === 0) {
      return { hits: [], model, judged: 0, answerable: 0, tookMs: 0, cached: false }
    }

    const state = {
      query,
      candidates: cands.map((h, i) => {
        const doc = byId.get(h.id)
        return {
          id: `c${i + 1}`,
          section: h.section,
          title: h.title,
          description: h.description,
          excerpt: doc?.content?.slice(0, excerptLength),
        }
      }),
    }
    const criteria: Record<string, string> = {}
    const questions: Record<string, unknown> = {}
    cands.forEach((h, i) => {
      const id = `c${i + 1}`
      criteria[id] = `${h.title}${h.description ? ` — ${h.description}` : ""}`
      questions[id] = {
        type: "noul",
        instructions: `The user typed the search query above into a site search box. Is candidate ${id} ("${h.title}") a page they would be glad to land on for that query?`,
        criteria: {
          true: "The page answers, covers or is clearly about what the query is asking for",
          false: "The page is off-topic, or only shares a word or two with the query",
        },
      }
    })
    questions.best = {
      type: "choice",
      instructions: "Which candidate page best answers the user's search query?",
      criteria,
    }
    questions.answerable = {
      type: "noul",
      instructions: "Does at least one candidate page answer the user's search query?",
    }

    const payload = JSON.stringify({ state, model, questions })
    let body: TypeSafeResponse | undefined
    let lastError: Error | undefined
    // 401 and 422 are our fault; anything else gets two quick retries.
    for (let attempt = 0; attempt < 3 && !body; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 150 * attempt * attempt))
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: payload,
          signal: controller.signal,
        })
        if (res.ok) {
          body = (await res.json()) as TypeSafeResponse
        } else {
          const text = await res.text().catch(() => "")
          lastError = new Error(`jev-search: TypeSafe responded ${res.status} ${text.slice(0, 200)}`)
          if (res.status === 401 || res.status === 422) break
        }
      } catch (err) {
        lastError = err as Error
      } finally {
        clearTimeout(timer)
      }
    }
    if (!body) throw lastError ?? new Error("jev-search: TypeSafe call failed")
    const best = body.answers.best?.probabilities ?? {}

    const ranked: SearchHit[] = cands.map((h, i) => {
      const id = `c${i + 1}`
      const relevance = body.answers[id]?.noul ?? 0
      const probability = best[id] ?? 0
      return { ...h, relevance, probability }
    })
    const blended = (h: SearchHit) => relevanceWeight * (h.relevance ?? 0) + (1 - relevanceWeight) * (h.probability ?? 0)
    ranked.sort((a, b) => blended(b) - blended(a) || b.score - a.score)
    let kept = ranked.filter((h) => (h.relevance ?? 0) >= threshold)
    if (kept.length === 0) kept = ranked.slice(0, 3)

    const result = {
      hits: kept,
      model: body.model ?? model,
      judged: cands.length,
      answerable: body.answers.answerable?.noul ?? 0,
      tookMs: Math.round(performance.now() - started),
    }
    cache.set(key, result)
    return { ...result, cached: false }
  }

  /** Run both passes and return everything. Useful for tests and benchmarks. */
  async function search(query: string) {
    const t0 = performance.now()
    const lex = lexical(query)
    const lexicalMs = performance.now() - t0
    const jev = await judge(query, lex)
    return { lexical: lex, lexicalMs, jev }
  }

  /**
   * Fetch-API handler. GET /?q=term streams NDJSON: a `lexical` event as soon
   * as the first pass is done, then a `jev` event. Add `stream=0` to receive a
   * single JSON object with the final ranking instead.
   */
  async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const query = (url.searchParams.get("q") ?? "").slice(0, 200)
    const wantsStream = url.searchParams.get("stream") !== "0"
    const headers = { "Cache-Control": "no-store" }

    if (query.trim().length === 0) {
      return Response.json({ type: "lexical", query, hits: [], tookMs: 0 } satisfies SearchEvent, { headers })
    }

    if (!wantsStream) {
      try {
        const r = await search(query)
        const event: SearchEvent = { type: "jev", query, ...r.jev }
        return Response.json(event, { headers })
      } catch (err) {
        return Response.json({ type: "error", query, message: (err as Error).message } satisfies SearchEvent, { status: 502, headers })
      }
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: SearchEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"))
        const t0 = performance.now()
        const lex = lexical(query)
        send({ type: "lexical", query, hits: lex, tookMs: Math.round((performance.now() - t0) * 100) / 100 })
        try {
          const jev = await judge(query, lex)
          send({ type: "jev", query, ...jev })
        } catch (err) {
          send({ type: "error", query, message: (err as Error).message })
        }
        controller.close()
      },
    })
    return new Response(stream, {
      headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" },
    })
  }

  return { search, lexical, judge, handler, documents }
}

/** Convenience: just the request handler. */
export function createJevSearchHandler(options: JevSearchOptions) {
  return createJevSearch(options).handler
}
