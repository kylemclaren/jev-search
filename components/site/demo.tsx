"use client"

import * as React from "react"
import { Search, Sparkles } from "lucide-react"
import { JevSearch } from "@/components/jev-search"
import { cn } from "@/lib/utils"

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const EXAMPLES = [
  "how much does it cost",
  "can an agent write to the database",
  "sort tickets by how urgent they are",
  "does it need a postgres extension",
  "instal on mac",
]

/** The hero demo: a big search bar wired to the jevQL documentation index. */
export function HeroDemo({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [initialQuery, setInitialQuery] = React.useState<string | undefined>()
  const mod = React.useSyncExternalStore(
    () => () => {},
    () => (/mac|iphone|ipad/i.test(navigator.platform ?? "") ? "⌘" : "Ctrl+"),
    () => "⌘",
  )

  const openWith = (q?: string) => {
    setInitialQuery(q)
    setOpen(true)
  }

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      <JevSearch
        endpoint={`${BASE}/api/jev-search`}
        placeholder="Search the jevQL docs…"
        suggestions={EXAMPLES}
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setInitialQuery(undefined)
        }}
        initialQuery={initialQuery}
      >
        <button
          type="button"
          onClick={() => openWith()}
          className="group relative flex h-14 w-full items-center gap-3 rounded-2xl border border-border bg-background/80 px-4 text-left text-base text-muted-foreground shadow-lg shadow-black/5 ring-1 ring-black/5 backdrop-blur transition hover:border-foreground/20 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 dark:ring-white/10 dark:shadow-black/40"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity group-hover:opacity-100"
            style={{ boxShadow: "0 0 0 1px color-mix(in oklch, var(--jev-accent) 60%, transparent), 0 0 40px -10px var(--jev-accent)" }}
          />
          <Search className="size-5 shrink-0" aria-hidden />
          <span className="flex-1 truncate">Ask the jevQL docs anything…</span>
          <span className="hidden items-center gap-1 sm:flex">
            <kbd className="inline-flex h-6 items-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] font-medium">
              {mod}K
            </kbd>
          </span>
        </button>
      </JevSearch>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Sparkles className="size-3.5" style={{ color: "var(--jev-accent)" }} aria-hidden /> try
        </span>
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => openWith(q)}
            className="rounded-full border border-border bg-background px-3 py-1 text-foreground/80 transition hover:border-[var(--jev-accent)] hover:bg-accent"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
