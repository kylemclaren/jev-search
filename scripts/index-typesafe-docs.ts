/**
 * Build the demo index from TypeSafe's own documentation.
 *
 *   bun run scripts/index-typesafe-docs.ts [outFile]
 *
 * docs.typesafe.ai publishes an llms.txt listing every page, and a .md twin of
 * each page. We take the title and description from llms.txt, fetch the
 * markdown, strip the MDX machinery, and emit one document per page plus one
 * per h2 heading so results land on the right section.
 *
 * This is demo scaffolding for the marketing site, not part of the registry
 * block. The shipped indexer is scripts/jev-search-index.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const LLMS = "https://docs.typesafe.ai/llms.txt"
const OUT = process.argv[2] ?? "src/lib/jev-search-index.json"
const CONCURRENCY = 8

interface SearchDocument {
  id: string
  title: string
  url: string
  description?: string
  content?: string
  section?: string
  keywords?: string[]
}

interface Page {
  title: string
  mdUrl: string
  url: string
  description?: string
  path: string
}

const SECTIONS: Record<string, string> = {
  "": "Overview",
  introduction: "Start",
  concepts: "Concepts",
  primitives: "Primitives",
  patterns: "Patterns",
  demos: "Demos",
  sdk: "SDKs",
  api: "API",
  confidence: "Concepts",
  models: "API",
  pricing: "API",
}

function sectionFor(path: string): string {
  const head = path.split("/")[0] ?? ""
  if (SECTIONS[head]) return SECTIONS[head]
  if (!head) return "Overview"
  const pretty = head.replace(/-/g, " ")
  return pretty[0].toUpperCase() + pretty.slice(1)
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Strip MDX exports/imports, JSX, code fences and markdown punctuation. */
function plain(md: string): string {
  let s = md
  // Mintlify prepends an instruction block of blockquote lines; drop the lead-in.
  s = s.replace(/^(>.*\n)+/, "")
  // Remove `export function …{ … }` / `import …` blocks: from the keyword at the
  // start of a line to the next line that closes at column zero.
  s = s.replace(/^(?:export|import)\b[\s\S]*?^\}\s*$/gm, " ")
  s = s.replace(/^(?:export|import)\b.*$/gm, " ")
  return s
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, " "))
    .replace(/<[^>]+>/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}[\s|:-]*$/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, (row) => row.replace(/\|/g, " "))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\*\*?/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

async function get(url: string, tries = 3): Promise<string> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "jev-search-demo-indexer" } })
      if (res.ok) return await res.text()
      last = new Error(`${res.status} ${url}`)
    } catch (err) {
      last = err
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)))
  }
  throw last
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const listing = await get(LLMS)
const pages: Page[] = []
for (const line of listing.split(/\r?\n/)) {
  const m = /^-\s*\[([^\]]+)\]\((https:\/\/docs\.typesafe\.ai\/[^)]+\.md)\)(?::\s*(.*))?$/.exec(line.trim())
  if (!m) continue
  const [, title, mdUrl, description] = m
  const url = mdUrl.replace(/\.md$/, "")
  const path = url.replace("https://docs.typesafe.ai/", "")
  pages.push({ title, mdUrl, url, description: description?.trim() || undefined, path })
}
console.log(`typesafe docs: ${pages.length} pages listed in llms.txt`)

const docs: SearchDocument[] = []
let failed = 0
await mapLimit(pages, CONCURRENCY, async (page) => {
  let md: string
  try {
    md = await get(page.mdUrl)
  } catch (err) {
    failed++
    console.warn(`  skipped ${page.path}: ${(err as Error).message}`)
    return
  }
  const section = sectionFor(page.path)
  // Text before the first h2 belongs to the page itself.
  const parts = md.split(/^##\s+(.+)$/m)
  const intro = plain(parts[0])
  docs.push({
    id: slug(page.path) || "index",
    title: page.title,
    url: page.url,
    description: page.description,
    section,
    content: intro,
  })
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].replace(/[`*]/g, "").trim()
    const text = plain(parts[i + 1] ?? "")
    if (!text) continue
    docs.push({
      id: slug(`${page.path}-${heading}`),
      title: heading,
      url: `${page.url}#${slug(heading)}`,
      description: `${page.title}${page.description ? ` · ${page.description}` : ""}`,
      section,
      content: text,
    })
  }
})

// Stable order, unique ids.
docs.sort((a, b) => a.id.localeCompare(b.id))
const seen = new Set<string>()
const unique = docs.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(unique, null, 2) + "\n")
const chars = unique.reduce((n, d) => n + (d.content?.length ?? 0), 0)
console.log(`jev-search: ${unique.length} documents from ${pages.length - failed}/${pages.length} pages, ${chars.toLocaleString()} characters → ${OUT}`)
if (failed > 0) {
  console.error(`jev-search: ${failed} pages failed to fetch; the index is incomplete`)
  process.exit(1)
}
