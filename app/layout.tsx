import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "jev-search — site search that understands the question",
  description:
    "A shadcn/ui registry component for site search. Keyword hits on the first keystroke, re-ranked by TypeSafe's Jev model a few hundred milliseconds later. One command to install.",
  openGraph: {
    title: "jev-search",
    description: "Drop-in React site search, ranked by intent. shadcn/ui registry compatible.",
    type: "website",
  },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          // Apply the stored or system theme before paint to avoid a flash.
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("theme");const d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch{}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
