"use client"

/**
 * jev-search — a command-palette style site search that shows lexical hits
 * on the first keystroke and lets TypeSafe's Jev model re-rank them by intent
 * a couple of hundred milliseconds later.
 *
 *   <JevSearch endpoint="/api/jev-search" placeholder="Search docs…" />
 *
 * Styling uses shadcn/ui tokens. Override the accent with `--jev-accent`.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowDown, ArrowUp, Clock, CornerDownLeft, FileText, Hash, Search, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { highlightSegments, type SearchHit } from "@/lib/jev-search-core"
import { useJevSearch, type JevSearchState } from "@/hooks/use-jev-search"

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface JevSearchProps {
  /** Route that serves createJevSearchHandler. Default "/api/jev-search". */
  endpoint?: string
  placeholder?: string
  /** Key combined with ⌘ / Ctrl that opens the palette. Default "k". */
  hotkey?: string
  /** Called instead of navigating when a hit is chosen. */
  onSelect?: (hit: SearchHit) => void
  /** Example queries shown while the box is empty. */
  suggestions?: string[]
  /** Label used in the footer status. Default "jev". */
  brand?: string
  /** Remember the last few searches in localStorage. Default true. */
  recent?: boolean
  className?: string
  /** A custom trigger. Defaults to <JevSearchTrigger />. */
  children?: React.ReactNode
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Query to start with when the palette opens. */
  initialQuery?: string
}

export function JevSearch({ children, className, open: openProp, onOpenChange, ...dialog }: JevSearchProps) {
  const [openState, setOpenState] = React.useState(false)
  const open = openProp ?? openState
  const setOpen = React.useCallback(
    (next: boolean | ((o: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(open) : next
      setOpenState(value)
      onOpenChange?.(value)
    },
    [open, onOpenChange],
  )
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const hotkey = dialog.hotkey ?? "k"

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === hotkey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [hotkey, setOpen])

  return (
    <>
      <span
        ref={(el) => {
          triggerRef.current = el
        }}
        onClick={() => setOpen(true)}
        className="contents"
      >
        {children ?? <JevSearchTrigger className={className} placeholder={dialog.placeholder} hotkey={hotkey} />}
      </span>
      <JevSearchDialog
        {...dialog}
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            const el = triggerRef.current?.querySelector<HTMLElement>("button, a, [tabindex]")
            el?.focus()
          }
        }}
      />
    </>
  )
}

export interface JevSearchTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  placeholder?: string
  hotkey?: string
}

