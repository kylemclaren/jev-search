// @ts-check
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import node from "@astrojs/node"

// https://astro.build/config
export default defineConfig({
  site: "https://jev-pg-dvft.sprites.app",
  // Static pages plus one on-demand endpoint (src/pages/api/jev-search.ts).
  adapter: node({ mode: "standalone" }),
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: true },
  },
  server: { host: true, port: 4321 },
  integrations: [react()],
})
