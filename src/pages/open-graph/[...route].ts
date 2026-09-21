import { OGImageRoute } from "astro-og-canvas"

// The social card in the hero's look: paper background, ink type, lime accent.
export const { getStaticPaths, GET } = await OGImageRoute({
  pages: {
    index: {
      title: "Site search, re-ranked by a model.",
      description: "npx shadcn@latest add …/r/jev-search.json\n\nKeyword hits on the first keystroke. Re-ranked by Jev a few hundred milliseconds later.",
    },
  },
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[247, 246, 240]],
    border: { color: [238, 91, 166], width: 36, side: "inline-start" },
    padding: 72,
    font: {
      title: { size: 88, lineHeight: 0.98, weight: "Black", color: [23, 23, 21], families: ["Inter"] },
      description: { size: 30, lineHeight: 1.35, weight: "Medium", color: [102, 100, 94], families: ["JetBrains Mono"] },
    },
    logo: { path: "./src/assets/og-logo.png", size: [96] },
    fonts: [
      "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf",
      "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.ttf",
    ],
  }),
})
