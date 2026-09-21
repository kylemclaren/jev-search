/**
 * jev-search benchmark.
 *
 *   TYPESAFE_API_KEY=… bun run bench/run.ts
 *
 * Every system indexes the same corpus (lib/jev-search-index.json) and
 * answers the same labelled queries (bench/queries.json). We report
 * Hit@1, Hit@3, MRR@10 and per-query latency. Results land in
 * bench/results.json, which the website and README read.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import MiniSearch from "minisearch"
import Fuse from "fuse.js"
import FlexSearch from "flexsearch"
import lunr from "lunr"
import * as pagefind from "pagefind"
import { create as oramaCreate, insertMultiple as oramaInsert, search as oramaSearch } from "@orama/orama"
import { buildIndex, lexicalSearch, type SearchDocument } from "../src/lib/jev-search-core"
import { createJevSearch } from "../src/lib/jev-search-server"

type Query = { kind: "keyword" | "typo" | "intent"; query: string; expect: string[] }
const docs = JSON.parse(readFileSync(new URL("../src/lib/jev-search-index.json", import.meta.url), "utf8")) as SearchDocument[]
const queries = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8")) as Query[]
const byId = new Map(docs.map((d) => [d.id, d]))
const unknown = queries.flatMap((q) => q.expect.filter((id) => !byId.has(id)))
if (unknown.length > 0) {
  console.error(`bench: ${unknown.length} expected ids are not in the corpus:\n  ${unknown.join("\n  ")}`)
  process.exit(1)
}

const LIMIT = 10
const CANDIDATES = 20
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 20)

interface System {
  name: string
  version: string
  kind: "local" | "remote"
  build: () => Promise<void> | void
  search: (q: string) => Promise<string[]> | string[]
}

const v = (pkg: string) => (JSON.parse(readFileSync(new URL(`../node_modules/${pkg}/package.json`, import.meta.url), "utf8")) as { version: string }).version
const norm = (q: string) => q.replace(/[^\p{L}\p{N}_\s]/gu, " ")
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/* ---------- systems ---------- */
let mini: MiniSearch<SearchDocument>
let fuse: Fuse<SearchDocument>
let flex: InstanceType<typeof FlexSearch.Document>
let lun: lunr.Index
let orama: Awaited<ReturnType<typeof oramaCreate>>
const jevTokens: number[] = []
let pagefindDir = ""
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pagefindSearch: any
let ours: ReturnType<typeof buildIndex>
let jev: ReturnType<typeof createJevSearch>

