import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useJevSearch } from "@/hooks/use-jev-search"
import { JevSearchDialog } from "@/components/jev-search"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

const EXAMPLES = [
  "what do I do when I get a 429",
  "do you train on my requests",
  "can I fine tune it on my data",
  "what is the model bad at",
  "screen job applicants",
  "pyton sdk",
]

const ROWS = 6

/**
 * Glide rows to their new positions instead of letting them jump, and fade in
 * rows that are new. Entrances only animate on the render where Jev's ranking
 * arrives, so ordinary typing stays quiet.
 */
function useFlip(ref: React.RefObject<HTMLElement | null>, deps: unknown[], animateEnter: boolean) {
  const previous = useRef(new Map<string, number>())
  const entered = useRef(false)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const enter = animateEnter && !entered.current
    entered.current = animateEnter
    const next = new Map<string, number>()
    for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
      const id = el.dataset.flip!
      const top = el.getBoundingClientRect().top
      next.set(id, top)
      if (reduce) continue
      const prev = previous.current.get(id)
      if (prev !== undefined && Math.abs(prev - top) > 0.5) {
        el.style.transition = "none"
        el.style.transform = `translateY(${prev - top}px)`
        requestAnimationFrame(() => {
          el.style.transition = "transform 320ms cubic-bezier(.2,.8,.2,1)"
          el.style.transform = ""
        })
      } else if (prev === undefined && enter) {
        el.style.transition = "none"
        el.style.opacity = "0"
        el.style.transform = "translateY(6px)"
        requestAnimationFrame(() => {
          el.style.transition = "opacity 280ms ease, transform 280ms cubic-bezier(.2,.8,.2,1)"
          el.style.opacity = ""
          el.style.transform = ""
        })
      }
    }
    previous.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export default function HeroSearch() {
  const search = useJevSearch({ endpoint: "/api/jev-search", debounceMs: 100 })
  const input = useRef<HTMLInputElement>(null)
  const [touched, setTouched] = useState(false)
  const [palette, setPalette] = useState(false)
  const mod = useSyncExternalStore(
    () => () => {},
    () => (/mac|iphone|ipad/i.test(navigator.platform ?? "") ? "⌘" : "Ctrl"),
    () => "⌘",
  )

  // Type the first example on load so the page arrives already working.
  useEffect(() => {
    if (touched) return
    const q = EXAMPLES[0]
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      search.setQuery(q)
      return
    }
    let n = 0
    const t = window.setInterval(() => {
      search.setQuery(q.slice(0, ++n))
      if (n >= q.length) window.clearInterval(t)
    }, 42)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ⌘K opens the shipped palette component, same endpoint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const lexicalRank = useMemo(() => new Map(search.lexicalHits.map((h, i) => [h.id, i])), [search.lexicalHits])
  const judging = search.phase === "judging"
  const query = search.query.trim()

  // Keep the list the same length across the refine. Anything Jev ruled out
  // that was already on screen stays, dimmed, rather than vanishing.
  const hits = search.hits.slice(0, ROWS)
  const wasVisible = (h: { id: string }) => (lexicalRank.get(h.id) ?? 99) < ROWS
  const demoted = useMemo(() => {
    const room = ROWS - hits.length
    if (room <= 0) return []
    const seen = new Set(hits.map((h) => h.id))
    const pool = search.demoted.filter((h) => !seen.has(h.id))
    // rows the visitor could already see come back first
    return [...pool.filter(wasVisible), ...pool.filter((h) => !wasVisible(h))].slice(0, room)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.demoted, search.hits, lexicalRank])

  const listRef = useRef<HTMLUListElement>(null)
  useFlip(listRef, [hits, demoted], search.judged)

  const pick = (q: string) => {
    setTouched(true)
    search.setQuery(q)
    input.current?.focus()
  }

  return (
    <div className="hero-search">
      <div className="demo-field">
        <span className="material-symbols-rounded" aria-hidden>
          search
        </span>
        <input
          ref={input}
          value={search.query}
          onChange={(e) => {
            setTouched(true)
            search.setQuery(e.target.value)
          }}
          placeholder="Ask the TypeSafe docs a question…"
          aria-label="Search the TypeSafe documentation"
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button type="button" onClick={() => pick("")} aria-label="Clear">
            <span className="material-symbols-rounded" aria-hidden>
              close
            </span>
          </button>
        ) : null}
        <KbdGroup className="field-kbd">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </div>

      {query ? (
        <div className="hero-panel">
          <div data-slot="jev-search-progress" data-state={judging ? "on" : "off"} aria-hidden>
            <i />
          </div>
          <ul className="hitlist" ref={listRef}>
            {[...hits, ...demoted].map((h, i) => {
              const isDemoted = i >= hits.length
              const was = lexicalRank.get(h.id)
              const climbed = search.judged && !isDemoted && was !== undefined && was > i
              return (
                <li key={h.id} data-flip={h.id} className={isDemoted ? "demoted" : undefined}>
                  <span className="rank">{isDemoted ? "·" : i + 1}</span>
                  <span className="hit-main">
                    <a href={h.url} target="_blank" rel="noopener">
                      {h.title}
                    </a>
                    <small>
                      {h.section ?? "docs"}
                      {climbed ? <b className="climb">▲ {was! - i}</b> : null}
                      {isDemoted ? <b className="ruled-out">ruled out</b> : null}
                    </small>
                  </span>
                  {h.relevance !== undefined ? (
                    <span className="score">
                      <span className="bar">
                        <i style={{ width: `${Math.round(h.relevance * 100)}%` }} />
                      </span>
                      <em>{Math.round(h.relevance * 100)}</em>
                    </span>
                  ) : (
                    <span className="score">
                      <span className="bar ghost-bar">
                        <i style={{ width: "0%" }} />
                      </span>
                      <em>—</em>
                    </span>
                  )}
                </li>
              )
            })}
            {hits.length === 0 && !judging ? <li className="none">No page matches “{query}”.</li> : null}
          </ul>
          <p className={`hero-status${judging ? " working" : ""}`}>
            {judging ? (
              <>keyword order · jev is reading the top matches…</>
            ) : search.judged ? (
              <>
                jev read {search.judgedCount} candidates {search.cached ? "· cached" : `in ${search.jevMs} ms`} ·{" "}
                {Math.round((search.answerable ?? 0) * 100)}% sure the docs answer this
              </>
            ) : search.error ? (
              <>jev unreachable · keyword order stands</>
            ) : (
              <>keyword order</>
            )}
          </p>
        </div>
      ) : null}

      <div className="demo-presets">
        <span>try</span>
        {EXAMPLES.map((q) => (
          <button key={q} type="button" onClick={() => pick(q)}>
            {q}
          </button>
        ))}
      </div>

      <JevSearchDialog
        open={palette}
        onOpenChange={setPalette}
        endpoint="/api/jev-search"
        placeholder="Search the TypeSafe docs"
        suggestions={EXAMPLES}
        brand="jev"
      />
    </div>
  )
}
