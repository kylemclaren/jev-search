import { cn } from "@/lib/utils"

interface KindAgg {
  hit1: number
  hit3: number
  mrr: number
  n: number
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
  byKind: Record<string, KindAgg>
  perQuery: { query: string; kind: string; rank: number | null; top: string[] }[]
}
export interface BenchData {
  generatedAt: string
  corpus: { documents: number; source: string }
  queries: { total: number; keyword: number; typo: number; intent: number }
  model: string
  runtime: string
  systems: SystemResult[]
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const ms = (x: number) => (x < 10 ? x.toFixed(2) : Math.round(x).toString())

export function Benchmarks({ data }: { data: BenchData }) {
  const systems = [...data.systems].sort((a, b) => b.hit1 - a.hit1 || b.mrr - a.mrr)
  const showcase = data.systems.find((s) => s.name === "jev-search")!
  const lexical = data.systems.find((s) => s.name === "jev-search (lexical only)")!
  const rivals = data.systems.filter((s) => !s.name.startsWith("jev-search"))
  const bestRival = [...rivals].sort((a, b) => b.hit1 - a.hit1)[0]
  const examples = showcase.perQuery
    .filter((q) => q.kind === "intent" && q.rank === 1)
    .filter((q) => rivals.every((r) => (r.perQuery.find((x) => x.query === q.query)?.rank ?? 99) > 1))
    .slice(0, 6)

  return (
    <div className="mt-10 space-y-10">
      {/* Bars */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BarChart title="Hit@1 · all queries" systems={systems} pick={(s) => s.hit1} />
        <BarChart title="Hit@1 · plain-English queries" systems={systems} pick={(s) => s.byKind.intent.hit1} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-background">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left font-medium">Library</th>
              <th className="px-3 py-3 text-right font-medium">Hit@1</th>
              <th className="px-3 py-3 text-right font-medium">Hit@3</th>
              <th className="px-3 py-3 text-right font-medium">MRR@10</th>
              <th className="px-3 py-3 text-right font-medium">Keyword</th>
              <th className="px-3 py-3 text-right font-medium">Typos</th>
              <th className="px-3 py-3 text-right font-medium">Intent</th>
              <th className="px-3 py-3 text-right font-medium">Median</th>
              <th className="px-4 py-3 text-right font-medium">p95</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {systems.map((s) => {
              const ours = s.name.startsWith("jev-search")
              return (
                <tr key={s.name} className={cn(s.name === "jev-search" && "bg-[color-mix(in_oklch,var(--jev-accent)_10%,transparent)]")}>
                  <td className="px-4 py-2.5">
                    <span className={cn("font-medium", !ours && "font-normal")}>{s.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{s.version}</span>
                  </td>
                  <Cell v={pct(s.hit1)} strong />
                  <Cell v={pct(s.hit3)} />
                  <Cell v={s.mrr.toFixed(2)} />
                  <Cell v={pct(s.byKind.keyword.hit3)} />
                  <Cell v={pct(s.byKind.typo.hit3)} />
                  <Cell v={pct(s.byKind.intent.hit3)} />
                  <Cell v={`${ms(s.latencyMs.median)} ms`} />
                  <Cell v={`${ms(s.latencyMs.p95)} ms`} last />
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Keyword, Typos and Intent columns are Hit@3 for that query type. Latency is per query, measured in-process on {data.runtime}; jev-search includes the
          TypeSafe round trip from this server with the cache disabled, so it is the honest cold number. Every other library runs entirely in memory. Generated{" "}
          {new Date(data.generatedAt).toISOString().slice(0, 10)} with {data.model}.
        </p>
      </div>

      {/* Reading */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">The lexical pass alone is competitive.</span> jev-search without Jev lands at {pct(lexical.hit1)} Hit@1,
            level with {bestRival.name} ({pct(bestRival.hit1)}), because it does the ordinary things well: weighted fields, prefixes, stemming, typos.
          </p>
          <p>
            <span className="font-medium text-foreground">Jev is where the gap opens.</span> On queries written as questions, Hit@1 goes from{" "}
            {pct(lexical.byKind.intent.hit1)} to {pct(showcase.byKind.intent.hit1)}. It cannot invent pages the lexical pass missed, so the two are designed
            together: the first pass optimises for recall in its top twelve, the second for precision at the top.
          </p>
          <p>
            <span className="font-medium text-foreground">What it costs.</span> About {ms(showcase.latencyMs.median)} ms of network per uncached query, during
            which the visitor already sees keyword results. The reorder is animated, so it reads as “the list thought about it”, not as a flash.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Queries only jev-search gets right first time</p>
          <ul className="mt-3 divide-y divide-border">
            {examples.map((q) => (
              <li key={q.query} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>“{q.query}”</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  → {q.top[0]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Cell({ v, strong, last }: { v: string; strong?: boolean; last?: boolean }) {
  return <td className={cn("px-3 py-2.5 text-right font-mono text-xs tabular-nums", strong && "font-semibold text-foreground", last && "px-4")}>{v}</td>
}

function BarChart({ title, systems, pick }: { title: string; systems: SystemResult[]; pick: (s: SystemResult) => number }) {
  const sorted = [...systems].sort((a, b) => pick(b) - pick(a))
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {sorted.map((s) => {
          const v = pick(s)
          const ours = s.name === "jev-search"
          return (
            <li key={s.name} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-xs">
              <span className={cn("truncate", ours ? "font-medium" : "text-muted-foreground")}>{s.name}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(v * 100, 1)}%`,
                    background: ours ? "var(--jev-accent)" : "color-mix(in oklch, var(--muted-foreground) 55%, transparent)",
                  }}
                />
              </span>
              <span className={cn("text-right font-mono tabular-nums", ours ? "font-semibold" : "text-muted-foreground")}>{pct(v)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