const systems: System[] = [
  {
    name: "MiniSearch",
    version: v("minisearch"),
    kind: "local",
    build() {
      mini = new MiniSearch({
        fields: ["title", "description", "content", "keywords"],
        storeFields: ["id"],
        searchOptions: { boost: { title: 4, keywords: 3, description: 2 }, prefix: true, fuzzy: 0.2 },
      })
      mini.addAll(docs.map((d) => ({ ...d, keywords: (d.keywords ?? []).join(" ") })) as unknown as SearchDocument[])
    },
    search: (q) => mini.search(q).slice(0, LIMIT).map((r) => r.id as string),
  },
  {
    name: "Fuse.js",
    version: v("fuse.js"),
    kind: "local",
    build() {
      fuse = new Fuse(docs, {
        keys: [
          { name: "title", weight: 4 },
          { name: "keywords", weight: 3 },
          { name: "description", weight: 2 },
          { name: "content", weight: 1 },
        ],
        ignoreLocation: true,
        threshold: 0.4,
        includeScore: true,
      })
    },
    search: (q) => fuse.search(q, { limit: LIMIT }).map((r) => r.item.id),
  },
  {
    name: "FlexSearch",
    version: v("flexsearch"),
    kind: "local",
    build() {
      flex = new FlexSearch.Document({ document: { id: "id", index: ["title", "description", "content", "keywords"] }, tokenize: "forward" })
      for (const d of docs) flex.add({ ...d, keywords: (d.keywords ?? []).join(" ") })
    },
    search(q) {
      const res = flex.search(q, { limit: LIMIT }) as { field: string; result: (string | number)[] }[]
      const order = ["title", "keywords", "description", "content"]
      const out: string[] = []
      for (const f of order) {
        for (const id of res.find((r) => r.field === f)?.result ?? []) if (!out.includes(String(id))) out.push(String(id))
      }
      return out.slice(0, LIMIT)
    },
  },
  {
    name: "Lunr",
    version: v("lunr"),
    kind: "local",
    build() {
      lun = lunr(function () {
        this.ref("id")
        this.field("title", { boost: 10 })
        this.field("keywords", { boost: 5 })
        this.field("description", { boost: 3 })
        this.field("content")
        for (const d of docs) this.add({ ...d, keywords: (d.keywords ?? []).join(" ") })
      })
    },
    search: (q) => {
      try {
        return lun.search(norm(q)).slice(0, LIMIT).map((r) => r.ref)
      } catch {
        return []
      }
    },
  },
  {
    name: "Orama",
    version: v("@orama/orama"),
    kind: "local",
    async build() {
      orama = await oramaCreate({ schema: { id: "string", title: "string", description: "string", content: "string", keywords: "string[]" } })
      await oramaInsert(orama, docs.map((d) => ({ id: d.id, title: d.title, description: d.description ?? "", content: d.content ?? "", keywords: d.keywords ?? [] })))
    },
    async search(q) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (oramaSearch as any)(orama, { term: q, limit: LIMIT, boost: { title: 4, keywords: 3, description: 2 }, tolerance: 1 })
      return (r.hits as { document: { id: string } }[]).map((h) => h.document.id)
    },
  },
  {
    name: "Pagefind",
    version: v("pagefind"),
    kind: "local",
    async build() {
      pagefindDir = mkdtempSync(join(tmpdir(), "pagefind-"))
      const { index } = await pagefind.createIndex({})
      if (!index) throw new Error("pagefind: could not create an index")
      // Pagefind is built for static sites, so give it what it expects: real
      // HTML, where its automatic weighting can favour the heading.
      for (const d of docs) {
        await index.addHTMLFile({
          url: d.id,
          content: `<!DOCTYPE html><html lang="en"><head><title>${esc(d.title)}</title></head><body><main data-pagefind-body><h1>${esc(
            d.title,
          )}</h1><p>${esc(d.description ?? "")}</p><p>${esc((d.keywords ?? []).join(" "))}</p><div>${esc(d.content ?? "")}</div></main></body></html>`,
        })
      }
      await index.writeFiles({ outputPath: pagefindDir })
      pagefindSearch = await import(`${pagefindDir}/pagefind.js`)
      await pagefindSearch.options({ excerptLength: 0 })
    },
    async search(q) {
      const res = await pagefindSearch.search(q)
      // Pagefind returns handles; you call data() to get the record, which is
      // what any real integration does before rendering a row.
      const top = await Promise.all(res.results.slice(0, LIMIT).map((r: { data: () => Promise<{ url: string }> }) => r.data()))
      // Pagefind computes the result url from the source path, so the id comes
      // back as a path. The last segment is what we passed in.
      return top.map((d) => d.url.replace(/^.*\//, "").replace(/\.html$/, ""))
    },
  },
  {
    name: "jev-search (lexical only)",
    version: "0.1.0",
    kind: "local",
    build() {
      ours = buildIndex(docs)
    },
    search: (q) => lexicalSearch(ours, q, { limit: LIMIT }).map((h) => h.id),
  },
  {
    name: "jev-search",
    version: "0.1.0",
    kind: "remote",
    build() {
      jev = createJevSearch({ documents: docs, cacheSize: 0 })
    },
    async search(q) {
      const r = await jev.search(q)
      jevTokens.push(r.jev.inputTokens)
      return r.jev.hits.slice(0, LIMIT).map((h) => h.id)
    },
  },
]

/* ---------- run ---------- */
const now = () => performance.now()
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0
}

