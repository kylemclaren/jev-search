import { createJevSearchHandler } from "@/lib/jev-search-server"
import documents from "@/lib/jev-search-index.json"

// Build lib/jev-search-index.json with `bunx tsx scripts/jev-search-index.ts`
// or hand it any SearchDocument[] you like. TYPESAFE_API_KEY must be set.
const handler = createJevSearchHandler({ documents })

export const GET = handler
export const POST = handler