export function JevSearchTrigger({ placeholder = "Search…", hotkey = "k", className, ...props }: JevSearchTriggerProps) {
  const mod = useModifierKey()
  return (
    <button
      type="button"
      aria-label="Open search"
      className={cn(
        "inline-flex h-9 w-full max-w-72 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <Search className="size-4 shrink-0 opacity-70" aria-hidden />
      <span className="flex-1 truncate text-left">{placeholder}</span>
      <Kbd>
        {mod}
        {hotkey.toUpperCase()}
      </Kbd>
    </button>
  )
}

export interface JevSearchDialogProps extends Omit<JevSearchProps, "children" | "className" | "open" | "onOpenChange"> {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function JevSearchDialog({
  open,
  onOpenChange,
  endpoint,
  placeholder = "Search…",
  onSelect,
  suggestions = [],
  brand = "jev",
  recent = true,
  initialQuery,
}: JevSearchDialogProps) {
  const search = useJevSearch({ endpoint })
  const [activeRaw, setActive] = React.useState(0)
  const mounted = useMounted()
  const [recents, setRecents] = useRecentSearches(recent)
  const listRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Reset on open/close, lock scroll, focus the input.
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (initialQuery) search.setQuery(initialQuery)
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => {
      document.body.style.overflow = prev
      clearTimeout(t)
      search.reset()
      setActive(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keep the active row within range and in view.
  const hits = search.hits
  const active = Math.min(activeRaw, Math.max(hits.length - 1, 0))
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active, hits])

  const choose = React.useCallback(
    (hit: SearchHit) => {
      if (search.query.trim()) setRecents(search.query.trim())
      onOpenChange(false)
      if (onSelect) onSelect(hit)
      else window.location.assign(hit.url)
    },
    [onSelect, onOpenChange, search.query, setRecents],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActive((a) => (hits.length ? (a + 1) % hits.length : 0))
        break
      case "ArrowUp":
        e.preventDefault()
        setActive((a) => (hits.length ? (a - 1 + hits.length) % hits.length : 0))
        break
      case "Home":
        if (hits.length) {
          e.preventDefault()
          setActive(0)
        }
        break
      case "End":
        if (hits.length) {
          e.preventDefault()
          setActive(hits.length - 1)
        }
        break
      case "Enter":
        if (hits[active]) {
          e.preventDefault()
          choose(hits[active])
        }
        break
      case "Escape":
        e.preventDefault()
        onOpenChange(false)
        break
      case "Tab": {
        // Keep focus inside the panel.
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>("input, button, a[href]")
        if (!focusables?.length) break
        const list = Array.from(focusables)
        const i = list.indexOf(document.activeElement as HTMLElement)
        const next = e.shiftKey ? (i - 1 + list.length) % list.length : (i + 1) % list.length
        e.preventDefault()
        list[next]?.focus()
        break
      }
    }
  }

  if (!mounted || !open) return null

  const query = search.query.trim()
  const showEmptyState = query.length === 0
  const listboxId = "jev-search-listbox"

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] sm:pt-[15vh]"
      style={{ "--_jev-accent": "var(--jev-accent, oklch(0.82 0.19 128))" } as React.CSSProperties}
    >
      <style>{KEYFRAMES}</style>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] supports-[backdrop-filter]:bg-black/30 dark:bg-black/60"
        style={{ animation: "jev-fade 120ms ease-out" }}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site search"
        onKeyDown={onKeyDown}
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
        style={{ animation: "jev-pop 160ms cubic-bezier(.2,.9,.3,1.2)" }}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={hits[active] ? `jev-hit-${hits[active].id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={search.query}
            onChange={(e) => {
              search.setQuery(e.target.value)
              setActive(0)
            }}
            placeholder={placeholder}
            className="h-14 w-full flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-[15px]"
          />
          {search.query ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                search.setQuery("")
                inputRef.current?.focus()
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <Kbd onClick={() => onOpenChange(false)}>esc</Kbd>
        </div>

        {/* Body */}
        <div ref={listRef} id={listboxId} role="listbox" className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain p-2">
          {showEmptyState ? (
            <EmptyState
              suggestions={suggestions}
              recents={recents}
              onPick={(q) => {
                search.setQuery(q)
                setActive(0)
              }}
              brand={brand}
            />
          ) : hits.length === 0 && search.phase !== "lexical" && search.phase !== "idle" ? (
            <NoResults query={query} search={search} brand={brand} />
          ) : (
            <Results hits={hits} active={active} setActive={setActive} choose={choose} judged={search.judged} judging={search.phase === "judging"} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="hidden items-center gap-1 sm:inline-flex">
            <Kbd>
              <ArrowUp className="size-3" />
            </Kbd>
            <Kbd>
              <ArrowDown className="size-3" />
            </Kbd>
            <span className="ml-1">navigate</span>
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>
            <span className="ml-1">open</span>
          </span>
          <Status search={search} brand={brand} className="ml-auto" />
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Results({
  hits,
  active,
  setActive,
  choose,
  judged,
  judging,
}: {
  hits: SearchHit[]
  active: number
  setActive: (i: number) => void
  choose: (h: SearchHit) => void
  judged: boolean
  judging: boolean
}) {
  useFlip(hits)
  // Group by section, preserving rank order within and across groups.
  const groups: { section: string; items: { hit: SearchHit; index: number }[] }[] = []
  hits.forEach((hit, index) => {
    const section = hit.section ?? ""
    let g = groups.find((x) => x.section === section)
    if (!g) {
      g = { section, items: [] }
      groups.push(g)
    }
    g.items.push({ hit, index })
  })

  return (
    <>
      {groups.map((g) => (
        <div key={g.section || "_"} role="group" aria-label={g.section || undefined}>
          {g.section ? (
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.section}</div>
          ) : null}
          {g.items.map(({ hit, index }) => (
            <Row
              key={hit.id}
              hit={hit}
              index={index}
              active={index === active}
              onHover={() => setActive(index)}
              onChoose={() => choose(hit)}
              judged={judged}
              judging={judging}
            />
          ))}
        </div>
      ))}
    </>
  )
}

function Row({
  hit,
  index,
  active,
  onHover,
  onChoose,
  judged,
  judging,
}: {
  hit: SearchHit
  index: number
  active: boolean
  onHover: () => void
  onChoose: () => void
  judged: boolean
  judging: boolean
}) {
  const isAnchor = hit.url.includes("#")
  const Icon = isAnchor ? Hash : FileText
  return (
    <a
      id={`jev-hit-${hit.id}`}
      href={hit.url}
      role="option"
      aria-selected={active}
      data-index={index}
      data-flip={hit.id}
      onMouseMove={onHover}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onChoose()
      }}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
          active && "border-transparent bg-[var(--_jev-accent)] text-black",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-5">
          <Highlight text={hit.title} terms={hit.terms} />
        </span>
        {hit.description ? (
          <span className="block truncate text-xs text-muted-foreground">
            <Highlight text={hit.description} terms={hit.terms} />
          </span>
        ) : null}
      </span>
      <Meter value={hit.relevance} judged={judged} judging={judging} />
    </a>
  )
}

/** A tiny relevance meter. Shimmers while Jev thinks, then fills. */
function Meter({ value, judged, judging }: { value?: number; judged: boolean; judging: boolean }) {
  if (!judged && !judging) return null
  if (!judged || value === undefined) {
    return (
      <span
        className="h-1.5 w-12 shrink-0 rounded-full bg-muted"
        style={{
          backgroundImage: "linear-gradient(90deg, transparent 0%, color-mix(in oklch, var(--_jev-accent) 60%, transparent) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "jev-shimmer 1.1s linear infinite",
        }}
        aria-hidden
      />
    )
  }
  const pct = Math.round(value * 100)
  return (
    <span className="flex shrink-0 items-center gap-2" title={`jev relevance ${pct}%`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `color-mix(in oklch, var(--_jev-accent) ${40 + pct * 0.6}%, var(--muted-foreground))`,
            animation: "jev-grow 400ms cubic-bezier(.2,.8,.2,1)",
            transformOrigin: "left",
          }}
        />
      </span>
      <span className="w-8 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </span>
  )
}

function Status({ search, brand, className }: { search: JevSearchState; brand: string; className?: string }) {
  const { phase, jevMs, judgedCount, cached, error, answerable } = search
  const q = search.query.trim()
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 truncate", className)}>
      {phase === "judging" ? (
        <>
          <Sparkles className="size-3 shrink-0" style={{ color: "var(--_jev-accent)" }} aria-hidden />
          <span className="jev-shimmer-text">{brand} is reading the top matches…</span>
        </>
      ) : phase === "done" ? (
        <>
          <Sparkles className="size-3 shrink-0" style={{ color: "var(--_jev-accent)" }} aria-hidden />
          <span>
            {brand} ranked {judgedCount} {judgedCount === 1 ? "page" : "pages"}
            {cached ? " · cached" : ` in ${jevMs} ms`}
            {answerable !== undefined && answerable < 0.35 ? " · low confidence" : ""}
          </span>
        </>
      ) : phase === "error" ? (
        <span className="text-destructive" title={error}>
          keyword ranking only
        </span>
      ) : q.length === 0 ? (
        <span>Ask in plain English</span>
      ) : null}
    </span>
  )
}

function EmptyState({
  suggestions,
  recents,
  onPick,
  brand,
}: {
  suggestions: string[]
  recents: string[]
  onPick: (q: string) => void
  brand: string
}) {
  if (suggestions.length === 0 && recents.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
        Type to search. Plain questions work — {brand} reads the pages, not just the words.
      </p>
    )
  }
  return (
    <div className="space-y-3 p-1">
      {recents.length > 0 ? (
        <div>
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recent</div>
          {recents.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onPick(r)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
            >
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <span className="truncate">{r}</span>
            </button>
          ))}
        </div>
      ) : null}
      {suggestions.length > 0 ? (
        <div>
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Try asking</div>
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground/80 transition-colors hover:border-[var(--_jev-accent)] hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NoResults({ query, search, brand }: { query: string; search: JevSearchState; brand: string }) {
  return (
    <div className="px-3 py-10 text-center text-sm text-muted-foreground">
      <p>
        Nothing matches <span className="font-medium text-foreground">“{query}”</span>.
      </p>
      {search.judged && (search.answerable ?? 1) < 0.35 ? (
        <p className="mt-1 text-xs">{brand} doesn’t think this site covers that yet.</p>
      ) : (
        <p className="mt-1 text-xs">Try different words, or ask it as a question.</p>
      )}
    </div>
  )
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const segs = highlightSegments(text, terms)
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className="bg-transparent font-semibold text-inherit underline decoration-[var(--_jev-accent)] decoration-2 underline-offset-2"
          >
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  )
}

function Kbd({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "kbd"
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
    >
      {children}
    </Tag>
  )
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

const noop = () => () => {}

function useMounted() {
  return React.useSyncExternalStore(noop, () => true, () => false)
}

function useModifierKey() {
  return React.useSyncExternalStore(
    noop,
    () => {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
      const platform = nav.userAgentData?.platform ?? navigator.platform ?? ""
      return /mac|iphone|ipad/i.test(platform) ? "⌘" : "Ctrl+"
    },
    () => "⌘",
  )
}

const RECENT_KEY = "jev-search:recent"

function useRecentSearches(enabled: boolean): [string[], (q: string) => void] {
  const [recents, setRecents] = React.useState<string[]>(() => {
    if (!enabled || typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const add = React.useCallback(
    (q: string) => {
      if (!enabled) return
      setRecents((prev) => {
        const next = [q, ...prev.filter((p) => p.toLowerCase() !== q.toLowerCase())].slice(0, 5)
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [enabled],
  )
  return [recents, add]
}

/**
 * FLIP animation: when Jev reorders the list, rows glide from their previous
 * position to the new one instead of jumping.
 */
function useFlip(hits: SearchHit[]) {
  const positions = React.useRef(new Map<string, number>())
  React.useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const els = document.querySelectorAll<HTMLElement>("[data-flip]")
    const next = new Map<string, number>()
    els.forEach((el) => {
      const id = el.dataset.flip!
      const top = el.getBoundingClientRect().top
      next.set(id, top)
      const prev = positions.current.get(id)
      if (!reduce && prev !== undefined && prev !== top) {
        const dy = prev - top
        el.style.transition = "none"
        el.style.transform = `translateY(${dy}px)`
        requestAnimationFrame(() => {
          el.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)"
          el.style.transform = ""
        })
      }
    })
    positions.current = next
  }, [hits])
}

const KEYFRAMES = `
@keyframes jev-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes jev-pop { from { opacity: 0; transform: translateY(-6px) scale(.985) } to { opacity: 1; transform: none } }
@keyframes jev-shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
@keyframes jev-grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.jev-shimmer-text {
  background: linear-gradient(90deg, currentColor 0%, currentColor 40%, var(--_jev-accent) 50%, currentColor 60%, currentColor 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: jev-shimmer 1.4s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .jev-shimmer-text { animation: none; color: inherit; background: none; }
}
`
