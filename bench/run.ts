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
import { readFileSync, writeFileSync } from "node:fs"
import MiniSearch from "minisearch"
import Fuse from "fuse.js"
import FlexSearch from "flexsearch"
import lunr from "lunr"
import { create as oramaCreate, insertMultiple as oramaInsert, search as oramaSearch } from "@orama/orama"
import { buildIndex, lexicalSearch, type SearchDocument } from "../lib/jev-search-core"
import { createJevSearch } from "../lib/jev-search-server"

type Query = { kind: "keyword" | "typo" | "intent"; query: string; expect: string[] }
const docs = JSON.parse(readFileSync(new URL("../lib/jev-search-index.json", import.meta.url), "utf8")) as SearchDocument[]
const queries = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8")) as Query[]
const LIMIT = 10
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

/* ---------- systems ---------- */
let mini: MiniSearch<SearchDocument>
let fuse: Fuse<SearchDocument>
let flex: InstanceType<typeof FlexSearch.Document>
let lun: lunr.Index
let orama: Awaited<ReturnType<typeof oramaCreate>>
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
  corpus: { documents: docs.length, source: "jevQL documentation, split by h2" },
  queries: { total: queries.length, keyword: queries.filter((q) => q.kind === "keyword").length, typo: queries.filter((q) => q.kind === "typo").length, intent: queries.filter((q) => q.kind === "intent").length },
  model: "jev-latest",
  runtime: `bun ${process.versions.bun ?? "?"}`,
  systems: results,
}
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(out, null, 2) + "\n")
console.log(`\nwrote bench/results.json`)
