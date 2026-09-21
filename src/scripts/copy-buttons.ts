// Adds an icon copy button to every code block (<pre>) on the page.
const COPY = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>'
const CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M3 8.5l3 3 7-7"/></svg>'

for (const pre of document.querySelectorAll<HTMLElement>("pre")) {
  if (pre.dataset.copyReady || pre.closest(".no-copy")) continue
  pre.dataset.copyReady = "1"
  const wrap = document.createElement("div")
  wrap.className = "copy-wrap"
  pre.parentNode?.insertBefore(wrap, pre)
  wrap.appendChild(pre)
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "copy-btn"
  btn.title = "Copy"
  btn.setAttribute("aria-label", "Copy code")
  btn.innerHTML = COPY
  let timer: number | undefined
  btn.addEventListener("click", async () => {
    const text = ((pre.querySelector("code") ?? pre).textContent ?? "").replace(/\n$/, "")
    try {
      await navigator.clipboard.writeText(text)
      btn.innerHTML = CHECK
      btn.classList.add("done")
      btn.setAttribute("aria-label", "Copied")
    } catch {
      btn.classList.add("failed")
    }
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      btn.innerHTML = COPY
      btn.classList.remove("done", "failed")
      btn.setAttribute("aria-label", "Copy code")
    }, 1500)
  })
  wrap.appendChild(btn)
}
