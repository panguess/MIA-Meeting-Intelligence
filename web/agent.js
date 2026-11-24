// MIA Agent: turn any audio file into a transcript and meeting minutes.
// This file holds the Agent screens and the job list. Jobs (audio + text) are
// kept in IndexedDB on this iPhone. The transcription step is plugged in
// separately (see TRANSCRIBER below); until it is connected, new jobs wait.
(() => {
  "use strict";

  const DB_NAME = "mia-agent";
  const STORE = "jobs";
  const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

  const MINUTES_PROMPT = [
    "You are writing meeting minutes for a risk management team.",
    "Write the minutes in the same language as the transcript (usually Thai).",
    "Use these sections, in this order, as Markdown:",
    "## Overview (2-3 sentences)",
    "## Key points (bullets)",
    "## Decisions (bullets)",
    "## Action items (table: Task | Owner | Due date)",
    "## Open issues (bullets)",
    "## Risks raised (bullets)",
    "Only use facts from the transcript. If a name, number or date is unclear, write [verify].",
    "",
    "Transcript:"
  ].join("\n");

  // The transcription engine. Not connected yet: the next step wires a free
  // speech-to-text service here. It receives a job and reports progress.
  const TRANSCRIBER = { ready: false, name: "Not connected yet" };

  const state = { jobs: [], openId: null, tab: "transcript", lang: "th", db: null };
  const $ = id => document.getElementById(id);

  // ---------- storage ----------
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("No storage"));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const t = state.db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }
  const saveJob = job => tx("readwrite", s => s.put(job));
  const deleteJob = id => tx("readwrite", s => s.delete(id));
  const loadJobs = () => tx("readonly", s => s.getAll());

  // ---------- helpers ----------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDur(sec) {
    if (!sec || !isFinite(sec)) return "";
    const m = Math.round(sec / 60);
    return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : Math.max(1, m) + " min";
  }
  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  function statusOf(job) {
    if (job.minutes) return { label: "Minutes ready", tone: "mint", icon: "check" };
    if (job.transcript) return { label: "Transcript ready", tone: "sky", icon: "text" };
    if (job.status === "working") return { label: "Transcribing · " + Math.round(job.progress || 0) + "%", tone: "sun", icon: "pct" };
    if (job.status === "error") return { label: "Needs attention", tone: "peach", icon: "alert" };
    return { label: "Waiting to transcribe", tone: "lilac", icon: "wait" };
  }
  function audioDuration(blob) {
    return new Promise(resolve => {
      const a = document.createElement("audio");
      const url = URL.createObjectURL(blob);
      a.preload = "metadata";
      a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      a.src = url;
      setTimeout(() => resolve(0), 4000);
    });
  }
  function toast(msg) {
    const box = $("agentToast");
    box.textContent = msg;
    box.classList.add("show");
    clearTimeout(toast.h);
    toast.h = setTimeout(() => box.classList.remove("show"), 2200);
  }
  async function copyText(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch { toast("Couldn't copy. Try again."); }
  }

  const ICON = {
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    text: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
    wait: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6M12 17h0"/></svg>'
  };

  // ---------- list view ----------
  function renderList() {
    const list = $("agentJobs");
    const jobs = [...state.jobs].sort((a, b) => b.createdAt - a.createdAt);
    $("agentJobCount").textContent = jobs.length;
    if (!jobs.length) {
      list.innerHTML = '<div class="empty"><div class="empty-face" aria-hidden="true"><span class="eye"><i></i></span><span class="eye"><i></i></span></div>' +
        '<div class="empty-title">No jobs yet</div><div class="empty-hint">Add a recording above and MIA will get to work.</div></div>';
      return;
    }
    list.innerHTML = jobs.map(job => {
      const s = statusOf(job);
      const badge = s.icon === "pct" ? Math.round(job.progress || 0) + "%" : ICON[s.icon];
      const meta = [fmtDate(job.createdAt), fmtDur(job.duration), s.label].filter(Boolean).join(" · ");
      return '<button class="job" type="button" data-job="' + esc(job.id) + '">' +
        '<span class="job-badge ' + s.tone + '">' + badge + '</span>' +
        '<span class="job-text"><strong>' + esc(job.name) + '</strong><span>' + esc(meta) + '</span></span>' +
        '<svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m1.5 1.5 6 6-6 6"/></svg></button>';
    }).join("");
  }

  // ---------- detail view ----------
  function renderTranscript(text) {
    const lines = String(text).split(/\n+/).map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const m = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
      return m
        ? '<p class="line"><span class="stamp">' + esc(m[1]) + '</span><span>' + esc(m[2]) + '</span></p>'
        : '<p class="line"><span>' + esc(line) + '</span></p>';
    }).join("");
  }

  // Minimal Markdown for minutes pasted back from Claude: headings, bullets,
  // tables and [verify] tags. Everything is escaped first.
  function renderMinutes(md) {
    const out = [];
    let table = null, list = null;
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[verify\]/gi, '<span class="verify">verify</span>');
    const flush = () => {
      if (list) { out.push("<ul>" + list.join("") + "</ul>"); list = null; }
      if (table) {
        const rows = table.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r));
        const cells = r => r.replace(/^\s*\||\|\s*$/g, "").split("|").map(c => c.trim());
        const head = cells(rows[0] || "");
        out.push('<div class="table-box"><table><thead><tr>' + head.map(c => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>" +
          rows.slice(1).map(r => "<tr>" + cells(r).map(c => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
        table = null;
      }
    };
    for (const raw of String(md).split("\n")) {
      const line = raw.trim();
      if (line.startsWith("|")) { if (list) flush(); (table = table || []).push(line); continue; }
      if (table) flush();
      if (/^[-*•]\s+/.test(line)) { (list = list || []).push("<li>" + inline(line.replace(/^[-*•]\s+/, "")) + "</li>"); continue; }
      flush();
      if (/^#{1,4}\s+/.test(line)) out.push('<h3>' + inline(line.replace(/^#+\s+/, "")) + "</h3>");
      else if (line) out.push("<p>" + inline(line) + "</p>");
    }
    flush();
    return out.join("");
  }

  function minutesStats(md) {
    const section = name => {
      const m = String(md).split(/\n(?=#{1,4}\s)/).find(s => new RegExp("^#{1,4}\\s*" + name, "i").test(s.trim()));
      if (!m) return 0;
      const rows = m.split("\n").filter(l => /^\s*[-*•]\s+/.test(l)).length;
      const trs = m.split("\n").filter(l => /^\s*\|/.test(l) && !/^\s*\|?\s*:?-{2,}/.test(l)).length;
      return rows + Math.max(0, trs - 1);
    };
    return { decisions: section("Decisions"), actions: section("Action"), risks: section("Risk") };
  }

  function renderDetail() {
    const job = state.jobs.find(j => j.id === state.openId);
    const view = $("agentDetail");
    if (!job) { view.classList.add("hidden"); $("agentHome").classList.remove("hidden"); return; }
    $("agentHome").classList.add("hidden");
    view.classList.remove("hidden");

    $("detailTitle").textContent = job.name;
    const s = statusOf(job);
    $("detailPill").textContent = s.label;
    $("detailPill").className = "detail-pill " + s.tone;
    $("detailMeta").textContent = [fmtDate(job.createdAt), fmtDur(job.duration), job.lang === "en" ? "English" : job.lang === "mix" ? "Thai + English" : "Thai"].filter(Boolean).join(" · ");

    const done = !!job.transcript;
    $("detailWorking").classList.toggle("hidden", done);
    $("detailTabs").classList.toggle("hidden", !done);
    $("detailResult").classList.toggle("hidden", !done);
    $("detailBar").classList.toggle("hidden", !done);

    if (!done) {
      const pct = Math.round(job.progress || 0);
      $("ring").style.setProperty("--p", pct);
      $("ringPct").textContent = pct + "%";
      const working = job.status === "working";
      $("workTitle").textContent = working ? "Listening carefully…" : job.status === "error" ? "Something went wrong" : "Waiting to transcribe";
      $("workSub").textContent = working
        ? "Keep MIA open. Work is saved in 5-minute parts."
        : job.status === "error" ? (job.error || "Try again.") : TRANSCRIBER.ready ? "Starting soon." : "The transcription service isn't connected yet. Your audio is saved safely on this iPhone.";
      $("workLeft").textContent = working && job.eta ? "~ " + job.eta + " min" : "–";
      $("workHeard").textContent = working && job.heard ? job.heard : "–";
      const step = done ? 4 : working ? 2 : 1;
      $("workSteps").innerHTML = [
        ["Audio received", fmtDur(job.duration) || "Saved on this iPhone"],
        ["Transcribing", "In 5-minute parts, " + (job.lang === "en" ? "English" : "Thai")],
        ["Transcript ready", "Search, copy or share"],
        ["Meeting minutes", "Written by Claude"]
      ].map((st, i) => {
        const n = i + 1;
        const cls = n < step ? "done" : n === step ? "now" : "";
        return '<li class="' + cls + '"><span class="step-dot">' + (n < step ? ICON.check : n) + '</span><span><strong>' + st[0] + '</strong><span>' + st[1] + '</span></span></li>';
      }).join("");
      $("livePreview").classList.toggle("hidden", !job.preview);
      $("livePreviewText").textContent = job.preview || "";
      return;
    }

    const onMinutes = state.tab === "minutes";
    $("tabTranscript").setAttribute("aria-selected", String(!onMinutes));
    $("tabMinutes").setAttribute("aria-selected", String(onMinutes));
    $("tabMinutesDot").classList.toggle("hidden", !job.minutes);
    $("paneTranscript").classList.toggle("hidden", onMinutes);
    $("paneMinutes").classList.toggle("hidden", !onMinutes);

    if (!onMinutes) {
      const q = $("transcriptSearch").value.trim().toLowerCase();
      const text = q ? job.transcript.split("\n").filter(l => l.toLowerCase().includes(q)).join("\n") : job.transcript;
      $("transcriptBody").innerHTML = text.trim() ? renderTranscript(text) : '<p class="muted">No lines match.</p>';
      $("barPrimary").innerHTML = ICON.text.replace('width="18"', 'width="18"') + "<span>Copy for summary</span>";
      $("barPrimary").dataset.act = "copySummary";
      $("barSecondary").innerHTML = "<span>Open Claude</span>";
      $("barSecondary").dataset.act = "openClaude";
    } else {
      const has = !!job.minutes;
      $("minutesEmpty").classList.toggle("hidden", has);
      $("minutesFilled").classList.toggle("hidden", !has);
      if (has) {
        const st = minutesStats(job.minutes);
        $("statDecisions").textContent = st.decisions;
        $("statActions").textContent = st.actions;
        $("statRisks").textContent = st.risks;
        $("minutesBody").innerHTML = renderMinutes(job.minutes);
      }
      $("barPrimary").innerHTML = "<span>" + (has ? "Copy minutes" : "Copy for summary") + "</span>";
      $("barPrimary").dataset.act = has ? "copyMinutes" : "copySummary";
      $("barSecondary").innerHTML = "<span>" + (has ? "Share" : "Open Claude") + "</span>";
      $("barSecondary").dataset.act = has ? "shareMinutes" : "openClaude";
    }
  }

  function render() { renderList(); renderDetail(); }

  // ---------- actions ----------
  async function addFile(file) {
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) return toast("This file is too large (over 500 MB).");
    const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "Meeting " + fmtDate(Date.now());
    const job = {
      id: "job-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, createdAt: Date.now(), lang: state.lang,
      audio: file, audioType: file.type, size: file.size,
      duration: await audioDuration(file),
      status: "queued", progress: 0, transcript: "", minutes: ""
    };
    await saveJob(job);
    state.jobs.push(job);
    state.openId = job.id;
    state.tab = "transcript";
    render();
    window.scrollTo({ top: 0 });
  }

  function summaryText(job) { return MINUTES_PROMPT + "\n\n" + job.transcript.trim(); }

  async function act(name) {
    const job = state.jobs.find(j => j.id === state.openId);
    if (!job) return;
    if (name === "copySummary") return copyText(summaryText(job), "Copied. Paste it into Claude.");
    if (name === "openClaude") return window.open("https://claude.ai/new", "_blank", "noopener");
    if (name === "copyMinutes") return copyText(job.minutes, "Minutes copied");
    if (name === "shareMinutes") {
      if (navigator.share) { try { await navigator.share({ title: job.name, text: job.minutes }); } catch {} }
      else copyText(job.minutes, "Minutes copied");
    }
  }

  async function pasteMinutes() {
    const job = state.jobs.find(j => j.id === state.openId);
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch {}
    if (!text) text = window.prompt("Paste the minutes from Claude here:") || "";
    if (!text.trim()) return;
    job.minutes = text.trim();
    await saveJob(job);
    toast("Minutes added");
    render();
  }

  async function removeJob() {
    const job = state.jobs.find(j => j.id === state.openId);
    if (!job || !window.confirm("Delete this job? The audio, transcript and minutes will be removed from MIA.")) return;
    await deleteJob(job.id);
    state.jobs = state.jobs.filter(j => j.id !== job.id);
    state.openId = null;
    render();
  }

  // ---------- tabs between Record and Agent ----------
  function showView(name) {
    document.body.dataset.view = name;
    $("navRecord").setAttribute("aria-current", name === "record" ? "page" : "false");
    $("navAgent").setAttribute("aria-current", name === "agent" ? "page" : "false");
    try { localStorage.setItem("mia-view", name); } catch {}
    window.scrollTo({ top: 0 });
  }

  async function init() {
    $("navRecord").addEventListener("click", () => showView("record"));
    $("navAgent").addEventListener("click", () => showView("agent"));
    $("agentPick").addEventListener("click", () => $("agentFile").click());
    $("agentFile").addEventListener("change", e => { addFile(e.target.files[0]); e.target.value = ""; });
    $("agentLangs").addEventListener("click", e => {
      const b = e.target.closest("button[data-lang]");
      if (!b) return;
      state.lang = b.dataset.lang;
      for (const x of $("agentLangs").querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
    });
    $("agentJobs").addEventListener("click", e => {
      const b = e.target.closest("[data-job]");
      if (!b) return;
      state.openId = b.dataset.job; state.tab = "transcript";
      $("transcriptSearch").value = "";
      render(); window.scrollTo({ top: 0 });
    });
    $("detailBack").addEventListener("click", () => { state.openId = null; render(); });
    $("tabTranscript").addEventListener("click", () => { state.tab = "transcript"; renderDetail(); });
    $("tabMinutes").addEventListener("click", () => { state.tab = "minutes"; renderDetail(); });
    $("transcriptSearch").addEventListener("input", renderDetail);
    $("barPrimary").addEventListener("click", e => act(e.currentTarget.dataset.act));
    $("barSecondary").addEventListener("click", e => act(e.currentTarget.dataset.act));
    $("pasteMinutes").addEventListener("click", pasteMinutes);
    $("replaceMinutes").addEventListener("click", pasteMinutes);
    $("deleteJob").addEventListener("click", removeJob);

    let view = "record";
    try { view = localStorage.getItem("mia-view") || "record"; } catch {}
    showView(view === "agent" ? "agent" : "record");

    try {
      state.db = await openDb();
      state.jobs = await loadJobs();
    } catch {
      toast("Storage isn't available in this browser.");
    }
    render();
  }

  // Small hook for tests and screenshots.
  window.MIAAgent = { state, render, renderMinutes, renderTranscript, transcriber: TRANSCRIBER };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
