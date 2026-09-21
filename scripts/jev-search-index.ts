/**
 * Build lib/jev-search-index.json from a folder of Markdown / MDX files.
 *
 *   bunx tsx scripts/jev-search-index.ts [contentDir] [urlPrefix] [outFile] [--trailing-slash]
 *
 * Defaults: content/docs  /docs  src/lib/jev-search-index.json (or lib/ when src/ is absent)
 *
 * Each file becomes one document; each `##` heading becomes another with a
 * `#slug` anchor, so searches land on the right part of a long page. Front
 * matter `title`, `description`, `section` and `keywords` are honoured.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs"
import { join, relative, dirname, extname, basename } from "node:path"

/** Mirrors SearchDocument in lib/jev-search-core.ts; inlined so this script has no imports beyond node. */
interface SearchDocument {
  id: string
  title: string
  url: string
  description?: string
  content?: string
  section?: string
  keywords?: string[]
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")))
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const trailingSlash = flags.has("--trailing-slash")
const defaultOut = existsSync("src") ? "src/lib/jev-search-index.json" : "lib/jev-search-index.json"
const [contentDir = "content/docs", urlPrefix = "/docs", outFile = defaultOut] = positional

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return [".md", ".mdx"].includes(extname(name)) ? [p] : []
  })
}

function frontMatter(src: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src)
  if (!m) return { data: {}, body: src }
  const data: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "")
  }
  return { data, body: src.slice(m[0].length) }
}

/** Strip markdown/MDX syntax down to plain prose. */
function plain(md: string): string {
  return md
    .replace(/^import .*$/gm, "")
    .replace(/^export .*$/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, " "))
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

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

const docs: SearchDocument[] = []
for (const file of walk(contentDir)) {
  const rel = relative(contentDir, file)
  const { data, body } = frontMatter(readFileSync(file, "utf8"))
  const base = basename(rel, extname(rel))
  const dir = dirname(rel)
  const path = base === "index" ? dir : join(dir, base)
  let url = `${urlPrefix}/${path === "." ? "" : path}`.replace(/([^:])\/\/+/g, "$1/").replace(/\/$/, "") || urlPrefix
  if (trailingSlash) url += "/"
  const title = data.title ?? base
  const section = data.section
  const keywords = data.keywords ? data.keywords.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean) : undefined

  // Split on h2 headings. Text before the first h2 belongs to the page itself.
  const parts = body.split(/^##\s+(.+)$/m)
  const intro = plain(parts[0])
  docs.push({ id: slug(path), title, url, description: data.description, section, keywords, content: intro })
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim()
    const text = plain(parts[i + 1] ?? "")
    if (!text) continue
    docs.push({
      id: slug(`${path}-${heading}`),
      title: heading,
      url: `${url}#${slug(heading)}`,
      description: `${title}${data.description ? ` · ${data.description}` : ""}`,
      section,
      content: text,
    })
  }
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(docs, null, 2) + "\n")
console.log(`jev-search: indexed ${docs.length} documents from ${contentDir} → ${outFile}`)
