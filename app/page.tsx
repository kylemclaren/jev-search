import { ArrowUpRight, Sparkles, Zap, Layers, Gauge, KeyRound, Terminal } from "lucide-react"
import { HeroDemo } from "@/components/site/demo"
import { Command, RegistryCommand, ThemeToggle } from "@/components/site/bits"
import { Benchmarks } from "@/components/site/benchmarks"
import benchJson from "@/bench/results.json"
import type { BenchData } from "@/components/site/benchmarks"

const bench = benchJson as BenchData

const REPO = "https://github.com/kylemclaren/jev-search"

export default function Home() {
  const jev = bench.systems.find((s) => s.name === "jev-search")!
  const bestLexical = [...bench.systems].filter((s) => s.kind === "local" && !s.name.startsWith("jev-search")).sort((a, b) => b.hit1 - a.hit1)[0]

  return (
    <main className="flex-1">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
        <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pb-20 pt-20 text-center sm:pt-28">
          <a
            href="https://typesafe.ai"
            target="_blank"
            rel="noreferrer"
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition hover:text-foreground"
          >
            <Sparkles className="size-3.5" style={{ color: "var(--jev-accent)" }} aria-hidden />
            Ranked by TypeSafe&rsquo;s Jev model · shadcn/ui registry compatible
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
          <h1 className="max-w-3xl text-balance font-heading text-4xl font-semibold tracking-tight sm:text-6xl">
            Site search that understands <span className="accent-text">the question</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Keyword hits on the first keystroke. A few hundred milliseconds later, Jev has read the top matches and re-ranked them by
            what the visitor actually meant. One command to install, one env var to run.
          </p>

          <HeroDemo className="mt-10" />

          <div className="mt-10 w-full max-w-2xl">
            <RegistryCommand />
          </div>

          <dl className="mt-10 grid w-full max-w-2xl grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-background/70 text-center backdrop-blur">
            <Stat label="Hit@1 on plain-English queries" value={`${Math.round(jev.byKind.intent.hit1 * 100)}%`} />
            <Stat label={`vs. ${bestLexical.name}, best keyword lib`} value={`${Math.round(bestLexical.byKind.intent.hit1 * 100)}%`} muted />
            <Stat label="median Jev round trip" value={`${Math.round(jev.latencyMs.median)} ms`} />
          </dl>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <SectionTitle eyebrow="How it works" title="Two passes, one round trip." />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Step
              n="01"
              icon={<Zap className="size-4" />}
              title="Keystroke: lexical pass"
              body="A tiny in-process index (weighted fields, prefix, stemming, one-edit typos) answers in about a millisecond and streams the hits immediately."
            />
            <Step
              n="02"
              icon={<Sparkles className="size-4" />}
              title="Jev reads the top twelve"
              body="The query and the candidates go to TypeSafe in a single request. Jev answers a calibrated yes/no for every page plus a “best answer” distribution. No embeddings, no vector store."
            />
            <Step
              n="03"
              icon={<Gauge className="size-4" />}
              title="Rows glide into place"
              body="Results re-order with a relevance meter per hit. Low-relevance pages drop out. Answers are cached, so the second visitor pays nothing."
            />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            A query costs a few hundred input tokens at $0.042 per million. Roughly 40,000 searches per dollar.
          </p>
        </div>
      </section>

      {/* Benchmarks */}
      <section id="benchmarks" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <SectionTitle
            eyebrow="Benchmarks"
            title="Against the open source search libraries you would otherwise reach for."
            body={`${bench.queries.total} labelled queries over the jevQL documentation (${bench.corpus.documents} documents, split by heading): ${bench.queries.keyword} keyword, ${bench.queries.typo} with typos and ${bench.queries.intent} written the way people actually ask. Every library indexes the same corpus with sensible field boosts. Rerun it yourself with \`bun run bench\`.`}
          />
          <Benchmarks data={bench} />
        </div>
      </section>

      {/* Install */}
      <section id="install" className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <SectionTitle eyebrow="Install" title="Three steps. Your framework, your styles." />
          <ol className="mt-10 space-y-8">
            <InstallStep n="1" title="Add the block from the registry">
              <p className="text-sm text-muted-foreground">
                Installs the component, the hook, the lexical index, the server handler and an API route into your shadcn/ui project. Works with Next.js
                out of the box; the handler is a plain Fetch-API function for everything else.
              </p>
              <RegistryCommand />
            </InstallStep>
            <InstallStep n="2" title="Set your TypeSafe key and build an index">
              <p className="text-sm text-muted-foreground">
                Get a key at{" "}
                <a className="underline underline-offset-2 hover:text-foreground" href="https://typesafe.ai" target="_blank" rel="noreferrer">
                  typesafe.ai
                </a>
                . The indexer turns a folder of Markdown or MDX into <code className="rounded bg-muted px-1 font-mono text-xs">lib/jev-search-index.json</code>, one
                document per page and one per heading. Or hand the route any array of documents you like.
              </p>
              <Command>{`echo 'TYPESAFE_API_KEY=tsk_…' >> .env.local`}</Command>
              <RegistryCommand item="jev-search-indexer" />
              <Command>{`npx tsx scripts/jev-search-index.ts content/docs /docs`}</Command>
            </InstallStep>
            <InstallStep n="3" title="Render it">
              <CodeBlock>{`import { JevSearch } from "@/components/jev-search"

export function Nav() {
  return <JevSearch placeholder="Search docs…" suggestions={["how do I deploy", "pricing"]} />
}`}</CodeBlock>
              <p className="text-sm text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1 font-mono text-xs">⌘K</kbd> opens it anywhere. Pass your own trigger as children, or drive it
                with <code className="rounded bg-muted px-1 font-mono text-xs">open</code> / <code className="rounded bg-muted px-1 font-mono text-xs">onOpenChange</code>.
              </p>
            </InstallStep>
          </ol>
        </div>
      </section>

      {/* API */}
      <section id="api" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <SectionTitle eyebrow="API" title="Small surface, sharp edges filed off." />
          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 font-medium">
                <Layers className="size-4 text-muted-foreground" /> <code className="font-mono text-sm">&lt;JevSearch /&gt;</code>
              </h3>
              <PropTable
                rows={[
                  ["endpoint", "string", "Route serving the handler. Default /api/jev-search."],
                  ["placeholder", "string", "Input placeholder and trigger label."],
                  ["suggestions", "string[]", "Example queries shown while the box is empty."],
                  ["hotkey", "string", "Key used with ⌘ / Ctrl. Default k."],
                  ["onSelect", "(hit) => void", "Handle navigation yourself (e.g. router.push)."],
                  ["open / onOpenChange", "boolean / fn", "Controlled open state."],
                  ["initialQuery", "string", "Pre-fill the box when opening."],
                  ["brand", "string", "Name shown in the footer status. Default jev."],
                  ["recent", "boolean", "Remember recent searches in localStorage."],
                  ["children", "ReactNode", "Your own trigger element."],
                ]}
              />
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-medium">
                <Terminal className="size-4 text-muted-foreground" /> <code className="font-mono text-sm">createJevSearchHandler(options)</code>
              </h3>
              <PropTable
                rows={[
                  ["documents", "SearchDocument[]", "id, title, url, description?, content?, section?, keywords?"],
                  ["candidates", "number", "How many lexical hits Jev judges. Default 12."],
                  ["threshold", "number", "Drop hits below this relevance. Default 0.15."],
                  ["excerptLength", "number", "Body characters sent per candidate. Default 320."],
                  ["cacheSize", "number", "Queries kept in memory. Default 1000."],
                  ["timeoutMs", "number", "Fall back to keyword order after this. Default 4000."],
                  ["model", "string", "jev-latest, jev-preview or a pinned version."],
                  ["apiKey / apiUrl", "string", "Default to TYPESAFE_API_KEY / TYPESAFE_API_URL."],
                ]}
              />
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">GET ?q=</span> streams NDJSON: a <code className="font-mono text-xs">lexical</code> event, then a{" "}
                <code className="font-mono text-xs">jev</code> event. Add <code className="font-mono text-xs">stream=0</code> for one JSON body. The
                handler also exposes <code className="font-mono text-xs">search()</code> for tests and server components.
              </p>
            </div>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Note icon={<KeyRound className="size-4" />} title="Key stays on the server" body="The browser only ever talks to your route. Page bodies never leave the server either: the client receives titles, descriptions and scores." />
            <Note icon={<Zap className="size-4" />} title="Degrades gracefully" body="If TypeSafe is slow or down the keyword ranking stands and the footer says so. Nothing breaks, search just gets a little dumber." />
            <Note icon={<Layers className="size-4" />} title="Yours to edit" body="No package to wrap. The files land in your repo with shadcn tokens, one accent variable (--jev-accent) and no dependencies beyond lucide-react." />
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Built on{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://typesafe.ai" target="_blank" rel="noreferrer">
              TypeSafe Jev
            </a>
            . A sibling of{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/kylemclaren/jevql" target="_blank" rel="noreferrer">
              jevQL
            </a>
            , whose docs power the demo.
          </p>
          <p>MIT · Kyle McLaren</p>
        </div>
      </footer>
    </main>
  )
}

/* ---------- page pieces ---------- */

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <a href="#" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-foreground text-background">
            <Sparkles className="size-3.5" />
          </span>
          jev-search
        </a>
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
          <a className="hover:text-foreground" href="#how">
            How it works
          </a>
          <a className="hover:text-foreground" href="#benchmarks">
            Benchmarks
          </a>
          <a className="hover:text-foreground" href="#install">
            Install
          </a>
          <a className="hover:text-foreground" href="#api">
            API
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="px-3 py-4">
      <dd className={`font-heading text-2xl font-semibold tabular-nums sm:text-3xl ${muted ? "text-muted-foreground" : ""}`}>{value}</dd>
      <dt className="mt-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">{label}</dt>
    </div>
  )
}

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "color-mix(in oklch, var(--jev-accent) 70%, var(--foreground))" }}>
        {eyebrow}
      </p>
      <h2 className="mt-2 text-balance font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {body ? <p className="mt-3 text-sm text-muted-foreground sm:text-base">{body}</p> : null}
    </div>
  )
}

function Step({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="flex items-center justify-between">
        <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">{icon}</span>
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
      </div>
      <h3 className="mt-4 font-medium">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function InstallStep({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-3 sm:grid-cols-[3rem_1fr]">
      <span className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-muted font-mono text-sm">{n}</span>
      <div className="space-y-3">
        <h3 className="font-medium">{title}</h3>
        {children}
      </div>
    </li>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed sm:text-sm">
      <code>{children}</code>
    </pre>
  )
}

function PropTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <table className="mt-4 w-full text-left text-sm">
      <tbody className="divide-y divide-border">
        {rows.map(([name, type, desc]) => (
          <tr key={name} className="align-top">
            <td className="w-40 py-2 pr-3 font-mono text-xs">{name}</td>
            <td className="hidden w-32 py-2 pr-3 font-mono text-xs text-muted-foreground md:table-cell">{type}</td>
            <td className="py-2 text-muted-foreground">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Note({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="flex items-center gap-2 font-medium">
        <span className="text-muted-foreground">{icon}</span> {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
