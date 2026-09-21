# jev-search

Site search that understands the question. A [shadcn/ui](https://ui.shadcn.com) registry block: a command palette that shows keyword hits on the first keystroke and, a couple of hundred milliseconds later, re-ranks them with [TypeSafe](https://typesafe.ai)'s Jev model by what the visitor actually meant.

- **Drop-in.** `npx shadcn@latest add <registry-url>/r/jev-search.json` lands the component, hook, lexical index, server handler and an API route in your project. No package to wrap; the files are yours.
- **Fast first, smart second.** The keyword pass answers in single-digit milliseconds and streams straight to the UI. Jev's ranking arrives behind it and the rows glide into their new order.
- **Ranked by intent, not overlap.** Jev reads the query and the top candidates and returns a calibrated relevance for each one in a single request. No embeddings, no vector database, no re-indexing job.
- **Honest about failure.** If TypeSafe is slow or down, keyword order stands and the footer says so.
- **Plain shadcn.** The component uses shadcn tokens and the shadcn `kbd` component, with `lucide-react` as its only other dependency. Set `--jev-accent` to brand it.

The marketing site in this repo is an Astro app whose demo searches all 109 pages of the TypeSafe documentation, live.

## Install

```bash
npx shadcn@latest add https://<your-registry-host>/r/jev-search.json
echo 'TYPESAFE_API_KEY=tsk_…' >> .env.local
```

Then build an index. Hand the route any `SearchDocument[]`, or add the indexer and point it at a folder of Markdown/MDX:

```bash
npx shadcn@latest add https://<your-registry-host>/r/jev-search-indexer.json
npx tsx scripts/jev-search-index.ts content/docs /docs      # → lib/jev-search-index.json
```

Render it:

```tsx
import { JevSearch } from "@/components/jev-search"

export function Nav() {
  return <JevSearch placeholder="Search docs…" suggestions={["how do I deploy", "what does it cost"]} />
}
```

`⌘K` / `Ctrl+K` opens it anywhere. Pass your own trigger as children, or control it with `open`, `onOpenChange` and `initialQuery`.

### Files installed

| File | What it is |
| --- | --- |
| `components/jev-search.tsx` | `JevSearch`, `JevSearchTrigger`, `JevSearchDialog`. shadcn tokens, `data-slot` styling hooks, one accent variable. |
| `hooks/use-jev-search.ts` | Reads the NDJSON stream, caches per query, aborts stale requests, exposes both passes. |
| `lib/jev-search-core.ts` | Types, tokenizer, stemmer, weighted lexical scorer, highlighter. No dependencies. |
| `lib/jev-search-server.ts` | `createJevSearch()` / `createJevSearchHandler()`: keyword pass, Jev judging, LRU cache, retries, streaming handler. Fetch API only, so it runs on Next.js, Astro, Remix, Hono, Bun, Deno and Workers. |
| `app/api/jev-search/route.ts` | A Next.js route wiring the handler to your index. |
| `lib/jev-search-index.json` | A three-document sample. Replace it. |
| `components/ui/kbd.tsx` | The shadcn `kbd` component, pulled in as a registry dependency. |

### How a query flows

1. `GET /api/jev-search?q=…` runs the keyword scorer (weighted fields, prefixes, a light stemmer, one-edit typos) and immediately streams `{"type":"lexical", hits}`.
2. The top 20 hits go to TypeSafe in one request: a `noul` question per candidate (“would the visitor be glad to land here?”), a `choice` over all candidates (“which single page is the best answer?”), and a `noul` for “does any page answer this at all?”. Jev evaluates them in parallel.
3. Hits are re-ordered by `0.75 × relevance + 0.25 × best-answer share`, anything under `threshold` is dropped, and `{"type":"jev", hits, tookMs, inputTokens, answerable}` streams out. The answer is cached in memory.

Add `stream=0` for a single JSON body. The server object also exposes `search(query)` for tests and server components.

### Handler options

| Option | Default | Meaning |
| --- | --- | --- |
| `documents` | | `SearchDocument[]`: `id`, `title`, `url`, `description?`, `content?`, `section?`, `keywords?` |
| `candidates` | `20` | Keyword hits Jev judges per query. Accuracy plateaus here; 30 adds nothing. |
| `threshold` | `0.15` | Drop hits below this relevance once judged |
| `excerptLength` | `320` | Body characters sent to Jev per candidate |
| `cacheSize` | `1000` | Queries kept in memory |
| `timeoutMs` | `4000` | Fall back to keyword order after this |
| `relevanceWeight` | `0.75` | Blend between per-page relevance and best-answer share |
| `model` | `jev-latest` | Or `jev-preview`, or a pinned version |
| `apiKey`, `apiUrl` | env | `TYPESAFE_API_KEY`, `TYPESAFE_API_URL` |

## Benchmarks

`bun run bench` indexes one corpus into every library and runs the same labelled queries. The corpus is every page of the TypeSafe documentation (109 pages, split at their headings into 443 documents); the queries are 41 labelled ones: 12 keyword, 3 with typos, 26 written the way people actually ask. Results land in `bench/results.json` and the site renders them.

| Library | Hit@1 | Hit@3 | MRR@10 | Intent Hit@3 | Median |
| --- | ---: | ---: | ---: | ---: | ---: |
| **jev-search** | **83%** | **83%** | **0.83** | **73%** | 278 ms (network, uncached) |
| jev-search, keyword pass only | 41% | 59% | 0.51 | 42% | 8.7 ms |
| Lunr | 41% | 59% | 0.53 | 42% | 0.7 ms |
| Fuse.js | 39% | 46% | 0.43 | 23% | 245 ms |
| Orama | 39% | 56% | 0.48 | 35% | 5.2 ms |
| MiniSearch | 34% | 46% | 0.44 | 27% | 2.1 ms |
| FlexSearch | 27% | 34% | 0.30 | 12% | 0.2 ms |
| Pagefind | 20% | 29% | 0.25 | 8% | 2.6 ms |

Three things worth stating plainly.

**The keyword pass alone ties the best keyword library.** At 41% Hit@1 it is level with Lunr, so nothing is lost on the first keystroke.

**Jev converts essentially all of the available recall.** The keyword pass puts a correct document in the 20-candidate pool for 83% of queries, and jev-search lands one first for 83%. The remaining gap is retrieval, not judgement: Jev re-ranks, it does not search, so a page that never reaches the pool cannot win.

**Pagefind is measured at its own game.** It gets real HTML so its heading weighting applies, and it is excellent at what it is for. It requires every query term to appear, so it returns nothing at all for 12 of the 41 queries and 12 of the 26 written as questions.

### Cost

Measured over this corpus: 6,169 input tokens per uncached query at $0.042 per million, about **$0.26 per thousand searches**. Output tokens are free and repeats are cached. Lower `candidates` or `excerptLength` to trade accuracy for spend.

## Developing this repo

```bash
bun install
cp .env.example .env.local           # add TYPESAFE_API_KEY
bun run index:typesafe               # rebuild the demo index from docs.typesafe.ai
bun dev                              # site + API on :4321
bun run bench                        # rewrites bench/results.json (hits the API)
bun run registry:build               # rebuilds public/r/*.json from registry.json
bun run build                        # registry + site
```

`bun run build` runs `shadcn build` before `astro build`, so `public/r/*.json` is always current in `dist/`.

## License

MIT
