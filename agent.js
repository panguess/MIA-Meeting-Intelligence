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
    "Summarise this recording (Thai with English terms; machine transcript with [mm:ss] times, so ignore filler and recognition errors).",
    "First decide what it is: a MEETING, a lecture/class/briefing/presentation, FIELD NOTES, or something else.",
    "Meeting: write formal minutes with ## Overview, ## Key points (grouped by agenda topic), ## Decisions, ## Action items (table: Task | Owner | Due date), ## Open issues, ## Risks raised (risk → impact → mitigation).",
    "Lecture or presentation: one sentence on what it is, a table of key facts (numbers, dates, scores, scope), then numbered sections by topic, tables where items share attributes, and ## What to do next.",
    "Field notes (one person dictating observations on site, e.g. a stock count): an observation report with ## Summary, ## Key facts (table), ## Findings by area, ## Issues & risks (table), ## Follow-ups (table). Merge repeats into one entry per area/item; latest info wins, noted 'updated (mm:ss)'.",
    "Anything else: infer the best report structure for its purpose.",
    "Organise by TOPIC, not time order: if a topic comes back later, put it under that topic and keep both times. If something is later corrected or contradicted, keep the final version and note 'later clarified (mm:ss)'.",
    "Add (mm:ss) source times to key points. Write in the transcript's language; keep English terms in English. Use only facts from the transcript; write [verify] for anything unclear.",
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
  // ---------- Models: keep up with new free models automatically ----------
  // The ONE place to update preferences. Each provider's model list is read
  // once a day; the first rule that matches an available model wins, and
  // within a rule the newest-looking id (highest version) wins. If nothing
  // matches or the list can't be read, the safe default is used.
  const MODEL_PREFS = {
    groqStt: { def: "whisper-large-v3", rules: [/^whisper-large-v\d+$/i, /^whisper-large/i] },
    groqLlm: { def: "openai/gpt-oss-120b", rules: [/^openai\/gpt-oss.*-120b$/i, /^openai\/gpt-oss/i] },
    typhoon: { def: "typhoon-asr-realtime", rules: [/^typhoon.*asr(?!.*realtime)/i, /^typhoon.*asr/i] },
    openai: { def: "gpt-transcribe", rules: [/^gpt-transcribe$/i, /^gpt-[\w.]*transcribe$/i, /^gpt-4o-transcribe$/i] }
  };
  // Size tags like -120b or -20b are not versions, so they are ignored.
  const verKey = id => (id.replace(/\d+(?:\.\d+)?b\b/gi, "").match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const newer = (a, b) => { const x = verKey(a), y = verKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); } return b.localeCompare(a); };
  function pickModel(kind, ids) {
    const pref = MODEL_PREFS[kind];
    for (const rule of pref.rules) {
      const hits = ids.filter(id => rule.test(id)).sort(newer);
      if (hits.length) return hits[0];
    }
    return pref.def;
  }
  const models = (() => { try { return JSON.parse(localStorage.getItem("mia-models") || "{}"); } catch { return {}; } })();
  const useModel = kind => models[kind] || MODEL_PREFS[kind].def;
  function dropModel(kind) { delete models[kind]; try { localStorage.setItem("mia-models", JSON.stringify(models)); } catch {} renderModels(); }
  async function listIds(url, key) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(url, { headers: { Authorization: "Bearer " + key }, signal: ctl.signal });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.data || []).map(m => m.id).filter(Boolean);
    } catch { return null; } finally { clearTimeout(t); }
  }
  async function refreshModels(force) {
    if (!force && models.at && Date.now() - models.at < 24 * 3600 * 1000) return;
    const tasks = [];
    if (getKey()) tasks.push(listIds(GROQ + "/models", getKey()).then(ids => { if (ids) { models.groqStt = pickModel("groqStt", ids); models.groqLlm = pickModel("groqLlm", ids); } }));
    if (getTyphoonKey()) tasks.push(listIds(TYPHOON + "/models", getTyphoonKey()).then(ids => { if (ids && ids.length) models.typhoon = pickModel("typhoon", ids); }));
    if (getOpenAIKey()) tasks.push(listIds(OPENAI + "/models", getOpenAIKey()).then(ids => { if (ids && ids.length) models.openai = pickModel("openai", ids); }));
    await Promise.all(tasks);
    models.at = Date.now();
    try { localStorage.setItem("mia-models", JSON.stringify(models)); } catch {}
    renderModels();
  }
  function renderModels() {
    const el = document.getElementById("modelNote");
    if (!el) return;
    const parts = ["Speech: " + useModel("groqStt"), "Minutes: " + useModel("groqLlm")];
    if (getTyphoonKey()) parts.push("Typhoon: " + useModel("typhoon"));
    if (getOpenAIKey()) parts.push("OpenAI: " + useModel("openai"));
    el.textContent = "Models in use (updated automatically): " + parts.join(" · ");
  }
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
    "The transcript is machine speech-to-text: ignore filler words and obvious recognition errors, infer the intended word from context.",
    "Write at most 15 short, specific bullets in the transcript's language. Start each with the topic, area or item in brackets, e.g. [Budget] or [Warehouse B / SKU 1234].",
    "Prefix bullets: DECISION:, ACTION: (task, owner, due date if said), RISK: (with impact if said), ISSUE:, or none for key points.",
    "Keep names, numbers, amounts and dates exactly as said; note who said it when clear. Mark anything unclear with [verify].",
    "End each bullet with the [mm:ss] time of the transcript line it comes from, written as (mm:ss).",
    "No introduction, no closing line."
  ].join("\n");
  // Lectures, classes, briefings, presentations: no fixed template. Like a
  // good note-taker, pick the structure that fits and lead with the facts.
  const TALK_FORMAT = [
    "Start with ONE sentence saying what this recording is and its main point (e.g. who is speaking, about what, for whom).",
    "Then a short heading that names the content (e.g. the exam, the project, the policy).",
    "If there are key numbers, dates, scores, amounts, deadlines or scope: put them first in a 2-column Markdown table (Item | Detail).",
    "Then numbered sections with headings that fit the content (## 1. ..., ## 2. ...), each with specific bullets.",
    "Organise by TOPIC (agenda item, chapter, project), not by time order. If the talk returns to an earlier topic later, put that point under the earlier topic and keep both times.",
    "If something said later corrects, updates or contradicts something earlier, keep the final version and note it, e.g. 'later clarified (mm:ss): …'.",
    "Use a Markdown table whenever items share attributes (e.g. chapter | topic | what to focus on).",
    "If the speaker gave instructions, tips, warnings or things to prepare, end with ## What to do next (bullets).",
    "If there was Q&A, add ## Q&A (question → answer).",
    "Where the input gives times, end each numbered section heading and key bullets with the source time as (mm:ss), so the reader can check the recording."
  ].join("\n");
  // Field notes: one person dictating observations over time (stock count,
  // site visit, audit walk-through). It is a living report, not a timeline:
  // a repeated point updates the earlier item and the latest info wins.
  const FIELD_PROMPT = [
    "You are an experienced internal auditor / risk officer turning one person's spoken field notes into an observation report.",
    "The input is a machine transcript of the observer dictating while on site (Thai with English terms): ignore filler and recognition errors, infer the intended meaning.",
    "This is NOT a timeline. The observer often comes back to an item to add or correct information. Merge everything said about the same area, item, location or person into ONE entry.",
    "When later information updates or contradicts earlier information, keep ONLY the latest version in the entry and add 'updated (mm:ss)'. Never list the same item twice.",
    "Structure:",
    "Start with ONE sentence: what was observed, where, when and by whom (only what was said).",
    "## Summary (3-5 bullets: the overall result and the most important findings)",
    "## Key facts (2-column Markdown table Item | Detail: counts, quantities, differences, amounts, dates, locations, people present)",
    "## Findings by area (one ### sub-heading per area/item/location/process; bullets: what was observed, what was expected if said, the gap; (mm:ss) on each bullet)",
    "## Issues & risks (Markdown table: Issue | Risk / impact | Severity High/Medium/Low (your judgement, mark [verify] if unsure))",
    "## Follow-ups (Markdown table: Action | Owner | Due date; '-' if not said)",
    "## Open questions (things still to confirm)",
    "Write 'None' under a heading only if there is truly nothing. Keep every number, name and date exactly; write [verify] when unclear."
  ].join("\n");
  // Anything else: no template. Infer the best report for the purpose.
  const SMART_PROMPT = [
    "You are an excellent analyst. The input is a machine transcript of a recording (Thai with English terms): ignore filler and recognition errors, infer the intended meaning.",
    "Work out what this recording is and what the listener needs from it (e.g. an interview, a phone call, a site visit, a brainstorm, a voice memo, a training).",
    "Start with ONE sentence saying what it is and its main point. Then write the report a skilled professional would produce for that purpose, with clear ## headings you choose.",
    "Lead with the facts: put key numbers, dates, names and amounts in a 2-column table (Item | Detail) when there are several.",
    "Organise by topic, not time. Merge repeated points; when something is later updated or corrected, keep the latest version and note 'updated (mm:ss)'.",
    "Use tables where items share attributes. End with ## Next steps if anything needs doing.",
    "Add (mm:ss) source times to key points. Use only facts from the input; write [verify] for anything unclear."
  ].join("\n");
  const FINAL_PROMPT = [
    "You are an experienced corporate secretary writing formal meeting minutes for the risk management team of a large Thai company.",
    "The input is notes or a machine transcript (Thai with English terms): ignore filler and recognition errors, infer the intended meaning from context.",
    "Keep the section headings below in English, exactly:",
    "## Overview  (2-3 sentences: purpose of the meeting, main outcome; attendees if mentioned)",
    "## Key points  (group by agenda topic: ### Topic, then 2-5 specific bullets each; who said what when clear)",
    "## Decisions  (bullets: the decision and, briefly, why; write - None if none)",
    "## Action items  (Markdown table with columns: Task | Owner | Due date; one row per task, start each task with a verb)",
    "## Open issues  (bullets: what is unresolved and what is needed; - None if none)",
    "## Risks raised  (bullets: risk → possible impact → mitigation if discussed; - None if none)",
    "Style: formal business language (Thai: ภาษาทางการ, concise), keep English business terms in English (e.g. KPI, audit, risk appetite).",
    "Be specific: keep names, numbers, amounts and dates. Merge duplicates. No generic filler.",
    "Organise by TOPIC (agenda item, chapter, project), not by time order. If the talk returns to an earlier topic later, put that point under the earlier topic and keep both times.",
    "If something said later corrects, updates or contradicts something earlier, keep the final version and note it, e.g. 'later clarified (mm:ss): …'.",
    "Before writing, check that every decision, action and risk in the input appears in the minutes.",
    "Where the input gives times, end key points, decisions and risks with the source time as (mm:ss), so the reader can check the recording.",
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
  const secOf = t => t.split(":").reduce((a, x) => a * 60 + Number(x), 0);
  // Lines the user bookmarked: the last line that starts at or before each mark.
  function markedStamps(text, marks) {
    const out = new Set();
    if (!marks || !marks.length) return out;
    const stamps = (String(text).match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]/gm) || []).map(x => x.slice(1, -1));
    for (const mk of marks) {
      let best = null;
      for (const st of stamps) if (secOf(st) <= mk) best = st;
      if (best) out.add(best);
    }
    return out;
  }
  function renderTranscript(text, marks) {
    const lines = String(text).split(/\n+/).map(l => l.trim()).filter(Boolean);
    const hit = markedStamps(text, marks);
    return lines.map(line => {
      const m = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
      const on = m && hit.has(m[1]);
      return m
        ? '<p class="line' + (on ? " marked" : "") + '"><span class="stamp">' + (on ? '<span class="star">★</span>' : "") + esc(m[1]) + '</span><span>' + esc(m[2]) + '</span></p>'
        : '<p class="line"><span>' + esc(line) + '</span></p>';
    }).join("");
  }

  // Minimal Markdown for minutes pasted back from Claude: headings, bullets,
  // tables and [verify] tags. Everything is escaped first.
  function renderMinutes(md) {
    const out = [];
    let table = null, list = null;
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[verify\]/gi, '<span class="verify">verify</span>')
      // (mm:ss) source times jump to that moment in the transcript.
      .replace(/\((\d{1,2}:\d{2}(?::\d{2})?)\)/g, '<button class="seek" type="button" data-seek="$1">$1</button>');
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
      const rows = m.split("\n").filter(l => /^\s*[-*•]\s+/.test(l) && !isNone(clean(l.replace(/^\s*[-*•]\s+/, "")))).length;
      const trs = m.split("\n").filter(l => /^\s*\|/.test(l) && !/^\s*\|?\s*:?-{2,}/.test(l)).length;
      return rows + Math.max(0, trs - 1);
    };
    return { decisions: section("Decisions"), actions: section("Action"), risks: section("Risk") };
  }

  // ---------- Tracker: action items, decisions and risks across meetings ----------
  const clean = t => String(t || "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
  const isNone = t => !t || /^(none|n\/a|-|ไม่มี|—)\.?$/i.test(t);
  function sectionOf(md, name) {
    return String(md || "").split(/\n(?=#{1,4}\s)/).find(x => new RegExp("^#{1,4}\\s*" + name, "i").test(x.trim())) || "";
  }
  function trackerItems() {
    const out = { actions: [], decisions: [], risks: [] };
    for (const job of state.jobs) {
      if (!job.minutes) continue;
      const done = new Set(job.doneItems || []);
      const add = (kind, i, text, extra) => { if (!isNone(text)) out[kind].push(Object.assign({ id: kind + ":" + i, job, text, done: done.has(kind + ":" + i) }, extra || {})); };
      const bullets = sec => sec.split("\n").filter(l => /^\s*[-*•]\s+/.test(l)).map(l => clean(l.replace(/^\s*[-*•]\s+/, "")));
      const act = sectionOf(job.minutes, "Action");
      const rows = act.split("\n").filter(l => /^\s*\|/.test(l) && !/^\s*\|?\s*:?-{2,}/.test(l)).slice(1);
      rows.forEach((r, i) => { const c = r.split("|").slice(1, -1).map(clean); add("actions", i, c[0], { owner: c[1] || "", due: c[2] || "" }); });
      bullets(act).forEach((t, i) => add("actions", "b" + i, t));
      bullets(sectionOf(job.minutes, "Decision")).forEach((t, i) => add("decisions", i, t));
      bullets(sectionOf(job.minutes, "Risk")).forEach((t, i) => add("risks", i, t));
    }
    for (const k in out) out[k].sort((a, b) => b.job.createdAt - a.job.createdAt);
    return out;
  }
  function renderTracker() {
    const items = trackerItems();
    $("tcActions").textContent = items.actions.filter(x => !x.done).length;
    $("tcDecisions").textContent = items.decisions.length;
    $("tcRisks").textContent = items.risks.filter(x => !x.done).length;
    $("trackerOpen").classList.toggle("hidden", !state.jobs.some(j => j.minutes));
    const on = !!state.tracker && !state.openId;
    $("agentTracker").classList.toggle("hidden", !on);
    if (!on) return;
    $("agentHome").classList.add("hidden");
    const kind = state.trackerKind || "actions";
    for (const b of $("trackerSeg").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.kind === kind));
    $("trackerDoneWrap").classList.toggle("hidden", kind === "decisions");
    const q = $("trackerSearch").value.trim().toLowerCase();
    const showDone = $("trackerShowDone").checked;
    const list = items[kind].filter(x => (kind === "decisions" || showDone || !x.done) &&
      (!q || (x.text + " " + (x.owner || "") + " " + x.job.name).toLowerCase().includes(q)));
    $("trackerList").innerHTML = list.length ? list.map(x => {
      const meta = [x.owner && "Owner: " + x.owner, x.due && "Due: " + x.due].filter(Boolean).join(" · ");
      return '<div class="t-item' + (x.done ? " done" : "") + '">' +
        (kind === "decisions" ? "" : '<button class="t-check" type="button" data-done="' + esc(x.job.id) + "|" + esc(x.id) + '" aria-label="Mark done" aria-pressed="' + x.done + '">' + (x.done ? "✓" : "") + "</button>") +
        '<span class="t-body"><span class="t-text">' + esc(x.text) + "</span>" +
        '<span class="t-meta">' + (meta ? esc(meta) + " · " : "") + '<button type="button" data-open="' + esc(x.job.id) + '">' + esc(x.job.name) + "</button> · " + esc(fmtDate(x.job.createdAt)) + "</span></span></div>";
    }).join("") : '<div class="t-empty">' + (q ? "Nothing matches." : kind === "actions" ? "No open action items. Nice." : "Nothing here yet. It fills in as minutes are written.") + "</div>";
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
      $("transcriptBody").innerHTML = text.trim() ? renderTranscript(text, job.marks) : '<p class="muted">No lines match.</p>';
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
        $("mStats").classList.toggle("hidden", kind !== "meeting");
        $("improveBtn").classList.toggle("hidden", job.source !== "live" || !job.audio);
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
    if (!res.ok) {
      const msg = (data.error && data.error.message) || "";
      // A model picked from the list was retired: go back to the safe default once.
      if ((res.status === 400 || res.status === 404) && /model/i.test(msg)) {
        const kind = body instanceof FormData ? "groqStt" : "groqLlm";
        const cur = body instanceof FormData ? body.get("model") : body.model;
        if (cur && cur !== MODEL_PREFS[kind].def) {
          dropModel(kind);
          if (body instanceof FormData) body.set("model", MODEL_PREFS[kind].def); else body.model = MODEL_PREFS[kind].def;
          return groq(path, body, attempt);
        }
      }
      throw new Error(msg || "Groq error " + res.status);
    }
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
    const tyModel = useModel("typhoon");
    form.append("model", tyModel);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90000);
    let res;
    try {
      res = await fetch(TYPHOON + "/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + getTyphoonKey() }, body: form, signal: ctl.signal });
    } finally { clearTimeout(timer); }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(5000 * (attempt + 1)); return typhoonFile(blob, attempt + 1); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok && tyModel !== MODEL_PREFS.typhoon.def && (res.status === 400 || res.status === 404)) { dropModel("typhoon"); return typhoonFile(blob, attempt); }
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

  // ---------- OpenAI transcription (optional, paid, off by default) ----------
  // Best Thai+English accuracy. Only used when the user saves an OpenAI key.
  const OPENAI = "https://api.openai.com/v1";
  const OPENAI_KEY = "mia-openai-key";
  const getOpenAIKey = () => { try { return localStorage.getItem(OPENAI_KEY) || ""; } catch { return ""; } };
  async function openaiFile(blob, attempt = 0) {
    const form = new FormData();
    form.append("file", blob, "part.wav");
    const model = useModel("openai");
    form.append("model", model);
    form.append("language", "th");
    const terms = getTerms();
    form.append("prompt", ("Thai speech with English business terms kept in English, e.g. risk, KPI, audit, compliance, deadline" + (terms ? ", " + terms : "")).slice(0, 400));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    let res;
    try {
      res = await fetch(OPENAI + "/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + getOpenAIKey() }, body: form, signal: ctl.signal });
    } finally { clearTimeout(timer); }
    const data = await res.json().catch(() => ({}));
    const msg = (data.error && data.error.message) || "";
    if (!res.ok && /model/i.test(msg) && (res.status === 400 || res.status === 404) && model !== "gpt-4o-transcribe") {
      models.openai = model === MODEL_PREFS.openai.def ? "gpt-4o-transcribe" : MODEL_PREFS.openai.def;
      try { localStorage.setItem("mia-models", JSON.stringify(models)); } catch {}
      return openaiFile(blob, attempt);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(4000 * (attempt + 1)); return openaiFile(blob, attempt + 1); }
    if (res.status === 401) throw new Error("OpenAI didn't accept the key");
    if (!res.ok) throw new Error(msg || "OpenAI " + res.status);
    return (data.text || "").trim();
  }
  // 30-second pieces, 4 at a time: fine time stamps and fast on long meetings.
  async function openaiPart(p) {
    if (!p.samples) throw new Error("needs decoded audio");
    const step = 30 * p.rate, jobs = [];
    for (let s = 0, k = 0; s < p.samples.length; s += step, k++) jobs.push({ k, s });
    const out = new Array(jobs.length);
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        const text = await openaiFile(wav(p.samples.subarray(j.s, Math.min(p.samples.length, j.s + step)), p.rate));
        out[j.k] = text ? "[" + stamp(p.offset + j.k * 30) + "] " + text : "";
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return out.filter(Boolean).join("\n");
  }

  async function transcribePart(blob, offset, lang, name) {
    const form = new FormData();
    form.append("file", blob, (name || "part") + (blob.type === "audio/wav" ? ".wav" : ".m4a"));
    form.append("model", useModel("groqStt"));
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

  async function chat(system, user, maxTokens, effort) {
    const data = await groq("/chat/completions", {
      model: useModel("groqLlm"),
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.2,
      max_completion_tokens: maxTokens,
      reasoning_effort: effort || "low"
    });
    return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
  }

  // Shrinks notes until they fit one request, then writes the minutes.
  // Meeting -> minutes format; presentation or lecture -> talk summary.
  // "auto" lets the model decide and report it on the first line.
  function finalPrompt(job) {
    const mk = (job.marks || []).map(stamp);
    const marksNote = mk.length ? "\nThe user bookmarked these moments as important while recording: " + mk.join(", ") +
      ". Make sure what was said around each time is covered, and put a ★ before those points." : "";
    const lang = marksNote + "\nWrite in " + ((job.outLang || "th") === "en" ? "English" : "Thai") + ", even if the recording is in another language (meeting-minutes headings stay in English).";
    const talk = "You are an excellent note-taker. Summarise this lecture, class, briefing or presentation from the notes or machine transcript provided " +
      "(Thai with English terms; ignore filler and recognition errors, infer the intended meaning).\n" + TALK_FORMAT +
      "\nWrite headings in the output language. Keep English technical terms in English as spoken (e.g. Cost Behavior, Chapter 14)." +
      "\nBe specific and complete: keep every number, name, date and instruction. No generic filler." +
      "\nUse only facts from the input. If a name, number or date is unclear, write [verify].\nOutput only the Markdown.";
    const tail = "\nWrite headings in the output language. Keep English terms in English as spoken.\nOutput only the Markdown.";
    const field = FIELD_PROMPT + tail, smart = SMART_PROMPT + tail;
    if (job.kind === "meeting") return "TYPE: meeting\n" + FINAL_PROMPT + lang;
    if (job.kind === "talk") return talk + lang;
    if (job.kind === "field") return field + lang;
    if (job.kind === "other") return smart + lang;
    return "First decide what was recorded:\n" +
      "- MEETING: several people discussing, deciding, assigning work.\n" +
      "- TALK: one main speaker presenting, teaching, lecturing or briefing an audience.\n" +
      "- FIELD: one person dictating their own observations or notes while on site (e.g. a stock count, store visit, inspection, audit walk-through), often coming back to earlier points.\n" +
      "- OTHER: anything else (interview, phone call, brainstorm, voice memo, ...).\n" +
      "Write the first line exactly as TYPE: meeting, TYPE: talk, TYPE: field or TYPE: other. Then follow the matching instructions.\n\n" +
      "If meeting:\n" + FINAL_PROMPT + "\n\nIf talk:\n" + talk + "\n\nIf field:\n" + field + "\n\nIf other:\n" + smart + lang;
  }
  function takeType(job, text) {
    const m = text.match(/^\s*\**TYPE:\s*(meeting|talk|field|other)\**\s*\n/i);
    if (m) { job.detectedKind = m[1].toLowerCase(); return text.slice(m[0].length).trim(); }
    if (job.kind !== "auto" && job.kind) job.detectedKind = job.kind;
    return text;
  }

  async function writeMinutes(job) {
    const transcript = job.transcript || "";
    const prompt = finalPrompt(job);
    if (transcript.length <= ONE_SHOT_CHARS) return takeType(job, await chat(prompt, "Transcript:\n" + transcript, 4000, "medium"));
    let notes;
    if ((job.parts || []).some(p => p && p.notes)) {
      notes = job.parts.map((p, i) => "Part " + (i + 1) + " (from " + stamp(i * PART_SECONDS) + "):\n" + (p.notes || ""));
    } else {
      // Live text has no audio parts: take notes from ~6,000-character pieces.
      const lines = transcript.split("\n"), pieces = [];
      let cur = "";
      for (const l of lines) { if (cur && (cur + l).length > 6000) { pieces.push(cur); cur = ""; } cur += l + "\n"; }
      if (cur.trim()) pieces.push(cur);
      notes = [];
      for (let i = 0; i < pieces.length; i++) notes.push("Part " + (i + 1) + ":\n" + await chat(PART_PROMPT, "Part " + (i + 1) + " of " + pieces.length + ":\n" + pieces[i], 900));
    }
    while (notes.join("\n\n").length > NOTES_BATCH_CHARS && notes.length > 1) {
      const groups = [];
      let cur = [];
      for (const n of notes) {
        if (cur.length && (cur.join("\n\n") + n).length > NOTES_BATCH_CHARS) { groups.push(cur); cur = []; }
        cur.push(n);
      }
      if (cur.length) groups.push(cur);
      const merged = [];
      for (const g of groups) merged.push(await chat(PART_PROMPT, "Merge these notes. Group them by topic (not time order): a point that returns to an earlier topic goes under that topic. Keep every decision, action, risk and key point, the (mm:ss) times, and any later corrections:\n\n" + g.join("\n\n"), 900));
      notes = merged;
    }
    return takeType(job, await chat(prompt, "Notes, in order:\n\n" + notes.join("\n\n"), 4000, "medium"));
  }

  let running = null;
  // Like a chat app: Record -> Stop -> the summary appears by itself.
  function showResult(job) {
    if (state.openId === job.id) {
      state.tab = "minutes";
      if (document.body.dataset.view === "agent") window.scrollTo({ top: 0, behavior: "smooth" });
    }
    toast("Minutes ready");
  }

  async function processJob(job) {
    if (running) {
      if (job.status !== "queued") { job.status = "queued"; await saveJob(job); render(); }
      return toast("Queued: starts when the current job finishes.");
    }
    if (!getKey()) return openSetup();
    running = job.id;
    job.status = "working"; job.error = ""; job.oaWarned = false; job.tyWarned = false;
    await saveJob(job); render();
    const t0 = Date.now();
    let stepsDone = 0;
    try {
      if (job.transcriptComplete) {
        job.stage = "minutes"; render();
        job.minutes = await writeMinutes(job);
        job.status = "done"; job.progress = 100; job.stage = "";
        await saveJob(job);
        showResult(job);
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
          // OpenAI first if the user turned it on; Groq Whisper (+Typhoon) otherwise
          // or if OpenAI fails.
          let best = "";
          if (getOpenAIKey() && !job.oaWarned) {
            best = await openaiPart(p).catch(e => { if (!job.oaWarned) { job.oaWarned = true; toast("OpenAI didn't answer (" + (e && e.message || "error") + "). Using the free engines."); } return ""; });
          }
          if (best) {
            job.parts[i].raw = best; job.parts[i].text = best; job.engine = "openai";
          } else {
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
      showResult(job);
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
    refreshModels(true);
    const waiting = state.jobs.find(j => j.id === state.openId && !j.minutes);
    if (waiting) processJob(waiting);
  }

  function render() { renderList(); renderDetail(); renderTracker(); renderService(); }

  // ---------- actions ----------
  async function addFile(file) {
    if (!file) return;
    const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "Meeting " + fmtDate(Date.now());
    return addAudio(file, name, {});
  }

  // Live text from the phone: the minutes can be written straight away.
  function liveFields(opts) {
    const t = opts.live || "";
    // With OpenAI on, the audio is transcribed instead (more accurate); the
    // live text is kept as a fallback.
    if (getOpenAIKey()) return t ? { liveTranscript: t } : {};
    return t.replace(/\[[\d:]+\]\s*/g, "").replace(/\(Recording paused for about[^)]*\)/g, "").trim().length > 40 ? { transcript: t, transcriptComplete: true, source: "live" } : {};
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
        marks: opts.marks || [],
        audio: blob, audioType: blob.type, size: blob.size,
        duration: opts.duration || await audioDuration(blob),
        status: "queued", progress: 0, transcript: "", minutes: "", parts: [], ...liveFields(opts)
      };
      await saveJob(job);
      state.jobs.push(job);
    }
    if (!opts.stay) {
      state.openId = job.id;
      state.tab = job.minutes ? "minutes" : "transcript";
      showView("agent");
    }
    render();
    // Start (or continue) unless the minutes are done or it's already running.
    if (!job.minutes && running !== job.id) {
      if (TRANSCRIBER.ready) processJob(job);
      else if (!opts.stay) openSetup();
    }
    return job;
  }

  function summaryText(job) { return MINUTES_PROMPT + "\n\n" + job.transcript.trim(); }

  // ---------- Export: Word (.doc) and PDF (print) ----------
  function exportHtml(job) {
    const meta = [fmtDate(job.createdAt), fmtDur(job.duration)].filter(Boolean).join(" · ");
    return "<h1>" + esc(job.name) + "</h1><p>" + esc(meta) + "</p>" + renderMinutes(job.minutes) +
      "<p style=\"color:#777;font-size:9pt\">Prepared with MIA. Check items marked verify.</p>";
  }
  const safeName = n => (String(n || "Minutes").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Minutes").slice(0, 80);
  async function exportWord(job) {
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + esc(job.name) +
      '</title><style>body{font-family:Calibri,"Leelawadee UI",sans-serif;font-size:11pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 6px}.verify{color:#b00}</style></head><body>' +
      exportHtml(job) + "</body></html>";
    const file = new File(["\ufeff" + html], safeName(job.name) + " - minutes.doc", { type: "application/msword" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: job.name }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  function exportPdf(job) {
    $("printArea").innerHTML = exportHtml(job);
    const old = document.title;
    document.title = safeName(job.name) + " - minutes";
    window.print();
    setTimeout(() => { document.title = old; }, 1000);
  }

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
    renderModels(); refreshModels();
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
    const oaState = () => { $("oaState").textContent = getOpenAIKey() ? "On" : "Off"; };
    oaState();
    $("oaSave").addEventListener("click", () => {
      const v = $("oaKey").value.trim();
      try { if (v) localStorage.setItem(OPENAI_KEY, v); else localStorage.removeItem(OPENAI_KEY); } catch {}
      $("oaKey").value = ""; oaState(); refreshModels(true);
      toast(v ? "OpenAI on. New recordings use it (paid, about 10 THB per hour)." : "OpenAI off. Free engines only.");
    });
    const tyState = () => { $("tyState").textContent = getTyphoonKey() ? "On" : "Off"; };
    tyState();
    $("tySave").addEventListener("click", () => {
      const v = $("tyKey").value.trim();
      try { if (v) localStorage.setItem(TYPHOON_KEY, v); else localStorage.removeItem(TYPHOON_KEY); } catch {}
      $("tyKey").value = ""; tyState(); refreshModels(true);
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
    $("improveBtn").addEventListener("click", async () => {
      const job = state.jobs.find(j => j.id === state.openId);
      if (!job || job.status === "working" || !job.audio) return;
      job.liveTranscript = job.liveTranscript || job.transcript;
      job.source = "audio"; job.status = "queued"; job.progress = 0; job.transcript = ""; job.transcriptComplete = false; job.parts = []; job.minutes = "";
      state.tab = "transcript";
      await saveJob(job); render();
      processJob(job);
    });
    const openJob = () => state.jobs.find(j => j.id === state.openId && j.minutes);
    $("exportWord").addEventListener("click", () => { const j = openJob(); if (j) exportWord(j); });
    $("exportPdf").addEventListener("click", () => { const j = openJob(); if (j) exportPdf(j); });
    // Tap a (mm:ss) in the minutes: show that moment in the transcript.
    $("minutesBody").addEventListener("click", e => {
      const b = e.target.closest("[data-seek]");
      if (!b) return;
      state.tab = "transcript"; $("transcriptSearch").value = ""; renderDetail();
      const want = secOf(b.dataset.seek);
      const lines = [...$("transcriptBody").querySelectorAll(".line")];
      let best = null;
      for (const l of lines) { const st = l.querySelector(".stamp"); if (st && secOf(st.textContent.replace("★", "")) <= want) best = l; }
      if (best) { best.classList.add("seek-hit"); best.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => best.classList.remove("seek-hit"), 2500); }
    });
    $("trackerOpen").addEventListener("click", () => { state.tracker = true; render(); window.scrollTo({ top: 0 }); });
    $("trackerBack").addEventListener("click", () => { state.tracker = false; render(); });
    $("trackerSeg").addEventListener("click", e => { const b = e.target.closest("button[data-kind]"); if (b) { state.trackerKind = b.dataset.kind; renderTracker(); } });
    $("trackerSearch").addEventListener("input", renderTracker);
    $("trackerShowDone").addEventListener("change", renderTracker);
    $("trackerList").addEventListener("click", async e => {
      const o = e.target.closest("[data-open]");
      if (o) { state.openId = o.dataset.open; state.tab = "minutes"; render(); window.scrollTo({ top: 0 }); return; }
      const d = e.target.closest("[data-done]");
      if (!d) return;
      const [jobId, id] = d.dataset.done.split("|");
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return;
      const set = new Set(job.doneItems || []);
      set.has(id) ? set.delete(id) : set.add(id);
      job.doneItems = [...set];
      await saveJob(job);
      renderTracker();
    });
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
  window.MIAAgent = { openaiKey: getOpenAIKey, typhoonKey: getTyphoonKey, busy: () => !!running, state, render, renderMinutes, renderTranscript, transcriber: TRANSCRIBER, addAudio, showView };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
