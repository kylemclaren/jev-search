"use client"

import * as React from "react"
import { Check, Copy, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = React.useState(false)
  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          /* clipboard blocked */
        }
      }}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:text-foreground",
        className,
      )}
    >
      {done ? <Check className="size-4" style={{ color: "var(--jev-accent)" }} /> : <Copy className="size-4" />}
    </button>
  )
}

/** A one-line shell command with a copy button. */
export function Command({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border border-border bg-muted/50 py-2 pl-4 pr-2 font-mono text-sm", className)}>
      <span className="select-none text-muted-foreground">$</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{children}</code>
      <CopyButton text={children} />
    </div>
  )
}

export function ThemeToggle() {
  const [override, setOverride] = React.useState<boolean | null>(null)
  const initial = React.useSyncExternalStore(
    () => () => {},
    () => document.documentElement.classList.contains("dark"),
    () => false,
  )
  const dark = override ?? initial
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => {
        const next = !dark
        setOverride(next)
        document.documentElement.classList.toggle("dark", next)
        try {
          localStorage.setItem("theme", next ? "dark" : "light")
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}

/** The registry URL, derived from the page origin so it is right wherever this is deployed. */
export function RegistryCommand({ item = "jev-search" }: { item?: string }) {
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => process.env.NEXT_PUBLIC_SITE_URL || window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? ""),
    () => process.env.NEXT_PUBLIC_SITE_URL ?? "",
  )
  return <Command>{`npx shadcn@latest add ${origin || "https://jev-search.dev"}/r/${item}.json`}</Command>
}
