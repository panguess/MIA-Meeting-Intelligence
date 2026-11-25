// Quiet screen: an optional plain, dark cover shown while recording, so the
// phone screen does not show MIA's recorder to people nearby. It is only a
// visual cover. Recording, live text and saving work exactly as before, and the
// recording is not hidden from anyone who asks: one tap shows MIA again.
// Off by default; Settings → Screen → Quiet screen.
(() => {
  "use strict";
  const KEY = "mia-quiet";
  const IDLE_MS = 20000; // after a tap, the cover comes back after 20 s untouched
  const $ = id => document.getElementById(id);
  const body = document.body;
  const isOn = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
  const active = () => body.classList.contains("is-recording") || body.classList.contains("is-paused");

  const cover = document.createElement("div");
  cover.className = "quiet hidden";
  cover.setAttribute("role", "button");
  cover.setAttribute("aria-label", "Show MIA");
  cover.tabIndex = 0;
  cover.innerHTML = '<div class="q-clock" id="qClock"></div><div class="q-time" id="qTime"></div><div class="q-hint">Tap to open</div>';
  body.append(cover);

  let revealed = false;
  let idle = null;
  let tick = null;

  function paint() {
    const d = new Date();
    $("qClock").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    $("qTime").textContent = $("timer") ? $("timer").textContent : "";
  }

  const theme = document.querySelector('meta[name="theme-color"]');
  const themeColor = theme ? theme.content : "";
  function show(yes) {
    cover.classList.toggle("hidden", !yes);
    if (theme) theme.content = yes ? "#000000" : themeColor;
    body.classList.toggle("quiet-on", yes);
    clearInterval(tick); tick = null;
    if (yes) { paint(); tick = setInterval(paint, 1000); }
  }

  function armIdle() {
    clearTimeout(idle);
    idle = setTimeout(() => { revealed = false; update(); }, IDLE_MS);
  }

  function update() {
    const dialogOpen = !!document.querySelector("dialog[open]");
    const want = isOn() && active() && !revealed && !dialogOpen;
    show(want);
    const dim = $("dimButton");
    if (dim) dim.classList.toggle("hidden", !(isOn() && active()));
    if (!active()) { revealed = false; clearTimeout(idle); }
  }

  function reveal() { revealed = true; update(); armIdle(); }
  cover.addEventListener("click", reveal);
  cover.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(); } });
  // Any use of MIA while it is showing keeps the cover away a little longer.
  document.addEventListener("pointerdown", () => { if (revealed) armIdle(); }, true);

  const dim = $("dimButton");
  if (dim) dim.addEventListener("click", () => { revealed = false; clearTimeout(idle); update(); });

  // Settings toggle (Off / On).
  const toggle = $("quietToggle");
  function paintToggle() {
    if (!toggle) return;
    for (const b of toggle.querySelectorAll("button")) b.setAttribute("aria-pressed", String((b.dataset.quiet === "1") === isOn()));
  }
  if (toggle) toggle.addEventListener("click", e => {
    const b = e.target.closest("button[data-quiet]");
    if (!b) return;
    try { b.dataset.quiet === "1" ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {}
    paintToggle(); update();
  });
  paintToggle();

  new MutationObserver(update).observe(body, { attributes: true, attributeFilter: ["class"] });
  // A new warning (e.g. the mic was interrupted) is shown, not covered.
  if ($("warning")) new MutationObserver(() => { if (active() && $("warning").textContent.trim()) reveal(); })
    .observe($("warning"), { childList: true, characterData: true, subtree: true });
  for (const d of document.querySelectorAll("dialog")) new MutationObserver(update).observe(d, { attributes: true, attributeFilter: ["open"] });
  update();
})();