interface SystemResult {
  name: string
  version: string
  kind: "local" | "remote"
  buildMs: number
  latencyMs: { median: number; p95: number }
  hit1: number
  hit3: number
  mrr: number
  byKind: Record<string, { hit1: number; hit3: number; mrr: number; n: number }>
  perQuery: { query: string; kind: string; rank: number | null; top: string[] }[]
}

const results: SystemResult[] = []
for (const sys of systems) {
  const t0 = now()
  await sys.build()
  const buildMs = now() - t0
  const perQuery: SystemResult["perQuery"] = []
  const latencies: number[] = []
  for (const q of queries) {
    const t1 = now()
    const top = await sys.search(q.query)
    latencies.push(now() - t1)
    const idx = top.findIndex((id) => q.expect.includes(id))
    perQuery.push({ query: q.query, kind: q.kind, rank: idx >= 0 ? idx + 1 : null, top: top.slice(0, 3) })
  }
  // Extra latency rounds for local systems (remote ones are network-bound; one cold round is the honest number).
  if (sys.kind === "local") {
    for (let r = 1; r < ROUNDS; r++) {
      for (const q of queries) {
        const t1 = now()
        await sys.search(q.query)
        latencies.push(now() - t1)
      }
    }
  }
  const agg = (rows: SystemResult["perQuery"]) => ({
    hit1: rows.filter((r) => r.rank === 1).length / rows.length,
    hit3: rows.filter((r) => r.rank !== null && r.rank <= 3).length / rows.length,
    mrr: rows.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / rows.length,
    n: rows.length,
  })
  const byKind: SystemResult["byKind"] = {}
  for (const kind of ["keyword", "typo", "intent"]) byKind[kind] = agg(perQuery.filter((r) => r.kind === kind))
  const all = agg(perQuery)
  const res: SystemResult = {
    name: sys.name,
    version: sys.version,
    kind: sys.kind,
    buildMs: Math.round(buildMs * 100) / 100,
    latencyMs: { median: Math.round(median(latencies) * 100) / 100, p95: Math.round(p95(latencies) * 100) / 100 },
    hit1: all.hit1,
    hit3: all.hit3,
    mrr: all.mrr,
    byKind,
    perQuery,
  }
  results.push(res)
  console.log(
    `${res.name.padEnd(26)} hit@1 ${(res.hit1 * 100).toFixed(0).padStart(3)}%  hit@3 ${(res.hit3 * 100).toFixed(0).padStart(3)}%  MRR ${res.mrr.toFixed(2)}  ` +
      `intent hit@3 ${(byKind.intent.hit3 * 100).toFixed(0).padStart(3)}%  median ${res.latencyMs.median} ms`,
  )
}

const out = {
  generatedAt: new Date().toISOString(),
  corpus: {
    documents: docs.length,
    pages: new Set(docs.map((d) => d.url.split("#")[0])).size,
    source: "every page of the TypeSafe documentation (docs.typesafe.ai), split by heading",
  },
  queries: { total: queries.length, keyword: queries.filter((q) => q.kind === "keyword").length, typo: queries.filter((q) => q.kind === "typo").length, intent: queries.filter((q) => q.kind === "intent").length },
  model: "jev-latest",
  // The ceiling jev-search can reach: how often the keyword pass puts a correct
  // document in the candidate pool at all. Jev re-ranks, it does not retrieve.
  candidateRecall: (() => {
    const idx = buildIndex(docs)
    const hit = queries.filter((q) => lexicalSearch(idx, q.query, { limit: CANDIDATES }).some((h) => q.expect.includes(h.id))).length
    return { candidates: CANDIDATES, recall: hit / queries.length }
  })(),
  cost: {
    meanInputTokens: jevTokens.length ? Math.round(jevTokens.reduce((a, b) => a + b, 0) / jevTokens.length) : 0,
    usdPerMillionInputTokens: 0.042,
  },
  runtime: `bun ${process.versions.bun ?? "?"}`,
  systems: results,
}
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(out, null, 2) + "\n")
await pagefind.close().catch(() => {})
if (pagefindDir) rmSync(pagefindDir, { recursive: true, force: true })
console.log(`\nwrote bench/results.json`)
