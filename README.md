# jev-search

Site search that understands the question. A [shadcn/ui](https://ui.shadcn.com) registry block: a command-palette search that shows keyword hits on the first keystroke and, a few hundred milliseconds later, re-ranks them with [TypeSafe](https://typesafe.ai)'s Jev model by what the visitor actually meant.

- **Drop-in.** `npx shadcn@latest add <registry-url>/r/jev-search.json` lands the component, hook, lexical index, server handler and an API route in your project. No package to wrap; edit the files.
- **Ultra fast.** The lexical pass answers in about a millisecond and streams straight to the UI. Jev's answer streams in behind it and the rows glide into their new order.
- **Ranked by intent, not overlap.** Jev reads the query and the top candidates and returns a calibrated relevance for each page in one request. No embeddings, no vector database, no re-indexing job.
- **Cheap.** A query is a few hundred input tokens at $0.042 per million: roughly 40,000 searches per dollar, before the cache.
- **Honest about failure.** If TypeSafe is slow or down, keyword order stands and the footer says so.

Demo and docs: the marketing site in this repo (`bun dev`). The demo searches the [jevQL](https://github.com/kylemclaren/jevql) documentation.

## Install

```bash
npx shadcn@latest add https://<your-registry-host>/r/jev-search.json
echo 'TYPESAFE_API_KEY=tsk_…' >> .env.local
```

Then build an index. Either hand the route any `SearchDocument[]`, or add the indexer and point it at a folder of Markdown/MDX:

```bash
npx shadcn@latest add https://<your-registry-host>/r/jev-search-indexer.json
npx tsx scripts/jev-search-index.ts content/docs /docs      # → lib/jev-search-index.json
```

Render it:

```tsx
import { JevSearch } from "@/components/jev-search"

export function Nav() {
  return <JevSearch placeholder="Search docs…" suggestions={["how do I deploy", "pricing"]} />
}
```

`⌘K` / `Ctrl+K` opens it anywhere. Pass your own trigger as children, or control it with `open` / `onOpenChange` / `initialQuery`.

### Files installed

| File | What it is |
| --- | --- |
| `components/jev-search.tsx` | `JevSearch`, `JevSearchTrigger`, `JevSearchDialog`. shadcn tokens, one accent variable `--jev-accent`. |
| `hooks/use-jev-search.ts` | Reads the NDJSON stream, caches per query, aborts stale requests. |
| `lib/jev-search.ts` | Types, tokenizer, stemmer, weighted lexical scorer, highlighter. No dependencies. |
| `lib/jev-search-server.ts` | `createJevSearch()` / `createJevSearchHandler()`: lexical pass, Jev judging, LRU cache, retries, streaming handler. Fetch-API only, so it runs on Next.js, Remix, Hono, Bun, Deno and Workers. |
| `app/api/jev-search/route.ts` | A Next.js route that wires the handler to `lib/jev-search-index.json`. |
| `lib/jev-search-index.json` | A three-document sample. Replace it. |

### How a query flows

1. `GET /api/jev-search?q=…` runs the lexical scorer (weighted fields, prefix, stemming, one-edit typos) and immediately streams `{"type":"lexical", hits}`.
2. The top 12 hits go to TypeSafe in one request: a `noul` question per candidate (“would the visitor be glad to land here?”), a `choice` over all candidates (“which is the single best answer?”), and a `noul` for “does any page answer this?”.
3. Hits are re-ordered by `0.75 × relevance + 0.25 × best-answer share`, those under `threshold` are dropped, and `{"type":"jev", hits, tookMs, answerable}` streams out. The answer is cached in memory.

Add `stream=0` to get one JSON body instead. The server object also exposes `search(query)` for tests and server components.

### Handler options

| Option | Default | Meaning |
| --- | --- | --- |
| `documents` | | `SearchDocument[]`: `id`, `title`, `url`, `description?`, `content?`, `section?`, `keywords?` |
| `candidates` | `12` | Lexical hits Jev judges per query |
| `threshold` | `0.15` | Drop hits below this relevance once judged |
| `excerptLength` | `320` | Body characters sent to Jev per candidate |
| `cacheSize` | `1000` | Queries kept in memory |
| `timeoutMs` | `4000` | Fall back to keyword order after this |
| `relevanceWeight` | `0.75` | Blend between per-page relevance and best-answer share |
| `model` | `jev-latest` | Or `jev-preview`, or a pinned version |
| `apiKey`, `apiUrl` | env | `TYPESAFE_API_KEY`, `TYPESAFE_API_URL` |

## Benchmarks

`bun run bench` indexes the same corpus (the jevQL docs, 104 documents split by heading) into MiniSearch, Fuse.js, FlexSearch, Lunr, Orama and jev-search, then runs 40 labelled queries: 12 keyword, 3 with typos, 25 written the way people ask. Results are in `bench/results.json` and rendered on the site.

| Library | Hit@1 | Hit@3 | MRR@10 | Intent Hit@3 | Median latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| jev-search | **80%** | **85%** | **0.82** | **84%** | 259 ms (network, uncached) |
| jev-search (lexical only) | 60% | 80% | 0.70 | 76% | 1.3 ms |
| Lunr | 60% | 78% | 0.69 | 80% | 0.2 ms |
| Fuse.js | 55% | 60% | 0.57 | 48% | 34 ms |
| MiniSearch | 48% | 63% | 0.58 | 56% | 0.4 ms |
| Orama | 40% | 55% | 0.50 | 44% | 1.7 ms |
| FlexSearch | 28% | 33% | 0.30 | 12% | 0.04 ms |

Two things worth saying plainly. The lexical pass on its own is level with the best keyword library, so you lose nothing on the first keystroke. And Jev cannot rescue a page the lexical pass never surfaced, so the two passes are tuned together: recall in the top 12, then precision at the top.

## Developing this repo

```bash
bun install
cp .env.example .env.local        # add TYPESAFE_API_KEY
bun run index -- /path/to/docs /docs   # or keep the bundled jevQL index
bun dev                            # site + API on :3000
bun run bench                      # rewrites bench/results.json
bun run registry:build             # rebuilds public/r/*.json from registry.json
```

The site is a Next.js app; the registry is served from `public/r/`. Set `NEXT_PUBLIC_BASE_PATH` to host it under a sub-path.

## License

MIT
