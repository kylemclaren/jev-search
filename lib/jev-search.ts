/**
 * jev-search — shared types and the lexical first pass.
 *
 * This file is used on both the client (highlighting) and the server
 * (candidate selection). It has no dependencies.
 */

export interface SearchDocument {
  /** Stable id, used as the key in Jev questions. Keep it short. */
  id: string
  title: string
  /** Where the result links to. */
  url: string
  description?: string
  /** Body text. Only the first `excerptLength` chars are sent to Jev. */
  content?: string
  /** Group label shown in the results list, e.g. "Docs", "Blog", "API". */
  section?: string
  keywords?: string[]
}

/** What the server sends back for each hit. Content never leaves the server. */
export interface SearchHit {
  id: string
  title: string
  url: string
  description?: string
  section?: string
  /** Lexical score (relative, unbounded). */
  score: number
  /** Jev's calibrated 0–1 answer to "is this what the user wants?". */
  relevance?: number
  /** Jev's share of "best single answer" probability across the candidates. */
  probability?: number
  /** Query terms that matched, for highlighting. */
  terms: string[]
}

export type SearchEvent =
  | { type: "lexical"; query: string; hits: SearchHit[]; tookMs: number }
  | {
      type: "jev"
      query: string
      hits: SearchHit[]
      tookMs: number
      model: string
      judged: number
      /** Jev's belief that at least one candidate answers the query. */
      answerable: number
      cached: boolean
    }
  | { type: "error"; query: string; message: string }

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for",
  "from", "how", "i", "in", "is", "it", "my", "of", "on", "or", "the", "to",
  "what", "with", "you", "your",
])

/** A very small stemmer: enough for "tickets", "connecting" and "judged" to meet in the middle. */
export function stem(token: string): string {
  if (token.length <= 4) return token
  return token.replace(/(ing|ed|es|ly|s)$/, (m) => (token.length - m.length >= 4 ? "" : m))
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 0)
    .map(stem)
}

/** Query tokens: stop words dropped unless the query is nothing but stop words. */
export function queryTerms(query: string): string[] {
  const all = tokenize(query)
  const kept = all.filter((t) => !STOP.has(t))
  return kept.length > 0 ? kept : all
}

interface IndexedDocument {
  doc: SearchDocument
  title: string[]
  keywords: string[]
  description: string[]
  content: string[]
  titleText: string
  titleJoined: string
  bodyText: string
}

export interface LexicalIndex {
  docs: IndexedDocument[]
}

export function buildIndex(documents: SearchDocument[]): LexicalIndex {
  return {
    docs: documents.map((doc) => ({
      doc,
      title: tokenize(doc.title),
      keywords: tokenize((doc.keywords ?? []).join(" ")),
      description: tokenize(doc.description ?? ""),
      content: tokenize(doc.content ?? ""),
      titleText: doc.title.toLowerCase(),
      titleJoined: tokenize(doc.title).join(""),
      bodyText: `${doc.description ?? ""}\n${doc.content ?? ""}`.toLowerCase(),
    })),
  }
}

/** Damerau–Levenshtein distance capped at 1: true when a and b differ by one edit. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  let i = 0
  while (i < la && i < lb && a[i] === b[i]) i++
  if (la === lb) {
    // substitution or transposition
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  }
  // insertion / deletion
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

const WEIGHTS = {
  titleExact: 10,
  titlePrefix: 6,
  titleFuzzy: 4,
  keywordExact: 7,
  keywordPrefix: 4,
  descriptionExact: 3,
  descriptionPrefix: 2,
  contentExact: 1,
  contentPrefix: 0.4,
  titlePhrase: 12,
  bodyPhrase: 4,
} as const

function fieldScore(tokens: string[], term: string, exact: number, prefix: number, fuzzy = 0): number {
  let best = 0
  let hits = 0
  for (const t of tokens) {
    if (t === term) {
      best = Math.max(best, exact)
      hits++
    } else if (t.startsWith(term)) {
      best = Math.max(best, prefix)
      hits++
    } else if (fuzzy > 0 && term.length >= 5 && withinOneEdit(t, term)) {
      best = Math.max(best, fuzzy)
      hits++
    }
  }
  if (best === 0) return 0
  // A little extra for repeated hits, with quickly diminishing returns.
  return best + Math.min(hits - 1, 3) * best * 0.1
}

export interface LexicalOptions {
  limit?: number
}

/**
 * Rank documents for a query with weighted field matching, prefix matching and
 * one-edit typo tolerance on titles. Fast enough to run on every keystroke for
 * a few thousand documents.
 */
export function lexicalSearch(index: LexicalIndex, query: string, options: LexicalOptions = {}): SearchHit[] {
  const limit = options.limit ?? 20
  const terms = queryTerms(query)
  if (terms.length === 0) return []
  const phrase = query.trim().toLowerCase()

  const scored: { hit: SearchHit; matched: number }[] = []
  for (const d of index.docs) {
    let score = 0
    let matched = 0
    const matchedTerms: string[] = []
    for (const term of terms) {
      let s =
        fieldScore(d.title, term, WEIGHTS.titleExact, WEIGHTS.titlePrefix, WEIGHTS.titleFuzzy) +
        fieldScore(d.keywords, term, WEIGHTS.keywordExact, WEIGHTS.keywordPrefix, WEIGHTS.titleFuzzy) +
        fieldScore(d.description, term, WEIGHTS.descriptionExact, WEIGHTS.descriptionPrefix, WEIGHTS.descriptionPrefix) +
        fieldScore(d.content, term, WEIGHTS.contentExact, WEIGHTS.contentPrefix)
      // "quickstrat" → "quick start": one edit away from the title with its spaces removed.
      if (s === 0 && term.length >= 6 && withinOneEdit(term, d.titleJoined)) s = WEIGHTS.titleFuzzy
      if (s > 0) {
        matched++
        matchedTerms.push(term)
        score += s
      }
    }
    if (matched === 0) continue
    // Reward documents that match more of the query.
    score *= matched / terms.length
    if (phrase.length >= 3 && terms.length > 1) {
      if (d.titleText.includes(phrase)) score += WEIGHTS.titlePhrase
      else if (d.bodyText.includes(phrase)) score += WEIGHTS.bodyPhrase
    }
    // Mild length normalisation so long pages do not win on volume alone.
    score /= 1 + Math.log1p(d.content.length) / 12
    scored.push({
      matched,
      hit: {
        id: d.doc.id,
        title: d.doc.title,
        url: d.doc.url,
        description: d.doc.description,
        section: d.doc.section,
        score,
        terms: matchedTerms,
      },
    })
  }
  scored.sort((a, b) => b.hit.score - a.hit.score || a.hit.title.localeCompare(b.hit.title))
  return scored.slice(0, limit).map((s) => s.hit)
}

/** Split text into [plain, match, plain, match…] segments for highlighting. */
export function highlightSegments(text: string, terms: string[]): { text: string; match: boolean }[] {
  if (!text || terms.length === 0) return [{ text, match: false }]
  const escaped = terms
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  if (escaped.length === 0) return [{ text, match: false }]
  const re = new RegExp(`(${escaped.join("|")})`, "gi")
  const out: { text: string; match: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i), match: false })
    out.push({ text: m[0], match: true })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false })
  return out
}
