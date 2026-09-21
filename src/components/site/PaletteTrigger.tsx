import { useSyncExternalStore } from "react"
import { JevSearch } from "@/components/jev-search"

const SUGGESTIONS = [
  "how much does it cost",
  "use it from claude code",
  "what data leaves my machine",
  "run one shared server for my team",
]

/**
 * The shipped component, unmodified, behind a masthead button. It looks like
 * the rest of this site only because the site's CSS dresses its data-slots.
 */
export default function PaletteTrigger() {
  const mac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/i.test(navigator.platform ?? ""),
    () => true,
  )
  return (
    <JevSearch endpoint="/api/jev-search" placeholder="Search the jevQL docs" suggestions={SUGGESTIONS} brand="jev">
      <button type="button" className="search-btn" aria-label="Search">
        <span className="material-symbols-rounded" aria-hidden style={{ fontSize: "1rem" }}>
          search
        </span>
        <span>search</span>
        <kbd>{mac ? "⌘" : "ctrl"} K</kbd>
      </button>
    </JevSearch>
  )
}
