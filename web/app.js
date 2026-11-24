(() => {
  "use strict";

  const DB_NAME = "mia-local-recordings";
  const DB_VERSION = 2;
  const STORE_NAME = "recordings";
  const CHUNK_STORE = "recording_chunks";
  const SESSION_STORE = "recording_sessions";
  const RETENTION_DAYS = 90;
  const MAX_RECORDING_BYTES = 1024 * 1024 * 1024; // 1 GiB guardrail; actual browser quota may be lower.

  // All interface text, in English. Keep strings short and plain.
  const translations = {
    en: {
      tagline: "Ready for your next meeting?",
      onDevice: "On-device",
      timerCaption: "hours · minutes · seconds",
      ready: "Ready to record",
      recording: "Recording",
      meetingTitle: "Meeting title",
      start: "Start recording",
      startNew: "Start a new recording",
      stop: "Stop & save",
      onlineTitle: "Online meeting?",
      onlineCopy: "Place your iPhone near the laptop speaker. MIA records the room sound; it doesn't connect to Teams.",
      chooseFile: "Import a recording",
      importCopy: "Recorded in Voice Memos or another app? Share → Save to Files, then pick it here. MIA makes the minutes.",
      library: "My recordings",
      empty: "No recordings yet",
      emptyHint: "Tap Start recording when your meeting begins.",
      heroIdle: "Tap Start when your meeting begins",
      heroLive: "I'm listening · keep MIA open",
      heroPaused: "Paused · tap Continue to go on",
      heroResume: "Tap Resume to keep going",
      privacy: "Recordings are saved on this iPhone. If you connect Groq in the Agent tab, the audio is sent to Groq to make the transcript and minutes. MIA never deletes recordings on its own.",
      micDenied: "MIA can't use the microphone. Tap Allow when iPhone asks. If you tapped Don't Allow before, go to Settings → Apps → Safari → Microphone, choose Ask or Allow, then try again.",
      micUnsupported: "This browser can't record audio here. Open MIA in Safari on iPhone (iOS 15 or later).",
      recordingStarted: "Recording",
      saved: "Saved on this iPhone",
      imported: "Audio file imported",
      importFailed: "Couldn't import the file",
      storageFailed: "Couldn't save the audio. Your iPhone storage may be full.",
      interruption: "MIA left the screen for a moment, so the recording may have a gap. Keep MIA open and don't lock the screen while recording.",
      trackMuted: "iOS paused the microphone (for example, a call or Siri). MIA stopped and saved what it had recorded.",
      trackEnded: "The microphone stopped. MIA stopped recording so it doesn't save silence.",
      routeHint: "Switching audio devices may cause a short gap.",
      deleteConfirm: "Delete this recording from your iPhone?",
      deleteConfirmUnexported: "This recording has never been exported. If you delete it, it's gone for good. Delete anyway?",
      notExported: "Not exported",
      exportedOn: "Exported",
      exportedMark: "Marked as exported",
      reminderUnexported: "{n} recording(s) without a backup. iOS can clear browser storage; for important meetings tap Export → Save to Files.",
      reminderOld: "{n} recording(s) are older than 90 days. MIA never deletes them on its own; delete them yourself once they're exported.",
      resume: "Resume",
      pause: "Pause",
      rename: "Rename",
      renamePrompt: "Meeting title",
      renamed: "Renamed",
      meetingWord: "Meeting",
      titlePlaceholder: "Meeting title (optional)",
      unpause: "Continue",
      paused: "Paused",
      resumePart: "part",
      stoppedUnexpectedly: "Recording stopped unexpectedly",
      autoResuming: "Resuming the recording…",
      autoResumed: "Recording resumed by itself after a {gap} gap. The part before the gap is saved and being summarised.",
      autoResumeFailed: "MIA couldn't restart the microphone by itself. Tap Resume to keep recording.",
      resumeHint: "Everything up to now is saved. Tap Resume to record the next part right away.",
      recoveredHint: "MIA recovered an unfinished recording from last time. If the meeting is still going, tap Resume.",
      recoveredSuffix: " (recovered, may be incomplete)",
      wakeLockUnavailable: "This iPhone can't keep the screen on automatically. Set Auto-Lock to Never and turn off Low Power Mode during meetings.",
      deleted: "Recording deleted",
      play: "Play",
      export: "Export",
      delete: "Delete",
      live: "Recorded",
      incomplete: "MIA left the screen · check audio",
      importedType: "Imported",
      unknownDate: "Unknown date",
      fileLarge: "This file is larger than the 1 GB limit.",
      noAudio: "No audio was found in this file.",
      noExport: "Couldn't export the recording",
      installHint: "Tip: in Safari, tap Share → Add to Home Screen to open MIA like an app.",
      transcript: "Transcript",
      transcriptShort: "Text",
      transcriptBadge: "Transcript added",
      transcriptTitle: "Get a transcript",
      transcriptCopy: "Export → Save to Files → OneDrive › Desktop › MIA › Inbox. Your laptop writes the transcript back to that folder, then tap Text on the recording to add it.",
      transcriptAdded: "Transcript added",
      transcriptRemoved: "Transcript removed",
      transcriptTooLarge: "This file is too large to be a transcript.",
      transcriptNotText: "Choose the .transcript.txt file that your laptop made.",
      transcriptMismatch: "This transcript's file name doesn't match this recording ({file}). Add it anyway?",
      transcriptFailed: "Couldn't add the transcript",
      transcriptReplace: "Replace",
      transcriptRemove: "Remove",
      transcriptRemoveConfirm: "Remove the transcript from MIA? The file in OneDrive is not affected.",
      copy: "Copy",
      copied: "Copied",
      close: "Close",
      shareText: "Share",
      summaryCopy: "Copy for summary",
      summaryCopied: "Copied ✓",
      summaryHint: "Copies the transcript with summary instructions. Paste it into Claude.",
      openClaude: "Open Claude",
      dbError: "Couldn't open storage on this device"
    }
  };

  // Small inline icons (static markup, no external files).
  const svg = (body, fill) => '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (fill ? "currentColor" : "none") +
    '" stroke="' + (fill ? "none" : "currentColor") + '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
  const ICONS = {
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M10 17v-5l4-1v5"/><circle cx="9" cy="17" r="1.3"/><circle cx="13" cy="16" r="1.3"/>'),
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z"/>', true),
    share: svg('<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 14v4a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-4"/>'),
    pencil: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>'),
    text: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>')
  };

  const el = (id) => document.getElementById(id);
  const state = {
    language: "en",
    db: null,
    recorder: null,
    stream: null,
    chunks: [],
    chunkSequence: 0,
    chunkWriteQueue: Promise.resolve(),
    startedAt: null,
    timerHandle: null,
    elapsedTimer: null,
    currentObjectUrls: new Map(),
    recordingId: null,
    pendingWarning: false,
    userStopped: false,
    pausedAt: null,
    pausedTotal: 0,
    wakeLock: null,
    resume: null,
    auto: null,
    transcriptTarget: null,
    transcriptOpen: null
  };

  function t(key, params) {
    let text = translations[state.language][key] || key;
    if (params) for (const [name, value] of Object.entries(params)) text = text.replace("{" + name + "}", String(value));
    return text;
  }

  function showWarning(message) {
    const box = el("warning");
    box.textContent = message;
    box.classList.add("show");
  }

  function clearWarning() {
    const box = el("warning");
    box.textContent = "";
    box.classList.remove("show");
  }

  function setStatus(message, recording = false) {
    const paused = recording && !!state.pausedAt;
    el("statusText").textContent = message;
    el("statusDot").classList.toggle("live", recording && !paused);
    el("statusDot").classList.toggle("paused", paused);
    document.body.classList.toggle("is-recording", recording && !paused);
    document.body.classList.toggle("is-paused", paused);
    // Idle: one big Start button. Recording: Pause + Stop side by side.
    el("startButton").disabled = recording;
    el("startButton").classList.toggle("hidden", recording);
    el("stopButton").disabled = !recording;
    el("stopButton").classList.toggle("hidden", !recording);
    el("markButton").classList.toggle("hidden", !recording);
    el("importButton").disabled = recording;
    el("meetingTitle").disabled = recording;
    const pauseButton = el("pauseButton");
    const canPause = recording && typeof state.recorder?.pause === "function";
    pauseButton.classList.toggle("hidden", !canPause);
    el("stopButton").style.gridColumn = canPause || !recording ? "" : "1 / -1";
    pauseButton.querySelector(".label").textContent = t(paused ? "unpause" : "pause");
    pauseButton.querySelector(".icon-pause").classList.toggle("hidden", paused);
    pauseButton.querySelector(".icon-play").classList.toggle("hidden", !paused);
    el("heroHint").textContent = t(paused ? "heroPaused" : recording ? "heroLive" : state.resume ? "heroResume" : "heroIdle");
    if (recording) hideResume();
  }

  function resumeLabel(part) {
    return t("resume") + " · " + t("resumePart") + " " + part;
  }

  function offerResume(resume, hintKey) {
    state.resume = resume;
    el("resumeButton").querySelector(".label").textContent = resumeLabel(resume.part);
    el("resumeButton").classList.remove("hidden");
    el("controls").classList.add("has-resume");
    el("heroHint").textContent = t("heroResume");
    el("startButton").querySelector("[data-i18n]").textContent = t("startNew");
    showWarning(t(hintKey));
  }

  function hideResume() {
    state.resume = null;
    el("resumeButton").classList.add("hidden");
    el("controls").classList.remove("has-resume");
    el("startButton").querySelector("[data-i18n]").textContent = t("start");
  }

  function updateTranslations() {
    document.documentElement.lang = state.language;
    document.querySelectorAll("[data-i18n]").forEach(node => {
      const key = node.getAttribute("data-i18n");
      node.textContent = t(key);
    });
    el("meetingTitle").placeholder = t("titlePlaceholder");
    if (!state.recorder && !state.resume) setStatus(t("ready"), false);
    if (state.resume) el("resumeButton").querySelector(".label").textContent = resumeLabel(state.resume.part);
    renderRecordings();
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          const chunks = db.createObjectStore(CHUNK_STORE, { keyPath: ["recordingId", "index"] });
          chunks.createIndex("recordingId", "recordingId", { unique: false });
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked by another tab"));
    });
  }

  function dbRequest(mode, action, storeName = STORE_NAME) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let request;
      try {
        request = action(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Database request failed"));
      tx.onabort = () => reject(tx.error || new Error("Database transaction aborted"));
    });
  }

  async function saveRecording(record) {
    await dbRequest("readwrite", store => store.put(record));
    await renderRecordings();
  }

  async function getAllRecordings() {
    return (await dbRequest("readonly", store => store.getAll())) || [];
  }

  async function getChunks(recordingId) {
    return (await dbRequest("readonly", store => store.index("recordingId").getAll(recordingId), CHUNK_STORE)) || [];
  }

  async function deleteSessionData(recordingId) {
    const rows = await getChunks(recordingId);
    for (const row of rows) {
      await dbRequest("readwrite", store => store.delete([recordingId, row.index]), CHUNK_STORE);
    }
    await dbRequest("readwrite", store => store.delete(recordingId), SESSION_STORE);
  }

  async function recoverInterruptedSessions() {
    const sessions = (await dbRequest("readonly", store => store.getAll(), SESSION_STORE)) || [];
    let latest = null;
    for (const session of sessions) {
      const rows = await getChunks(session.id);
      const blob = new Blob(rows.sort((a, b) => a.index - b.index).map(row => row.blob), {
        type: session.mimeType || "application/octet-stream"
      });
      if (blob.size > 0) {
        const now = Date.now();
        await saveRecording({
          id: session.id,
          title: (session.title || "MIA") + t("recoveredSuffix"),
          fileName: session.fileName,
          origin: "live",
          createdAt: session.startedAt,
          durationSeconds: rows.length,
          mimeType: blob.type,
          blob,
          size: blob.size,
          incomplete: true,
          live: liveTake(session.id)
        });
        session.endedAt = session.startedAt + rows.length * 1000;
        if (!latest || session.startedAt > latest.startedAt) latest = session;
      }
      await deleteSessionData(session.id);
    }
    // Only offer to continue if the interrupted recording started recently.
    if (latest && Date.now() - latest.startedAt < 6 * 60 * 60 * 1000) {
      offerResume({ ...nextPart(latest), series: latest.series || latest.id, since: latest.endedAt || latest.startedAt }, "recoveredHint");
      setStatus(t("stoppedUnexpectedly"), false);
      const endedAt = latest.endedAt || latest.startedAt;
      if (Date.now() - endedAt < AUTO_RESUME_MS) scheduleAutoResume(state.resume, endedAt);
    }
  }

  function nextPart(session) {
    return {
      baseTitle: session.baseTitle ?? session.title ?? "",
      part: (session.part || 1) + 1
    };
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return h + ":" + m + ":" + r;
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(value));
    } catch {
      return t("unknownDate");
    }
  }

  function revokeObjectUrl(id) {
    const old = state.currentObjectUrls.get(id);
    if (old) URL.revokeObjectURL(old);
    state.currentObjectUrls.delete(id);
  }

  async function renderRecordings() {
    const container = el("records");
    if (!state.db) return;
    let records;
    try {
      records = await getAllRecordings();
    } catch {
      return;
    }
    records.sort((a, b) => b.createdAt - a.createdAt);
    el("recordCount").textContent = String(records.length);
    el("statTotal").textContent = String(records.length);
    el("statUnexported").textContent = String(records.filter(record => !record.exportedAt).length);
    renderReminders(records);
    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      const icon = document.createElement("div");
      icon.className = "empty-face";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<span class="eye"><i></i></span><span class="eye"><i></i></span>';
      const title = document.createElement("div");
      title.className = "empty-title";
      title.textContent = t("empty");
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = t("emptyHint");
      empty.append(icon, title, hint);
      container.append(empty);
      return;
    }

    records.forEach((record, position) => {
      const item = document.createElement("article");
      item.className = "record tone-" + (position % 4);
      item.dataset.recordId = record.id;

      const head = document.createElement("div");
      head.className = "record-head";
      const icon = document.createElement("div");
      icon.className = "record-icon";
      icon.innerHTML = record.origin === "imported" ? ICONS.file : ICONS.mic;
      const main = document.createElement("div");
      main.className = "record-main";

      const name = document.createElement("div");
      name.className = "record-name";
      name.textContent = record.title || record.fileName || "MIA audio";

      const meta = document.createElement("div");
      meta.className = "record-meta";
      meta.textContent = [
        formatDate(record.createdAt),
        record.durationSeconds ? formatDuration(record.durationSeconds) : "",
        humanBytes(record.blob?.size || 0)
      ].filter(Boolean).join(" · ");
      main.append(name, meta);
      head.append(icon, main);

      const badges = document.createElement("div");
      badges.className = "badges";
      const badge = (text, kind) => {
        const node = document.createElement("span");
        node.className = "badge" + (kind ? " " + kind : "");
        node.textContent = text;
        badges.append(node);
      };
      if (record.exportedAt) badge(t("exportedOn") + " " + formatDate(record.exportedAt), "ok");
      else badge(t("notExported"), "warn");
      if (record.incomplete) badge(t("incomplete"), "warn");
      if (record.origin === "imported") badge(t("importedType"));
      if (record.transcript) badge(t("transcriptBadge"), "ok");
      if (!record.exportedAt) item.classList.add("unexported");

      const actions = document.createElement("div");
      actions.className = "record-actions";
      const action = (label, iconSvg, className, handler) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action" + (className ? " " + className : "");
        button.innerHTML = iconSvg; // static, trusted markup only
        const text = document.createElement("span");
        text.textContent = label;
        button.append(text);
        button.addEventListener("click", handler);
        actions.append(button);
      };
      action("Minutes", ICONS.text, "primary", () => sendToAgent(record.id));
      action(t("play"), ICONS.play, "", () => playRecord(record.id));
      action(t("export"), ICONS.share, "", () => exportRecord(record.id));
      action(t("rename"), ICONS.pencil, "", () => renameRecord(record.id));
      action(t("delete"), ICONS.trash, "danger", () => deleteRecord(record.id));

      item.append(head, badges, actions);
      container.append(item);
    });
  }

  function humanBytes(value) {
    if (!value) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return (value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + " " + units[index];
  }

  // MIA never deletes recordings on its own. Recordings older than the
  // retention target, and recordings never exported, are only flagged so the
  // user can export them and delete them deliberately.
  function renderReminders(records) {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const unexported = records.filter(record => !record.exportedAt).length;
    const old = records.filter(record => record.createdAt < cutoff).length;
    const lines = [];
    if (unexported) lines.push(t("reminderUnexported", { n: unexported }));
    if (old) lines.push(t("reminderOld", { n: old }));
    const box = el("reminder");
    box.textContent = lines.join(" ");
    box.classList.toggle("show", lines.length > 0);
  }

  function bestMimeType() {
    if (!window.MediaRecorder) return "";
    const candidates = [
      "audio/mp4",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ];
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) {
      showWarning(t("wakeLockUnavailable"));
      return;
    }
    try {
      const lock = await navigator.wakeLock.request("screen");
      state.wakeLock = lock;
      lock.addEventListener("release", () => {
        if (state.wakeLock === lock) state.wakeLock = null;
        setTimeout(() => {
          if (!state.wakeLock && state.recorder && state.recorder.state !== "inactive" && document.visibilityState === "visible") acquireWakeLock();
        }, 1000);
      });
    } catch {
      showWarning(t("wakeLockUnavailable"));
    }
  }

  function releaseWakeLock() {
    const lock = state.wakeLock;
    state.wakeLock = null;
    if (lock) lock.release().catch(() => {});
  }

  async function startRecording(resume = null, gapNote = "") {
    if (!gapNote) state.auto = null;
    clearWarning();
    const continuing = resume && typeof resume.part === "number" ? resume : null;
    hideResume();

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showWarning(t("micUnsupported"));
      return;
    }

    const mimeType = bestMimeType();
    if (!mimeType) {
      showWarning(t("micUnsupported"));
      return;
    }

    try {
      audioMode("play-and-record");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // No echo cancelling or noise removal: they can clip quiet speech.
          // Auto gain on: lifts a speaker who is far from the iPhone.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1
        }
      });

      state.stream = stream;
      const microphoneTrack = stream.getAudioTracks()[0];
      if (microphoneTrack) {
        microphoneTrack.addEventListener("mute", () => {
          state.pendingWarning = true;
          showWarning(t("trackMuted"));
          // Stop instead of silently saving a long section of silence.
          if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
        });
        microphoneTrack.addEventListener("ended", () => {
          state.pendingWarning = true;
          showWarning(t("trackEnded"));
          if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
        });
      }
      state.chunks = [];
      state.chunkSequence = 0;
      state.chunkWriteQueue = Promise.resolve();
      state.pendingWarning = false;
      state.startedAt = Date.now();
      state.pausedAt = null;
      state.pausedTotal = 0;
      state.recordingId = crypto.randomUUID();
      state.marks = [];
      updateMarkLabel();
      liveStart(state.recordingId);
      if (gapNote) { live.lines.push({ at: 0, text: gapNote }); liveSave(); liveRender(); }

      const baseTitle = (continuing ? continuing.baseTitle : (el("meetingTitle").value || "").trim())
        || t("meetingWord") + " " + formatDate(state.startedAt);
      const part = continuing ? continuing.part : 1;
      const title = part > 1
        ? baseTitle + " · " + t("resumePart") + " " + part
        : baseTitle;
      const extension = fileExtension(mimeType);
      const fileName = "MIA-" + new Date(state.startedAt).toISOString().replace(/[:.]/g, "-") + "." + extension;
      await dbRequest("readwrite", store => store.put({
        id: state.recordingId,
        title,
        baseTitle,
        part,
        fileName,
        startedAt: state.startedAt,
        mimeType,
        // Parts of one session (split by a call or lock) share a series id, so
        // the Agent writes ONE report for the whole session.
        series: continuing && continuing.series || null,
        gapSec: continuing && continuing.since ? Math.round((Date.now() - continuing.since) / 1000) : 0
      }), SESSION_STORE);
      state.userStopped = false;

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      state.recorder = recorder;

      recorder.addEventListener("dataavailable", event => {
        if (!event.data || event.data.size === 0 || !state.recordingId) return;
        const recordingId = state.recordingId;
        const index = state.chunkSequence++;
        state.chunkWriteQueue = state.chunkWriteQueue
          .then(() => dbRequest("readwrite", store => store.put({ recordingId, index, blob: event.data }), CHUNK_STORE))
          .catch(error => {
            state.pendingWarning = true;
            showWarning(t("storageFailed") + " " + (error?.message || ""));
          });
      });

      recorder.addEventListener("error", event => {
        showWarning(event.error?.message || t("storageFailed"));
      });

      recorder.addEventListener("stop", async () => {
        state.saving = true;
        setTimeout(() => { state.saving = false; }, 15000);
        const endedAt = Date.now();
        const recordingId = state.recordingId;
        const recordedSeconds = elapsedSeconds(endedAt);
        const wasPossiblyInterrupted = state.pendingWarning;
        const stoppedByUser = state.userStopped;
        const marks = (state.marks || []).slice();
        const liveText = liveStop();
        const preCount = await segStop();
        levelStop();
        await state.chunkWriteQueue;
        const rows = recordingId ? await getChunks(recordingId) : [];
        const blob = new Blob(rows.sort((a, b) => a.index - b.index).map(row => row.blob), {
          type: recorder.mimeType || mimeType
        });
        const sessionRows = recordingId
          ? await dbRequest("readonly", store => store.get(recordingId), SESSION_STORE)
          : null;
        stopTracks();
        releaseWakeLock();

        state.recorder = null;
        state.chunks = [];
        state.startedAt = null;
        state.pausedAt = null;
        state.pausedTotal = 0;
        state.recordingId = null;
        state.pendingWarning = false;
        stopTimer();

        if (!blob.size || !recordingId) {
          if (recordingId) await deleteSessionData(recordingId);
          setStatus(t("ready"), false);
          showWarning(t("noAudio"));
          if (!stoppedByUser && sessionRows) { offerResume({ baseTitle: sessionRows.baseTitle ?? "", part: sessionRows.part || 1, series: sessionRows.series || null, since: endedAt }, "resumeHint"); scheduleAutoResume(state.resume, endedAt); }
          return;
        }

        const title = sessionRows?.title || t("meetingWord");
        const fileName = sessionRows?.fileName || ("MIA-" + new Date(endedAt).toISOString().replace(/[:.]/g, "-") + "." + fileExtension(blob.type));
        const record = {
          id: recordingId,
          title,
          fileName,
          origin: "live",
          createdAt: endedAt,
          durationSeconds: recordedSeconds,
          mimeType: blob.type || "application/octet-stream",
          blob,
          size: blob.size,
          incomplete: wasPossiblyInterrupted,
          marks,
          live: liveText
        };

        try {
          await saveRecording(record);
          await deleteSessionData(recordingId);
          // Hand the recording to the Agent so the transcript and minutes start by
          // themselves. If iOS stopped it (call, lock), the user can still Resume;
          // the Agent then gets this first part only when they tap Minutes.
          const handOff = (stay = false) => {
            if (!window.MIAAgent || !window.MIAAgent.addAudio) { showWarning("Agent isn't loaded. Close MIA and open it again, then tap Minutes."); return; }
            Promise.resolve(window.MIAAgent.addAudio(blob, title, { recordId: recordingId, duration: recordedSeconds, marks, stay, live: liveText, series: sessionRows && sessionRows.series, gapSec: sessionRows && sessionRows.gapSec, pre: preCount ? recordingId : null, preCount }))
              .catch(error => showWarning("The recording is saved, but the report didn't start (" + (error?.message || error?.name || "storage error") + "). Open Agent and tap the recording to try again."));
          };
          if (!stoppedByUser) {
            setStatus(t("stoppedUnexpectedly"), false);
            offerResume({ ...nextPart(sessionRows || { baseTitle: "", part: 1 }), series: (sessionRows && sessionRows.series) || recordingId, since: endedAt }, "resumeHint");
            scheduleAutoResume(state.resume, endedAt);
            // iOS stopped it (call, lock, app switch). Still send this part to the
            // Agent in the background so nothing waits on the user; the Record tab
            // stays open so they can Resume. A resumed part becomes its own job.
            handOff(true);
          } else {
            setStatus(t("saved"), false);
            if (!wasPossiblyInterrupted) clearWarning();
            else showWarning(t("interruption"));
            handOff();
          }
        } catch (error) {
          setStatus(t("ready"), false);
          showWarning(t("storageFailed") + " " + (error?.message || ""));
        }
      });

      recorder.start(1000);
      segStart(stream, mimeType, state.recordingId);
      levelStart(stream);
      liveRender();
      setStatus(t("recordingStarted"), true);
      startTimer();
      await acquireWakeLock();
    } catch (error) {
      stopTracks();
      releaseWakeLock();
      state.recorder = null;
      state.stream = null;
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        showWarning(t("micDenied"));
      } else {
        showWarning((error?.message || t("micUnsupported")));
      }
    }
  }

  // ---------- Live text (like phone dictation) ----------
  // Safari's speech recognition turns speech into text while recording, so the
  // minutes can be written right after Stop without uploading the audio. iOS
  // ends each recognition session after a short while or a pause, so it is
  // restarted for as long as the recording runs. The audio is still recorded
  // as a backup ("Improve accuracy" re-listens to it).
  // Apple's live speech-to-text is OFF: on iPhone it takes over the microphone,
  // so the real recording became silent. The good engines now transcribe the
  // audio in the background every 2 minutes instead (see "Segments" below).
  const Speech = null;
  const live = { rec: null, on: false, lines: [], interim: "", failed: "", lastEvent: 0, dog: null, id: null, all: new Set() };
  // Live lines are also kept in localStorage while recording, so a crash or an
  // iOS reload keeps the text of the recovered part.
  const liveKey = id => "mia-live-" + id;
  const fmtStamp = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  const liveAsText = lines => lines.map(l => "[" + fmtStamp(l.at) + "] " + l.text).join("\n");
  function liveSave() { if (live.id) { try { localStorage.setItem(liveKey(live.id), JSON.stringify(live.lines)); } catch {} } }
  function liveTake(id) {
    try { const raw = localStorage.getItem(liveKey(id)); localStorage.removeItem(liveKey(id)); return raw ? liveAsText(JSON.parse(raw)) : ""; } catch { return ""; }
  }
  // ---------- Segments: transcribe while recording ----------
  // A second recorder on the same microphone closes a small file every
  // 2 minutes and hands it to the Agent, which transcribes it right away with
  // Whisper + Typhoon. At Stop only the last piece is left, so the report comes
  // quickly and from the accurate engines. The main recording is untouched.
  const SEG_SECONDS = (() => { try { return Number(localStorage.getItem("mia-seg-seconds")) || 120; } catch { return 120; } })();
  const seg = { rec: null, idx: 0, delivered: 0, startAt: 0, timer: null, rid: null, mime: "", off: false, done: null, text: "" };
  function segOne() {
    const r = new MediaRecorder(state.stream, { mimeType: seg.mime, audioBitsPerSecond: 64000 });
    const parts = [], idx = seg.idx++, offset = seg.startAt, rid = seg.rid;
    r.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    r.onstop = () => {
      const blob = new Blob(parts, { type: r.mimeType || seg.mime });
      if (blob.size && window.MIAAgent && window.MIAAgent.preSegment) window.MIAAgent.preSegment(rid, idx, blob, offset);
      else seg.idx = -1;   // a missing piece: the Agent re-listens to the whole recording instead
      seg.delivered++;
      if (seg.done && seg.delivered >= seg.idx) seg.done();
    };
    r.start(1000);
    seg.rec = r;
  }
  function segStart(stream, mime, rid) {
    clearInterval(seg.timer);
    Object.assign(seg, { rec: null, idx: 0, delivered: 0, startAt: 0, rid, mime, off: false, done: null, text: "" });
    if (!window.MIAAgent || !window.MIAAgent.preReady || !window.MIAAgent.preReady()) { seg.off = true; return; }
    try { segOne(); } catch { seg.off = true; return; }
    seg.timer = setInterval(() => {
      if (!state.recorder || state.recorder.state !== "recording" || !seg.rec) return;
      const now = elapsedSeconds();
      // First piece after 45 s so text shows up early; then every 2 minutes.
      if (now - seg.startAt < (seg.idx === 1 ? Math.min(45, SEG_SECONDS) : SEG_SECONDS)) return;
      const old = seg.rec;
      seg.startAt = now;
      try { segOne(); } catch { seg.off = true; }
      try { old.stop(); } catch {}
    }, 2000);
  }
  function segStop() {
    clearInterval(seg.timer);
    if (seg.off || !seg.rec) return Promise.resolve(0);
    return new Promise(resolve => {
      const finish = () => { seg.done = null; resolve(seg.idx > 0 ? seg.idx : 0); };
      seg.done = finish;
      try { seg.rec.state !== "inactive" ? seg.rec.stop() : finish(); } catch { finish(); }
      seg.rec = null;
      setTimeout(finish, 4000);
    });
  }
  // The Agent calls this as each piece is transcribed.
  window.MIAPreview = (rid, text) => {
    if (rid !== seg.rid) return;
    seg.text = text || "";
    liveRender();
  };

  // ---------- Microphone level: warn if MIA only hears silence ----------
  const level = { ctx: null, an: null, timer: null, quietSince: 0, warned: false };
  function levelStart(stream) {
    levelStop();
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      level.ctx = new Ctx();
      level.ctx.resume && level.ctx.resume().catch(() => {});
      level.an = level.ctx.createAnalyser();
      level.an.fftSize = 1024;
      level.ctx.createMediaStreamSource(stream).connect(level.an);
    } catch { return; }
    const buf = new Float32Array(level.an.fftSize);
    level.quietSince = Date.now(); level.warned = false;
    level.timer = setInterval(() => {
      if (!level.an || !state.recorder || state.pausedAt) { level.quietSince = Date.now(); return; }
      if (level.ctx.state !== "running") return;   // can't measure: never warn by mistake
      level.an.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const bar = el("levelFill");
      if (bar) bar.style.width = Math.min(100, Math.round(rms * 600)) + "%";
      if (rms > 0.004) { level.quietSince = Date.now(); if (level.warned) { level.warned = false; clearWarning(); } return; }
      if (!level.warned && Date.now() - level.quietSince > 12000) {
        level.warned = true;
        showWarning("MIA hears only silence. Check that no other app is using the microphone and that nothing covers it.");
        try { window.MIAAgent && window.MIAAgent.diag && window.MIAAgent.diag("Recording was silent for 12 s"); } catch {}
      }
    }, 500);
  }
  function levelStop() {
    clearInterval(level.timer); level.timer = null;
    try { level.ctx && level.ctx.close(); } catch {}
    level.ctx = null; level.an = null;
    const bar = el("levelFill"); if (bar) bar.style.width = "0%";
  }

  function liveRender() {
    const box = el("liveBox");
    if (!box) return;
    const recording = !!state.recorder;
    box.classList.toggle("hidden", !recording);
    const pre = (seg.text || "").split("\n").filter(Boolean).slice(-3).map(l => l.replace(/^\[[\d:]+\]\s*/, "")).join(" ");
    const last = live.lines.slice(-3).map(l => l.text).join(" ");
    el("liveText").textContent = (pre || last).trim() || (seg.off ? "Recording… the transcript is made after Stop." : "Recording… the first lines appear after about 1 minute.");
  }
  function liveStart(id) {
    live.lines = []; live.interim = ""; live.failed = ""; live.id = id || null;
    if (!Speech) return;
    live.on = true;
    const run = () => {
      if (!live.on) return;
      // Never more than one recogniser: an old one left running would keep
      // the mic on (and keep writing text) after Stop.
      liveKill();
      const r = new Speech();
      live.all.add(r);
      r.lang = "th-TH"; r.continuous = true; r.interimResults = true;
      r.onresult = e => {
        if (!live.on || r !== live.rec) { liveKillOne(r); return; }
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i], text = (res[0] && res[0].transcript || "").trim();
          if (!text) continue;
          // Time = when the sentence STARTED (iOS can take a minute to
          // finalise a long sentence), not when it was finalised.
          if (live.segAt == null) live.segAt = Math.max(0, Math.round(elapsedSeconds()) - 2);
          if (res.isFinal) { live.lines.push({ at: live.segAt, text }); live.segAt = null; liveSave(); }
          else interim += " " + text;
        }
        live.interim = interim.trim();
        live.lastEvent = Date.now();
        liveRender();
      };
      r.onerror = e => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
          live.on = false; live.failed = "Live text isn't available here. The recording continues.";
          liveRender();
        }
      };
      r.onend = () => {
        live.all.delete(r);
        // A session that ends without a final result: keep what was heard.
        if (r === live.rec && live.interim) { live.lines.push({ at: live.segAt != null ? live.segAt : Math.round(elapsedSeconds()), text: live.interim }); live.interim = ""; liveSave(); }
        if (r === live.rec) live.segAt = null;
        if (live.on && r === live.rec) setTimeout(() => { if (live.on && r === live.rec && !state.pausedAt && state.recorder) run(); }, 250);
      };
      live.rec = r;
      live.lastEvent = Date.now();
      try { r.start(); } catch { setTimeout(() => { if (live.on && r === live.rec && !state.pausedAt && state.recorder) run(); }, 1000); }
    };
    live.run = run;
    run();
    // Watchdog: if iOS silently stops recognising (no result, no end event)
    // for 45 s while recording, start a fresh session.
    clearInterval(live.dog);
    live.dog = setInterval(() => {
      if (!live.on || !state.recorder) { clearInterval(live.dog); return; }
      if (state.pausedAt) return;
      if (Date.now() - live.lastEvent > 45000) run();
    }, 15000);
    liveRender();
  }
  function liveKillOne(r) {
    if (!r) return;
    r.onresult = r.onend = r.onerror = null;
    try { r.abort ? r.abort() : r.stop(); } catch {}
    live.all.delete(r);
  }
  function liveKill() {
    for (const r of [...live.all]) liveKillOne(r);
    live.rec = null;
  }
  function livePause(paused) {
    if (!live.on && !live.rec) return;
    if (paused) liveKill();
    else if (live.on && live.run) { live.lastEvent = Date.now(); live.run(); }
  }
  function liveStop() {
    live.on = false;
    clearInterval(live.dog);
    if (live.interim) { live.lines.push({ at: live.segAt != null ? live.segAt : Math.round(elapsedSeconds()), text: live.interim }); live.interim = ""; }
    live.segAt = null;
    liveKill();
    const text = liveAsText(live.lines);
    if (live.id) { try { localStorage.removeItem(liveKey(live.id)); } catch {} }
    live.id = null;
    liveRender();
    return text;
  }

  // Bookmarks: the user taps Mark when something important is said. The
  // Agent highlights those moments in the transcript and the minutes.
  function updateMarkLabel() {
    const n = (state.marks || []).length;
    el("markButton").querySelector(".label").textContent = n ? "Mark this moment · " + n : "Mark this moment";
  }
  function markMoment() {
    if (!state.recorder) return;
    const sec = Math.round(elapsedSeconds());
    state.marks = state.marks || [];
    state.marks.push(sec);
    updateMarkLabel();
    const mm = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
    el("heroHint").textContent = "Marked " + mm + " ★";
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") {
      state.userStopped = true;
      // Turn live text off at once (privacy): no more listening after Stop.
      live.on = false; clearInterval(live.dog); liveKill();
      state.recorder.stop();
    }
  }

  // Recorded time, excluding paused periods.
  function elapsedSeconds(now = Date.now()) {
    if (!state.startedAt) return 0;
    const pausedNow = state.pausedAt ? now - state.pausedAt : 0;
    return Math.max(0, (now - state.startedAt - state.pausedTotal - pausedNow) / 1000);
  }

  function togglePause() {
    const recorder = state.recorder;
    if (!recorder) return;
    try {
      if (recorder.state === "recording") {
        recorder.pause();
        try { seg.rec && seg.rec.state === "recording" && seg.rec.pause(); } catch {}
        state.pausedAt = Date.now();
        livePause(true);
        setStatus(t("paused"), true);
      } else if (recorder.state === "paused") {
        recorder.resume();
        try { seg.rec && seg.rec.state === "paused" && seg.rec.resume(); } catch {}
        state.pausedTotal += Date.now() - (state.pausedAt || Date.now());
        state.pausedAt = null;
        livePause(false);
        setStatus(t("recordingStarted"), true);
      }
      updateTimer();
    } catch (error) {
      showWarning(error?.message || t("storageFailed"));
    }
  }

  function startTimer() {
    stopTimer();
    updateTimer();
    state.timerHandle = window.setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    if (!state.startedAt) return;
    el("timer").textContent = formatDuration(elapsedSeconds());
  }

  function stopTimer() {
    if (state.timerHandle) window.clearInterval(state.timerHandle);
    state.timerHandle = null;
    el("timer").textContent = "00:00:00";
  }

  function stopTracks() {
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
    }
    audioMode("playback");
  }
  // iOS 17+: while the mic is in use the iPhone plays sound quietly (call mode).
  // Switch back to normal media playback whenever the mic is off.
  function audioMode(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch {}
  }

  function fileExtension(mime) {
    if (mime.includes("mp4")) return "m4a";
    if (mime.includes("ogg")) return "ogg";
    return "webm";
  }

  async function importFile(file) {
    if (!file) return;
    clearWarning();
    if (file.size > MAX_RECORDING_BYTES) {
      showWarning(t("fileLarge"));
      return;
    }
    if (!file.type.startsWith("audio/") && !/\.(m4a|mp3|wav|aac|caf|mp4|ogg|webm)$/i.test(file.name)) {
      showWarning(t("noAudio"));
      return;
    }
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" });
      const id = crypto.randomUUID();
      await saveRecording({
        id,
        title: file.name,
        fileName: file.name,
        origin: "imported",
        createdAt: Date.now(),
        durationSeconds: 0,
        mimeType: blob.type,
        blob,
        size: blob.size
      });
      setStatus(t("imported"), false);
      // Straight to the Agent: transcript and minutes start by themselves.
      await window.MIAAgent?.addAudio(blob, file.name.replace(/\.[a-z0-9]+$/i, ""), { recordId: id });
    } catch (error) {
      showWarning(t("importFailed") + ": " + (error?.message || ""));
    }
  }

  async function getRecord(id) {
    return dbRequest("readonly", store => store.get(id));
  }

  // iOS Safari often can't play or share a Blob straight out of IndexedDB
  // ("WebKitBlobResource error"). A fresh in-memory copy works.
  const diagApp = m => { try { window.MIAAgent && window.MIAAgent.diag && window.MIAAgent.diag(m); } catch {} };
  async function freshBlob(record) {
    try {
      const buf = await record.blob.arrayBuffer();
      return new Blob([buf], { type: record.mimeType || record.blob.type || "audio/mp4" });
    } catch (e) {
      diagApp("Couldn't read the saved audio (" + (e && (e.name || e.message)) + "), size " + (record.blob && record.blob.size));
      return record.blob;
    }
  }
  // Last resort for playback: decode with Web Audio and play a WAV copy.
  async function wavCopy(blob, boost = false) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: 16000 });
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close && ctx.close();
    const ch = audio.getChannelData(0), n = ch.length;
    let peak = 0; for (let i = 0; i < n; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
    const gain = peak > 0.001 && peak < 0.5 ? Math.min(10, 0.9 / peak) : 1;
    if (boost) {
      diagApp("Playback level: peak " + peak.toFixed(3) + (gain > 1 ? ", made " + gain.toFixed(1) + "x louder" : ", normal"));
      if (gain === 1) return null;
      for (let i = 0; i < n; i++) ch[i] *= gain;
    }
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, audio.sampleRate, true); v.setUint32(28, audio.sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 0x7fff, true);
    return new Blob([buf], { type: "audio/wav" });
  }

  async function sendToAgent(id) {
    try {
      const record = await getRecord(id);
      if (!record?.blob) throw new Error(t("noAudio"));
      await window.MIAAgent?.addAudio(await freshBlob(record), record.title, { recordId: record.id, duration: record.durationSeconds, marks: record.marks || [], live: record.live || "" });
    } catch (error) {
      showWarning(error?.message || t("noAudio"));
    }
  }

  async function playRecord(id) {
    try {
      const record = await getRecord(id);
      if (!record?.blob) throw new Error("Audio file not found");
      revokeObjectUrl(id);
      if (!state.stream) audioMode("playback");
      const blob = await freshBlob(record);
      let url = URL.createObjectURL(blob);
      // Quiet recording: play a louder copy (clips up to 20 min, to spare memory).
      if ((record.durationSeconds || 0) <= 1200) {
        try { const loud = await wavCopy(blob, true); if (loud) { URL.revokeObjectURL(url); url = URL.createObjectURL(loud); } } catch {}
      }
      state.currentObjectUrls.set(id, url);

      const recordElement = document.querySelector(`[data-record-id="${CSS.escape(id)}"]`);
      if (!recordElement) throw new Error("Recording row not found");
      recordElement.querySelector("audio")?.remove();
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = url;
      let triedWav = false;
      const onErr = async () => {
        const code = audio.error ? audio.error.code : "?";
        if (triedWav) { diagApp("Playback failed even as WAV (code " + code + ")"); showWarning("This recording can't be played on this iPhone. The transcript and report are not affected."); return; }
        triedWav = true;
        diagApp("Playback error code " + code + " for " + (blob.type || "?") + ", " + blob.size + " bytes. Trying a WAV copy.");
        try {
          const wavUrl = URL.createObjectURL(await wavCopy(blob));
          state.currentObjectUrls.set(id, wavUrl);
          audio.src = wavUrl;
          await audio.play().catch(() => {});
        } catch (e) {
          diagApp("The audio file couldn't be decoded (" + (e && (e.name || e.message)) + ")");
          showWarning("This recording can't be played on this iPhone. The transcript and report are not affected.");
        }
      };
      audio.addEventListener("error", onErr);
      recordElement.append(audio);
      await audio.play().catch(e => { if (e && e.name === "NotSupportedError") onErr(); });
    } catch (error) {
      showWarning((error?.message || t("noAudio")));
    }
  }

  async function exportRecord(id) {
    try {
      const record = await getRecord(id);
      if (!record?.blob) throw new Error(t("noExport"));
      if (navigator.share && typeof File === "function") {
        const shareFile = new File([await freshBlob(record)], record.fileName || "MIA-audio", { type: record.mimeType || record.blob.type });
        if (navigator.canShare?.({ files: [shareFile] })) {
          await navigator.share({ files: [shareFile], title: record.title || "MIA audio" });
          await markExported(id);
          return;
        }
      }
      const url = URL.createObjectURL(await freshBlob(record));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.fileName || "MIA-audio";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await markExported(id);
    } catch (error) {
      if (error?.name !== "AbortError") showWarning(t("noExport") + ": " + (error?.message || ""));
    }
  }

  async function renameRecord(id) {
    try {
      const record = await getRecord(id);
      if (!record) return;
      const answer = window.prompt(t("renamePrompt"), record.title || "");
      const title = (answer || "").trim().slice(0, 120);
      if (!title || title === record.title) return;
      record.title = title;
      await saveRecording(record);
      if (!state.recorder) setStatus(t("renamed"), false);
    } catch (error) {
      showWarning(error?.message || t("storageFailed"));
    }
  }

  // Transcripts are made on the user's laptop (tools/transcriber) and come back
  // through the Files app. MIA only reads the text file the user picks; it never
  // uploads audio or text anywhere.
  const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

  function baseName(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "");
  }

  function pickTranscript(id) {
    state.transcriptTarget = id;
    el("transcriptInput").click();
  }

  async function attachTranscript(file) {
    const id = state.transcriptTarget;
    state.transcriptTarget = null;
    if (!file || !id) return;
    clearWarning();
    try {
      if (file.size > MAX_TRANSCRIPT_BYTES) throw new Error(t("transcriptTooLarge"));
      if (!/\.(txt|text|md)$/i.test(file.name) && !(file.type || "").startsWith("text/")) throw new Error(t("transcriptNotText"));
      const record = await getRecord(id);
      if (!record) return;
      const expected = baseName(record.fileName);
      if (expected && !file.name.startsWith(expected) &&
          !window.confirm(t("transcriptMismatch", { file: expected + ".transcript.txt" }))) return;
      const text = (await file.text()).replace(/^﻿/, "");
      record.transcript = text;
      record.transcriptName = file.name;
      record.transcriptAddedAt = Date.now();
      await saveRecording(record);
      setStatus(t("transcriptAdded"), false);
      showTranscript(record);
    } catch (error) {
      showWarning(t("transcriptFailed") + ": " + (error?.message || ""));
    }
  }

  async function openTranscript(id) {
    try {
      const record = await getRecord(id);
      if (!record) return;
      if (record.transcript) showTranscript(record);
      else pickTranscript(id);
    } catch (error) {
      showWarning(t("transcriptFailed") + ": " + (error?.message || ""));
    }
  }

  function showTranscript(record) {
    const dialog = el("transcriptDialog");
    state.transcriptOpen = record.id;
    el("transcriptHeading").textContent = record.title || record.fileName || t("transcript");
    el("transcriptMeta").textContent = [record.transcriptName, record.transcriptAddedAt ? formatDate(record.transcriptAddedAt) : ""]
      .filter(Boolean).join(" · ");
    el("transcriptText").textContent = record.transcript || "";
    el("transcriptText").scrollTop = 0;
    el("openClaude").classList.remove("highlight");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeTranscript() {
    const dialog = el("transcriptDialog");
    state.transcriptOpen = null;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  async function copyTranscript() {
    const record = state.transcriptOpen && await getRecord(state.transcriptOpen);
    if (!record?.transcript) return;
    try {
      await navigator.clipboard.writeText(record.transcript);
      el("transcriptCopy").querySelector("span").textContent = t("copied");
      window.setTimeout(() => { el("transcriptCopy").querySelector("span").textContent = t("copy"); }, 1500);
    } catch {
      // Fall back to selecting the text so the user can copy it by hand.
      const range = document.createRange();
      range.selectNodeContents(el("transcriptText"));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  // Summaries are made by the user in their own Claude app (no API, no cost):
  // MIA copies the transcript together with these instructions, and the user
  // pastes it into Claude. MIA itself sends nothing anywhere.
  function summaryPrompt(record) {
    return [
      "ช่วยสรุปการประชุมจาก transcript ด้านล่างเป็นภาษาไทย สำหรับส่งให้ผู้บริหารอ่าน",
      "",
      "ชื่อการประชุม: " + (record.title || record.fileName || "-"),
      "",
      "รูปแบบที่ต้องการ:",
      "1. สรุปภาพรวม (3–5 บรรทัด)",
      "2. ประเด็นสำคัญที่หารือ (bullet แยกตามหัวข้อ)",
      "3. ข้อสรุป / การตัดสินใจ",
      "4. Action items เป็นตาราง: งาน | ผู้รับผิดชอบ | กำหนดส่ง (ถ้าไม่มีใน transcript ให้ใส่ \"ไม่ระบุ\")",
      "5. ประเด็นค้าง / คำถามที่ยังไม่มีคำตอบ",
      "6. ความเสี่ยงหรือข้อกังวลที่มีการพูดถึง",
      "",
      "ข้อกำหนด:",
      "- ใช้เฉพาะข้อมูลที่อยู่ใน transcript ห้ามเดาหรือเติมข้อมูลเอง",
      "- transcript นี้ถอดเสียงด้วยเครื่อง ชื่อคน ตัวเลข และศัพท์เฉพาะอาจผิด ถ้าไม่แน่ใจให้ทำเครื่องหมาย [ตรวจสอบ]",
      "- อ้างเวลา [ชม:นาที:วินาที] จาก transcript กำกับการตัดสินใจและ action item แต่ละข้อ",
      "- กระชับ เป็นทางการ",
      "",
      "----- TRANSCRIPT -----",
      record.transcript || ""
    ].join("\n");
  }

  async function copyForSummary() {
    const record = state.transcriptOpen && await getRecord(state.transcriptOpen);
    if (!record?.transcript) return;
    const text = summaryPrompt(record);
    const label = el("summaryCopy").querySelector("span");
    try {
      await navigator.clipboard.writeText(text);
      label.textContent = t("summaryCopied");
      el("openClaude").classList.add("highlight");
      window.setTimeout(() => { label.textContent = t("summaryCopy"); }, 4000);
    } catch {
      // Clipboard blocked: offer the iOS share sheet, where the Claude app can be picked directly.
      try {
        if (navigator.share) await navigator.share({ text });
      } catch (error) {
        if (error?.name !== "AbortError") showWarning(t("transcriptFailed") + ": " + (error?.message || ""));
      }
    }
  }

  async function shareTranscript() {
    const record = state.transcriptOpen && await getRecord(state.transcriptOpen);
    if (!record?.transcript) return;
    const name = record.transcriptName || (baseName(record.fileName) || "MIA") + ".transcript.txt";
    const file = new File([record.transcript], name, { type: "text/plain" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: record.title || t("transcript") });
        return;
      }
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (error?.name !== "AbortError") showWarning(t("transcriptFailed") + ": " + (error?.message || ""));
    }
  }

  async function removeTranscript() {
    const id = state.transcriptOpen;
    if (!id || !window.confirm(t("transcriptRemoveConfirm"))) return;
    const record = await getRecord(id);
    if (!record) return;
    delete record.transcript;
    delete record.transcriptName;
    delete record.transcriptAddedAt;
    closeTranscript();
    await saveRecording(record);
    setStatus(t("transcriptRemoved"), false);
  }

  async function markExported(id) {
    const record = await getRecord(id);
    if (!record) return;
    record.exportedAt = Date.now();
    await saveRecording(record);
    if (!state.recorder) setStatus(t("exportedMark"), false);
  }

  async function deleteRecord(id) {
    let record = null;
    try {
      record = await getRecord(id);
    } catch {
      // Fall back to the stronger warning below.
    }
    if (!window.confirm(t(record?.exportedAt ? "deleteConfirm" : "deleteConfirmUnexported"))) return;
    try {
      await dbRequest("readwrite", store => store.delete(id));
      revokeObjectUrl(id);
      await renderRecordings();
      setStatus(t("deleted"), false);
    } catch (error) {
      showWarning(error?.message || t("storageFailed"));
    }
  }

  // ---------- Auto-resume after a call, Siri, lock or app switch ----------
  // iOS stops the microphone during a call (answered or declined) and when the
  // page is hidden. The part so far is already saved and handed to the Agent.
  // As soon as MIA is on screen again, it starts the next part by itself, and
  // the transcript gets a line saying how long the gap was. Only for 20
  // minutes after the stop, so an old meeting never starts recording again.
  const AUTO_RESUME_MS = 20 * 60 * 1000;
  function gapText(ms) {
    const m = Math.round(ms / 60000);
    return m < 1 ? Math.max(1, Math.round(ms / 1000)) + " s" : m + " min";
  }
  function scheduleAutoResume(resume, since) {
    if (!resume) return;
    state.auto = { resume, since: since || Date.now(), tries: 0 };
    setTimeout(tryAutoResume, 1500);
  }
  async function tryAutoResume() {
    const a = state.auto;
    if (!a || a.busy || state.recorder || document.visibilityState !== "visible") return;
    if (Date.now() - a.since > AUTO_RESUME_MS) { state.auto = null; return; }
    a.busy = true; a.tries++;
    setStatus(t("autoResuming"), false);
    const gap = gapText(Date.now() - a.since);
    await startRecording(a.resume, "(Recording paused for about " + gap + " because of an interruption, e.g. a phone call. Anything said during the gap is missing.)");
    a.busy = false;
    if (state.recorder) {
      state.auto = null;
      showWarning(t("autoResumed").replace("{gap}", gap));
    } else if (a.tries < 3) {
      offerResume(a.resume, "resumeHint");
      setTimeout(tryAutoResume, 4000);
    } else {
      state.auto = null;
      offerResume(a.resume, "resumeHint");
      showWarning(t("autoResumeFailed"));
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden" && state.recorder && state.recorder.state === "recording") {
      state.pendingWarning = true;
      showWarning(t("interruption"));
    } else if (document.visibilityState === "visible") {
      // iOS releases the wake lock whenever the page is hidden.
      if (state.recorder && state.recorder.state !== "inactive" && !state.wakeLock) acquireWakeLock();
      // Keep the flag until finalization so the saved recording is marked for review.
      if (state.pendingWarning) showWarning(t("interruption"));
      if (state.auto) setTimeout(tryAutoResume, 800);
    }
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      const hadController = !!navigator.serviceWorker.controller;
      // Shows whether this copy could reach the update server, so the user knows
      // when a "new version" can't arrive (laptop off or not on the hotspot).
      const setLink = ok => document.querySelectorAll(".ver").forEach(v => {
        v.dataset.base = v.dataset.base || v.textContent;
        v.textContent = v.dataset.base + (ok ? "" : " · offline copy");
      });
      const check = reg => reg.update().then(() => setLink(true), () => setLink(false));
      window.MIACheckUpdate = () => navigator.serviceWorker.getRegistration().then(reg => reg ? check(reg) : setLink(false));
      navigator.serviceWorker.register("./sw.js")
        .then(check)
        .catch(() => {
          // App remains functional online even if offline caching is unavailable.
        });
      // When a new version takes over, reload once so the user sees it now,
      // not on the next launch. Never reload in the middle of a recording.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloaded) return;
        // Also wait while a recording is being saved and handed to the Agent,
        // or while the Agent is working, so an update never drops a job.
        const busy = () => state.recorder || state.saving || (window.MIAAgent && window.MIAAgent.busy());
        const reload = () => { if (!reloaded && !busy()) { reloaded = true; location.reload(); } };
        if (!busy()) reload();
        else document.addEventListener("visibilitychange", reload);
      });
    }
  }

  function bindEvents() {
    el("startButton").addEventListener("click", () => startRecording());
    el("resumeButton").addEventListener("click", () => startRecording(state.resume));
    el("stopButton").addEventListener("click", stopRecording);
    el("markButton").addEventListener("click", markMoment);
    el("pauseButton").addEventListener("click", togglePause);
    el("importButton").addEventListener("click", () => el("fileInput").click());
    el("fileInput").addEventListener("change", async event => {
      await importFile(event.target.files?.[0]);
      event.target.value = "";
    });
    el("transcriptInput").addEventListener("change", async event => {
      await attachTranscript(event.target.files?.[0]);
      event.target.value = "";
    });
    el("transcriptClose").addEventListener("click", closeTranscript);
    el("transcriptCopy").addEventListener("click", copyTranscript);
    el("transcriptShare").addEventListener("click", shareTranscript);
    el("summaryCopy").addEventListener("click", copyForSummary);
    el("transcriptReplace").addEventListener("click", () => {
      const id = state.transcriptOpen;
      closeTranscript();
      if (id) pickTranscript(id);
    });
    el("transcriptRemove").addEventListener("click", removeTranscript);
    el("transcriptDialog").addEventListener("close", () => { state.transcriptOpen = null; });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", () => { if (state.auto) setTimeout(tryAutoResume, 800); });
    window.addEventListener("focus", () => { if (state.auto) setTimeout(tryAutoResume, 800); });
    window.addEventListener("pagehide", () => {
      if (state.recorder && state.recorder.state === "recording") {
        showWarning(t("interruption"));
      }
    });
  }

  async function init() {
    bindEvents();
    updateTranslations();
    el("warning").textContent = "";
    try {
      state.db = await openDatabase();
      await recoverInterruptedSessions();
      if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
      await renderRecordings();
    } catch (error) {
      showWarning(t("dbError") + ": " + (error?.message || ""));
      el("startButton").disabled = true;
      el("importButton").disabled = true;
    }
    registerServiceWorker();
  }

  init();
})();
