// MIA Agent: turn any audio file into a transcript and meeting minutes.
// This file holds the Agent screens and the job list. Jobs (audio + text) are
// kept in IndexedDB on this iPhone. The transcription step is plugged in
// with Groq's free tier (see GROQ below). Nothing runs until the user adds a key.
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

  // ---------- Groq (free tier) ----------
  // Speech-to-text: whisper-large-v3. Minutes: openai/gpt-oss-120b.
  // Free tier limits (Nov 2026): 25 MB per audio file, 7,200 audio seconds per
  // hour, 8K tokens per minute for the text model. So audio is cut into
  // 5-minute WAV parts (16 kHz mono, about 9.6 MB each) and the minutes are
  // written in small steps: short notes per part, then one final pass.
  // The API key is kept only in this browser (localStorage).
  const GROQ = "https://api.groq.com/openai/v1";
  const STT_MODEL = "whisper-large-v3";
  const LLM_MODEL = "openai/gpt-oss-120b";
  const PART_SECONDS = 300;
  const DIRECT_UPLOAD_MAX = 24 * 1024 * 1024;
  const KEY_NAME = "mia-groq-key";
  const ONE_SHOT_CHARS = 7000;   // short meetings: one call, no per-part notes
  const NOTES_BATCH_CHARS = 9000;

  const getKey = () => { try { return localStorage.getItem(KEY_NAME) || ""; } catch { return ""; } };
  const setKey = k => { try { k ? localStorage.setItem(KEY_NAME, k) : localStorage.removeItem(KEY_NAME); } catch {} };
  const getTerms = () => { try { return (localStorage.getItem("mia-terms") || "").trim(); } catch { return ""; } };
  const TRANSCRIBER = { get ready() { return !!getKey(); }, name: "Groq" };

  // Two engines heard the same audio. Typhoon (SCB 10X) is trained for Thai
  // but writes English words in Thai letters and has no fine time stamps;
  // Whisper keeps English words and time stamps but mishears Thai more.
  const MERGE_PROMPT = [
    "You combine two speech-to-text transcripts of the SAME Thai audio (Thai speech mixed with English words).",
    "Transcript A (Whisper) has [mm:ss] time stamps and keeps English words, but often mishears Thai.",
    "Transcript B (Typhoon) is more accurate for Thai words, but writes English words in Thai letters; it is split by minute.",
    "Write transcript A again line by line, keeping every [mm:ss] time stamp, but correct the Thai wording using B,",
    "and write English terms in English letters (e.g. B's 'ริสก์' -> 'risk').",
    "Do not summarise, translate, add or remove content. If the two disagree and you are unsure, prefer B for Thai.",
    "Output only the corrected lines."
  ].join("\n");
  const CLEAN_PROMPT = [
    "You fix a speech-to-text transcript of Thai speech mixed with English words.",
    "Correct words that were clearly misheard, using the context (Thai spelling, English terms, names, numbers).",
    "Write English terms in English letters when the speaker said an English word.",
    "Do not summarise, translate, add or remove content. Keep every line and its [mm:ss] time stamp at the start.",
    "If unsure about a word, leave it as it is. Output only the corrected lines."
  ].join("\n");
  const PART_PROMPT = [
    "You take notes from one part of a transcript of a meeting, presentation or lecture (Thai and/or English).",
    "Write at most 12 short bullets in the transcript's language.",
    "Prefix bullets: DECISION:, ACTION: (with owner and due date if said), RISK:, ISSUE:, or none for key points.",
    "Keep names, numbers and dates exactly as said. Mark anything unclear with [verify].",
    "No introduction, no closing line."
  ].join("\n");
  const TALK_FORMAT = [
    "## Overview  (2-3 sentences: topic, speaker if known, purpose)",
    "## Key points  (bullets, in the order presented)",
    "## Details  (### one sub-heading per topic, bullets under each)",
    "## Q&A  (bullets: question → answer; write - None if none)",
    "## Takeaways  (3-5 bullets)"
  ].join("\n");
  const FINAL_PROMPT = [
    "You write meeting minutes for a risk management team, from the notes or transcript provided.",
    "Keep the section headings below in English, exactly:",
    "## Overview  (2-3 sentences)",
    "## Key points  (bullets)",
    "## Decisions  (bullets; write - None if none)",
    "## Action items  (Markdown table with columns: Task | Owner | Due date)",
    "## Open issues  (bullets)",
    "## Risks raised  (bullets)",
    "Use only facts from the input. If a name, number or date is unclear or missing, write [verify].",
    "Output only the Markdown. No introduction."
  ].join("\n");

  const savedOut = (() => { try { return localStorage.getItem("mia-out-lang"); } catch { return null; } })();
  const state = { jobs: [], openId: null, tab: "transcript", lang: "mix", out: savedOut === "en" ? "en" : "th", db: null };
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
    if (job.status === "working") return { label: (job.stage === "minutes" ? "Writing minutes" : "Working") + " · " + Math.round(job.progress || 0) + "%", tone: "sun", icon: "pct" };
    if (job.status === "error") return { label: "Needs attention", tone: "peach", icon: "alert" };
    if (job.status === "paused") return { label: "Paused · " + Math.round(job.progress || 0) + "%", tone: "lilac", icon: "pct" };
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
    $("detailMeta").textContent = [fmtDate(job.createdAt), fmtDur(job.duration), "Thai + English"].filter(Boolean).join(" · ");

    const done = !!job.transcript && (job.transcriptComplete || job.status === "done");
    $("detailWorking").classList.toggle("hidden", done);
    $("detailTabs").classList.toggle("hidden", !done);
    $("detailResult").classList.toggle("hidden", !done);
    $("detailBar").classList.toggle("hidden", !done);

    if (!done) {
      const pct = Math.round(job.progress || 0);
      $("ring").style.setProperty("--p", pct);
      $("ringPct").textContent = pct + "%";
      const working = job.status === "working";
      const ready = TRANSCRIBER.ready;
      $("workTitle").textContent = working ? (job.stage === "minutes" ? "Writing your minutes…" : "Listening carefully…")
        : job.status === "error" ? "Something went wrong" : job.status === "paused" ? "Paused" : ready ? "Ready to start" : "One-time setup needed";
      $("workSub").textContent = working
        ? (waitNote || "Keep MIA open on screen. Work is saved in 5-minute parts.")
        : job.status === "error" ? (job.error || "Try again.")
        : job.status === "paused" ? "Saved so far. Tap Continue to pick up where it stopped."
        : ready ? "Your audio is saved on this iPhone." : "Connect the free Groq service once, then MIA does the rest.";
      const go = $("workGo");
      go.classList.toggle("hidden", working);
      go.textContent = !ready ? "Set up Groq · free" : job.status === "paused" || (job.parts && job.parts.length) ? "Continue" : job.status === "error" ? "Try again" : "Start";
      $("workLeft").textContent = working && job.eta ? "~ " + job.eta + " min" : "–";
      $("workHeard").textContent = working && job.heard ? job.heard : "–";
      const step = job.stage === "minutes" ? 4 : (job.parts && job.parts.length) || working ? 2 : 1;
      $("workSteps").innerHTML = [
        ["Audio received", fmtDur(job.duration) || "Saved on this iPhone"],
        ["Transcribing", "In 5-minute parts, Thai + English"],
        ["Transcript ready", "Search, copy or share"],
        ["Meeting minutes", "Written automatically"]
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
      const busy = job.status === "working";
      $("writeMinutes").classList.toggle("hidden", busy);
      $("writeMinutes").textContent = TRANSCRIBER.ready ? (busy ? "Writing…" : "Write minutes now") : "Set up Groq · free";
      $("minutesEmptyTitle").textContent = busy ? "Writing your minutes…" : "No minutes yet";
      $("minutesFilled").classList.toggle("hidden", !has);
      if (has) {
        const st = minutesStats(job.minutes);
        $("statDecisions").textContent = st.decisions;
        $("statActions").textContent = st.actions;
        $("statRisks").textContent = st.risks;
        $("minutesBody").innerHTML = renderMinutes(job.minutes);
        const kind = job.detectedKind || (job.kind && job.kind !== "auto" ? job.kind : "meeting");
        for (const x of $("jobKind").querySelectorAll("button")) x.setAttribute("aria-pressed", String(x.dataset.kind === kind));
        $("kindNote").textContent = job.kind && job.kind !== "auto" ? "Set by you" : "Auto-detected";
        $("mStats").classList.toggle("hidden", kind === "talk");
        const out = job.outLang || (job.lang === "en" ? "en" : "th");
        for (const x of $("jobOut").querySelectorAll("button")) x.setAttribute("aria-pressed", String(x.dataset.out === out));
      }
      $("barPrimary").innerHTML = "<span>" + (has ? "Copy minutes" : "Copy for summary") + "</span>";
      $("barPrimary").dataset.act = has ? "copyMinutes" : "copySummary";
      $("barSecondary").innerHTML = "<span>" + (has ? "Share" : "Open Claude") + "</span>";
      $("barSecondary").dataset.act = has ? "shareMinutes" : "openClaude";
    }
  }


  // ---------- engine ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  class KeyError extends Error {}

  async function groq(path, body, attempt = 0) {
    const key = getKey();
    if (!key) throw new KeyError("Set up Groq first.");
    let res;
    try {
      // A request that hangs (weak signal, iOS suspending the page) is
      // abandoned after 3 minutes and retried, so the queue never gets stuck.
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 180000);
      try {
        res = await fetch(GROQ + path, {
          method: "POST",
          headers: body instanceof FormData ? { Authorization: "Bearer " + key } : { Authorization: "Bearer " + key, "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
          signal: ctl.signal
        });
      } finally { clearTimeout(timer); }
    } catch {
      if (attempt < 6) { await sleep(5000 * (attempt + 1)); return groq(path, body, attempt + 1); }
      throw new Error("No internet connection. Tap Continue when you're back online.");
    }
    if (res.status === 401 || res.status === 403) throw new KeyError("Groq didn't accept the key. Check it in Settings.");
    if ((res.status === 429 || res.status >= 500) && attempt < 10) {
      const wait = parseFloat(res.headers.get("retry-after")) || 15 * (attempt + 1);
      setWaitNote(res.status === 429 ? "Free limit reached for a moment. Waiting " + Math.ceil(wait) + " s…" : "Groq is busy. Retrying…");
      await sleep(Math.min(wait, 120) * 1000);
      setWaitNote("");
      return groq(path, body, attempt + 1);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || "Groq error " + res.status);
    return data;
  }

  let waitNote = "";
  function setWaitNote(t) { waitNote = t; renderDetail(); }

  function stamp(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(s).padStart(2, "0");
  }

  function wav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, "data"); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const x = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  // Returns { count, part(i) -> { blob, offset } }. Decodes at 16 kHz and cuts
  // 5-minute parts. If this iPhone can't decode the file, a file under 24 MB is
  // sent whole instead.
  async function splitAudio(blob) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ sampleRate: 16000 });
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      ctx.close && ctx.close();
      const rate = audio.sampleRate, size = PART_SECONDS * rate;
      const chans = [...Array(audio.numberOfChannels)].map((_, c) => audio.getChannelData(c));
      return {
        duration: audio.duration,
        count: Math.max(1, Math.ceil(audio.length / size)),
        part(i) {
          const start = i * size, end = Math.min(audio.length, start + size);
          const mono = new Float32Array(end - start);
          for (const ch of chans) for (let j = 0; j < mono.length; j++) mono[j] += ch[start + j] / chans.length;
          return { blob: wav(mono, rate), offset: i * PART_SECONDS, samples: mono, rate };
        }
      };
    } catch {
      if (blob.size > DIRECT_UPLOAD_MAX) throw new Error("This iPhone couldn't open this audio file. Try exporting it as m4a, or split it into shorter files.");
      return { duration: 0, count: 1, part: () => ({ blob, offset: 0, name: "audio" }) };
    }
  }

  // ---------- Typhoon ASR (optional, Thai accuracy boost) ----------
  const TYPHOON = "https://api.opentyphoon.ai/v1";
  const TYPHOON_KEY = "mia-typhoon-key";
  const getTyphoonKey = () => { try { return localStorage.getItem(TYPHOON_KEY) || ""; } catch { return ""; } };
  async function typhoonFile(blob, attempt = 0) {
    const form = new FormData();
    form.append("file", blob, "part.wav");
    form.append("model", "typhoon-asr-realtime");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90000);
    let res;
    try {
      res = await fetch(TYPHOON + "/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + getTyphoonKey() }, body: form, signal: ctl.signal });
    } finally { clearTimeout(timer); }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(5000 * (attempt + 1)); return typhoonFile(blob, attempt + 1); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error("Typhoon " + res.status);
    return (data.text || "").trim();
  }
  // One-minute pieces keep each upload small and give rough time anchors.
  async function typhoonPart(p) {
    if (!p.samples) throw new Error("Typhoon needs decoded audio");
    const step = 60 * p.rate, out = [];
    for (let s = 0, k = 0; s < p.samples.length; s += step, k++) {
      const text = await typhoonFile(wav(p.samples.subarray(s, Math.min(p.samples.length, s + step)), p.rate));
      if (text) out.push("[" + stamp(p.offset + k * 60) + "] " + text);
    }
    return out.join("\n");
  }

  async function transcribePart(blob, offset, lang, name) {
    const form = new FormData();
    form.append("file", blob, (name || "part") + (blob.type === "audio/wav" ? ".wav" : ".m4a"));
    form.append("model", STT_MODEL);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    // Meetings are Thai with English terms mixed in. Fixing the language to
    // Thai stops Whisper from guessing English (and translating), and the
    // prompt nudges it to keep English words in English spelling.
    form.append("language", "th");
    const terms = getTerms();
    form.append("prompt", ("ภาษาไทยที่มีคำภาษาอังกฤษปน เช่น risk, action item, deadline, KPI, audit, compliance" + (terms ? ", " + terms : "")).slice(0, 400));
    const data = await groq("/audio/transcriptions", form);
    const segs = Array.isArray(data.segments) ? data.segments : [];
    if (!segs.length) return (data.text || "").trim() ? "[" + stamp(offset) + "] " + data.text.trim() : "";
    return segs.map(s => (s.text || "").trim() ? "[" + stamp(offset + (s.start || 0)) + "] " + s.text.trim() : "").filter(Boolean).join("\n");
  }

  async function chat(system, user, maxTokens) {
    const data = await groq("/chat/completions", {
      model: LLM_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.2,
      max_completion_tokens: maxTokens,
      reasoning_effort: "low"
    });
    return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
  }

  // Shrinks notes until they fit one request, then writes the minutes.
  // Meeting -> minutes format; presentation or lecture -> talk summary.
  // "auto" lets the model decide and report it on the first line.
  function finalPrompt(job) {
    const lang = "\nWrite in " + ((job.outLang || "th") === "en" ? "English" : "Thai") + ", even if the recording is in another language (headings stay in English).";
    const talk = "You write a clear summary of a presentation or lecture, from the notes or transcript provided.\nKeep the section headings below in English, exactly:\n" + TALK_FORMAT +
      "\nUse only facts from the input. If a name, number or date is unclear, write [verify].\nOutput only the Markdown. No introduction.";
    if (job.kind === "meeting") return "TYPE: meeting\n" + FINAL_PROMPT + lang;
    if (job.kind === "talk") return talk + lang;
    return "First decide what was recorded: a MEETING (several people discussing, deciding, assigning work) or a TALK (one main speaker presenting, teaching or lecturing).\n" +
      "Write the first line exactly as TYPE: meeting or TYPE: talk.\n\nIf meeting:\n" + FINAL_PROMPT + "\n\nIf talk:\n" + talk + lang;
  }
  function takeType(job, text) {
    const m = text.match(/^\s*TYPE:\s*(meeting|talk)\s*\n/i);
    if (m) { job.detectedKind = m[1].toLowerCase(); return text.slice(m[0].length).trim(); }
    if (job.kind !== "auto" && job.kind) job.detectedKind = job.kind;
    return text;
  }

  async function writeMinutes(job) {
    const transcript = job.transcript || "";
    const prompt = finalPrompt(job);
    if (transcript.length <= ONE_SHOT_CHARS) return takeType(job, await chat(prompt, "Transcript:\n" + transcript, 2500));
    let notes = job.parts.map((p, i) => "Part " + (i + 1) + " (from " + stamp(i * PART_SECONDS) + "):\n" + (p.notes || ""));
    while (notes.join("\n\n").length > NOTES_BATCH_CHARS && notes.length > 1) {
      const groups = [];
      let cur = [];
      for (const n of notes) {
        if (cur.length && (cur.join("\n\n") + n).length > NOTES_BATCH_CHARS) { groups.push(cur); cur = []; }
        cur.push(n);
      }
      if (cur.length) groups.push(cur);
      const merged = [];
      for (const g of groups) merged.push(await chat(PART_PROMPT, "Merge these notes, keep every decision, action, risk and key point:\n\n" + g.join("\n\n"), 900));
      notes = merged;
    }
    return takeType(job, await chat(prompt, "Notes, in order:\n\n" + notes.join("\n\n"), 2500));
  }

  let running = null;
  async function processJob(job) {
    if (running) {
      if (job.status !== "queued") { job.status = "queued"; await saveJob(job); render(); }
      return toast("Queued: starts when the current job finishes.");
    }
    if (!getKey()) return openSetup();
    running = job.id;
    job.status = "working"; job.error = "";
    await saveJob(job); render();
    const t0 = Date.now();
    let stepsDone = 0;
    try {
      if (job.transcriptComplete) {
        job.stage = "minutes"; render();
        job.minutes = await writeMinutes(job);
        job.status = "done"; job.progress = 100; job.stage = "";
        await saveJob(job);
        toast("Minutes ready");
        return;
      }
      const split = await splitAudio(job.audio);
      if (split.duration && !job.duration) job.duration = split.duration;
      const n = split.count;
      job.parts = (job.parts || []).slice(0, n);
      const long = (job.duration || n * PART_SECONDS) > ONE_SHOT_CHARS / 25;  // roughly > 4-5 min of speech
      const total = n * (long ? 2 : 1) + 1;
      const tick = () => {
        const done = job.parts.filter(p => p && p.text != null).length + (long ? job.parts.filter(p => p && p.notes != null).length : 0);
        job.progress = Math.min(99, Math.round(done / total * 100));
        const per = stepsDone ? (Date.now() - t0) / stepsDone : 40000;
        job.eta = Math.max(1, Math.round((total - done) * per / 60000));
      };
      for (let i = 0; i < n; i++) {
        job.parts[i] = job.parts[i] || {};
        if (job.parts[i].text == null) {
          const p = split.part(i);
          // Whisper (Groq) and, if connected, Typhoon listen to the same part.
          const [raw, thai] = await Promise.all([
            transcribePart(p.blob, p.offset, job.lang, p.name),
            getTyphoonKey() ? typhoonPart(p).catch(e => { if (!job.tyWarned) { job.tyWarned = true; toast("Typhoon didn't answer (" + (e && e.message || "error") + "). Using Whisper only."); } return ""; }) : Promise.resolve("")
          ]);
          job.parts[i].raw = raw;
          job.parts[i].thai = thai;
          job.parts[i].text = raw;
          job.engine = thai ? "typhoon+whisper" : "whisper";
          // Second pass: merge with Typhoon, or fix misheard words from context.
          // Kept only if it keeps the time stamps and roughly the same length.
          if (raw.trim()) {
            try {
              const terms = getTerms();
              const termNote = terms ? "\nNames and terms that may appear: " + terms : "";
              const fixed = thai
                ? await chat(MERGE_PROMPT + termNote, "Transcript A (Whisper):\n" + raw + "\n\nTranscript B (Typhoon):\n" + thai, 3500)
                : await chat(CLEAN_PROMPT + termNote, raw, 3000);
              const stamps = t => (t.match(/^\[\d/gm) || []).length;
              if (fixed && stamps(fixed) >= stamps(raw) * 0.8 && fixed.length > raw.length * 0.6 && fixed.length < raw.length * 1.6) job.parts[i].text = fixed;
            } catch (e) { if (e instanceof KeyError) throw e; }
          }
          stepsDone++;
          job.heard = stamp(Math.min(job.duration || Infinity, (i + 1) * PART_SECONDS));
          const lines = job.parts[i].text.split("\n");
          job.preview = lines[lines.length - 1] || job.preview;
        }
        job.transcript = job.parts.map(x => x.text || "").filter(Boolean).join("\n");
        if (long && job.parts[i].notes == null) {
          job.parts[i].notes = job.parts[i].text ? await chat(PART_PROMPT, "Part " + (i + 1) + " of " + n + ":\n" + job.parts[i].text, 700) : "";
          stepsDone++;
        }
        tick();
        await saveJob(job);
        if (state.openId === job.id) render(); else renderList();
      }
      if (!job.transcript.trim()) throw new Error("No speech was found in this recording.");
      job.transcriptComplete = true;
      await saveJob(job);
      job.stage = "minutes"; render();
      job.minutes = await writeMinutes(job);
      job.status = "done"; job.progress = 100; job.stage = "";
      await saveJob(job);
      toast("Minutes ready");
    } catch (e) {
      job.status = "error"; job.stage = "";
      job.error = e && e.message ? e.message : "Something went wrong.";
      await saveJob(job);
      if (e instanceof KeyError) openSetup();
    } finally {
      running = null;
      render();
      // Start the next recording that was waiting its turn.
      const next = state.jobs.find(j => j.status === "queued" && !j.minutes);
      if (next && getKey()) setTimeout(() => processJob(next), 0);
    }
  }

  // ---------- Groq setup sheet ----------
  function renderService() {
    const ok = !!getKey();
    $("svcState").textContent = ok ? "Connected" : "Not set up";
    $("svcState").className = "detail-pill " + (ok ? "mint" : "sun");
    $("svcButton").textContent = ok ? "Settings" : "Set up · free";
    $("svcCard").classList.toggle("hidden", ok);   // only shown when setup is needed
    $("svcLink").classList.toggle("hidden", !ok);
    for (const g of document.querySelectorAll("[data-settings]")) g.classList.toggle("dot", !ok);
    $("keyRemove").classList.toggle("hidden", !ok);
  }
  function openSetup() {
    $("keyInput").value = "";
    $("keyMsg").textContent = getKey() ? "A key is saved on this iPhone. Paste a new one to replace it." : "";
    const d = $("groqDialog");
    if (!d.open) d.showModal();
  }
  async function saveKeyFromInput() {
    const k = $("keyInput").value.trim();
    if (!/^gsk_[A-Za-z0-9]{20,}$/.test(k)) { $("keyMsg").textContent = "That doesn't look like a Groq key. It starts with gsk_."; return; }
    $("keyMsg").textContent = "Checking…";
    try {
      const r = await fetch(GROQ + "/models", { headers: { Authorization: "Bearer " + k } });
      if (r.status === 401) { $("keyMsg").textContent = "Groq didn't accept this key. Copy it again."; return; }
    } catch {
      $("keyMsg").textContent = "Couldn't reach Groq. Check the internet and try again."; return;
    }
    setKey(k);
    $("groqDialog").close();
    renderService(); render();
    toast("Groq connected");
    const waiting = state.jobs.find(j => j.id === state.openId && !j.minutes);
    if (waiting) processJob(waiting);
  }

  function render() { renderList(); renderDetail(); renderService(); }

  // ---------- actions ----------
  async function addFile(file) {
    if (!file) return;
    const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "Meeting " + fmtDate(Date.now());
    return addAudio(file, name, {});
  }

  // Used by the Agent tab and by the Record tab (after Stop, or "Minutes").
  async function addAudio(blob, name, opts) {
    opts = opts || {};
    if (!blob || !blob.size) return;
    if (blob.size > MAX_AUDIO_BYTES) return toast("This file is too large (over 500 MB).");
    if (!state.db) { try { state.db = await openDb(); state.jobs = await loadJobs(); } catch { return toast("Storage isn't available in this browser."); } }
    const existing = opts.recordId && state.jobs.find(j => j.recordId === opts.recordId);
    let job = existing;
    if (!job) {
      job = {
        id: "job-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name || "Meeting " + fmtDate(Date.now()), createdAt: Date.now(), lang: state.lang, outLang: state.out,
        recordId: opts.recordId || null,
        audio: blob, audioType: blob.type, size: blob.size,
        duration: opts.duration || await audioDuration(blob),
        status: "queued", progress: 0, transcript: "", minutes: "", parts: []
      };
      await saveJob(job);
      state.jobs.push(job);
    }
    state.openId = job.id;
    state.tab = job.minutes ? "minutes" : "transcript";
    showView("agent");
    render();
    // Start (or continue) unless the minutes are done or it's already running.
    if (!job.minutes && running !== job.id) {
      if (TRANSCRIBER.ready) processJob(job);
      else openSetup();
    }
    return job;
  }

  function summaryText(job) { return MINUTES_PROMPT + "\n\n" + job.transcript.trim(); }

  async function act(name) {
    const job = state.jobs.find(j => j.id === state.openId);
    if (!job) return;
    if (name === "copySummary") return copyText(summaryText(job), "Copied. Open Claude and paste.");
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
    // Minutes language (Thai or English), remembered for new meetings.
    const syncLangs = () => {
      for (const x of $("agentOut").querySelectorAll("button")) x.setAttribute("aria-pressed", String(x.dataset.out === state.out));
    };
    $("agentOut").addEventListener("click", e => {
      const b = e.target.closest("button[data-out]");
      if (!b) return;
      state.out = b.dataset.out;
      try { localStorage.setItem("mia-out-lang", state.out); } catch {}
      syncLangs();
    });
    // Switch the minutes language of one meeting: rewrites only the minutes.
    $("jobOut").addEventListener("click", async e => {
      const b = e.target.closest("button[data-out]");
      const job = state.jobs.find(j => j.id === state.openId);
      if (!b || !job || job.status === "working") return;
      const cur = job.outLang || (job.lang === "en" ? "en" : "th");
      if (cur === b.dataset.out) return;
      job.outLang = b.dataset.out;
      job.minutes = "";
      await saveJob(job);
      render();
      if (TRANSCRIBER.ready && job.transcriptComplete) processJob(job);
    });
    syncLangs();
    // Meeting or talk: overrides auto-detection and rewrites only the summary.
    $("jobKind").addEventListener("click", async e => {
      const b = e.target.closest("button[data-kind]");
      const job = state.jobs.find(j => j.id === state.openId);
      if (!b || !job || job.status === "working") return;
      if ((job.detectedKind || job.kind) === b.dataset.kind) return;
      job.kind = b.dataset.kind; job.detectedKind = b.dataset.kind;
      job.minutes = "";
      await saveJob(job);
      render();
      if (TRANSCRIBER.ready && job.transcriptComplete) processJob(job);
    });
    const tyState = () => { $("tyState").textContent = getTyphoonKey() ? "On" : "Off"; };
    tyState();
    $("tySave").addEventListener("click", () => {
      const v = $("tyKey").value.trim();
      try { if (v) localStorage.setItem(TYPHOON_KEY, v); else localStorage.removeItem(TYPHOON_KEY); } catch {}
      $("tyKey").value = ""; tyState();
      toast(v ? "Typhoon connected. New recordings use both engines." : "Typhoon turned off");
    });
    try { $("agentTerms").value = localStorage.getItem("mia-terms") || ""; } catch {}
    $("agentTerms").addEventListener("change", e => { try { localStorage.setItem("mia-terms", e.target.value.trim()); } catch {} });
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
    $("workGo").addEventListener("click", () => { const j = state.jobs.find(x => x.id === state.openId); if (j) processJob(j); });
    $("writeMinutes").addEventListener("click", () => { const j = state.jobs.find(x => x.id === state.openId); if (j) processJob(j); });
    $("refineClaude").addEventListener("click", () => act("copySummary"));
    $("svcButton").addEventListener("click", openSetup);
    $("svcLink").addEventListener("click", openSetup);
    for (const g of document.querySelectorAll("[data-settings]")) g.addEventListener("click", () => $("settingsDialog").showModal());
    $("settingsClose").addEventListener("click", () => $("settingsDialog").close());
    $("keySave").addEventListener("click", saveKeyFromInput);
    $("keyCancel").addEventListener("click", () => $("groqDialog").close());
    $("keyRemove").addEventListener("click", () => { if (window.confirm("Remove the Groq key from this iPhone?")) { setKey(""); $("groqDialog").close(); render(); } });

    let view = "record";
    try { view = localStorage.getItem("mia-view") || "record"; } catch {}
    showView(view === "agent" ? "agent" : "record");

    try {
      state.db = await openDb();
      state.jobs = await loadJobs();
      // A job that was running when MIA closed is paused; its finished parts are kept.
      for (const j of state.jobs) if (j.status === "working") { j.status = "paused"; j.stage = ""; saveJob(j); }
    } catch {
      toast("Storage isn't available in this browser.");
    }
    render();
  }

  // Small hook for tests and screenshots.
  window.MIAAgent = { typhoonKey: getTyphoonKey, busy: () => !!running, state, render, renderMinutes, renderTranscript, transcriber: TRANSCRIBER, addAudio, showView };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
