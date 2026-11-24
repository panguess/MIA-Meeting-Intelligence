(() => {
  "use strict";

  const DB_NAME = "mia-local-recordings";
  const DB_VERSION = 1;
  const STORE_NAME = "recordings";
  const RETENTION_DAYS = 90;
  const MAX_RECORDING_BYTES = 1024 * 1024 * 1024; // 1 GiB guardrail; actual browser quota may be lower.

  const translations = {
    th: {
      tagline: "บันทึกการประชุมอย่างเป็นส่วนตัว",
      capture: "การบันทึกเสียง · ผ่าน iPhone เท่านั้น",
      ready: "พร้อมบันทึก",
      recording: "กำลังบันทึก",
      meetingTitle: "ชื่อการประชุม",
      start: "เริ่มบันทึก",
      stop: "หยุดและบันทึก",
      onlineTitle: "การประชุมออนไลน์",
      onlineCopy: "เปิด Teams บน Laptop แล้ววาง iPhone ใกล้ลำโพงเพื่อบันทึกเสียงจากห้องประชุม MIA ไม่ได้เชื่อมต่อกับ Teams โดยตรง",
      importTitle: "นำเข้าไฟล์เสียง",
      importCopy: "เลือกไฟล์เสียงจาก iPhone Files เพื่อเก็บไว้ใน MIA โดยไม่มีการอัปโหลดออกจากอุปกรณ์",
      chooseFile: "เลือกไฟล์เสียง",
      library: "ไฟล์เสียงในอุปกรณ์",
      empty: "ยังไม่มีไฟล์เสียง",
      privacy: "MIA รุ่นทดลอง · ไฟล์เก็บไว้บน iPhone เท่านั้น · เป้าหมายเก็บเสียง 90 วัน · ไม่มี Cloud AI หรือการส่งข้อมูลออก",
      micDenied: "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน โปรดอนุญาตใน Settings ของ Safari",
      micUnsupported: "เบราว์เซอร์นี้ไม่รองรับการบันทึกเสียงที่จำเป็น กรุณาใช้ Safari รุ่นปัจจุบัน",
      recordingStarted: "กำลังบันทึกเสียงบนอุปกรณ์นี้",
      saved: "บันทึกไฟล์เสียงไว้ในอุปกรณ์แล้ว",
      imported: "นำเข้าไฟล์เสียงแล้ว",
      importFailed: "นำเข้าไฟล์ไม่สำเร็จ",
      storageFailed: "บันทึกไฟล์ไม่สำเร็จ พื้นที่เบราว์เซอร์อาจไม่เพียงพอ",
      interruption: "ตรวจพบว่าแอปออกจากหน้าจอ อาจมีเสียงขาดหาย กรุณาอย่าล็อกหน้าจอหรือสลับแอประหว่างบันทึก",
      routeHint: "หากเปลี่ยนอุปกรณ์เสียง อาจมีช่วงเสียงขาดหาย",
      deleteConfirm: "ลบไฟล์เสียงนี้ออกจากอุปกรณ์หรือไม่?",
      deleted: "ลบไฟล์แล้ว",
      play: "เล่น",
      export: "ส่งออก",
      delete: "ลบ",
      live: "บันทึกสด",
      importedType: "นำเข้า",
      unknownDate: "ไม่ทราบวันที่",
      fileLarge: "ไฟล์มีขนาดใหญ่เกินขีดจำกัดของต้นแบบ 1 GiB",
      noAudio: "ไม่พบข้อมูลเสียงในไฟล์นี้",
      noExport: "ส่งออกไฟล์ไม่สำเร็จ",
      permissionTip: "อนุญาตใช้ไมโครโฟนเมื่อ Safari ถาม",
      backgroundWarning: "ข้อจำกัด iOS: Safari อาจหยุดบันทึกเมื่อถูกพักหรือหน้าจอล็อก จึงต้องเปิด MIA ค้างไว้และอย่าใช้กับการประชุมสำคัญจนกว่าจะทดสอบกับ iPhone จริง",
      installHint: "เพิ่ม MIA ไปยังหน้าจอโฮม: Safari → Share → Add to Home Screen",
      dbError: "เปิดพื้นที่จัดเก็บในอุปกรณ์ไม่ได้"
    },
    en: {
      tagline: "Private meeting audio capture",
      capture: "Audio capture · iPhone only",
      ready: "Ready to record",
      recording: "Recording",
      meetingTitle: "Meeting title",
      start: "Start recording",
      stop: "Stop and save",
      onlineTitle: "Online meetings",
      onlineCopy: "For Teams on a laptop, place the iPhone near the laptop speakers. MIA records acoustic audio and does not connect to Teams.",
      importTitle: "Import audio",
      importCopy: "Choose an audio file from iPhone Files. It is stored in MIA locally and is not uploaded.",
      chooseFile: "Choose audio file",
      library: "On-device audio files",
      empty: "No audio files yet",
      privacy: "MIA prototype · files stay on this iPhone · 90-day audio retention target · no Cloud AI or outbound audio transfer",
      micDenied: "Microphone permission was denied. Allow microphone access in Safari Settings.",
      micUnsupported: "This browser does not support the required audio recording APIs. Please use current Safari.",
      recordingStarted: "Recording on this device",
      saved: "Audio saved on this device",
      imported: "Audio file imported",
      importFailed: "Audio import failed",
      storageFailed: "Could not save the audio. Browser storage may be full.",
      interruption: "MIA was backgrounded or hidden. Audio may contain a gap. Do not lock the screen or switch apps while recording.",
      routeHint: "An audio route change may cause a recording gap.",
      deleteConfirm: "Delete this audio file from this device?",
      deleted: "Audio deleted",
      play: "Play",
      export: "Export",
      delete: "Delete",
      live: "Live recording",
      importedType: "Imported",
      unknownDate: "Unknown date",
      fileLarge: "File exceeds the prototype's 1 GiB limit",
      noAudio: "No audio data was found in this file",
      noExport: "Could not export audio",
      permissionTip: "Allow microphone access when Safari asks",
      backgroundWarning: "iOS limitation: Safari may suspend recording when backgrounded or when the screen locks. Keep MIA in the foreground. Do not use it for important meetings until tested on the actual iPhone.",
      installHint: "Add MIA to Home Screen: Safari → Share → Add to Home Screen",
      dbError: "Could not open local on-device storage"
    }
  };

  const el = (id) => document.getElementById(id);
  const state = {
    language: "th",
    db: null,
    recorder: null,
    stream: null,
    chunks: [],
    startedAt: null,
    timerHandle: null,
    elapsedTimer: null,
    currentObjectUrls: new Map(),
    recordingId: null,
    pendingWarning: false
  };

  function t(key) {
    return translations[state.language][key] || key;
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
    el("statusText").textContent = message;
    el("statusDot").classList.toggle("live", recording);
    el("startButton").disabled = recording;
    el("stopButton").disabled = !recording;
  }

  function updateTranslations() {
    document.documentElement.lang = state.language;
    document.querySelectorAll("[data-i18n]").forEach(node => {
      const key = node.getAttribute("data-i18n");
      node.textContent = t(key);
    });
    el("languageButton").textContent = state.language === "th" ? "EN" : "TH";
    el("meetingTitle").placeholder = state.language === "th" ? "เช่น Weekly Risk Review" : "e.g. Weekly Risk Review";
    if (!state.recorder) setStatus(t("ready"), false);
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
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked by another tab"));
    });
  }

  function dbRequest(mode, action) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
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

  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return h + ":" + m + ":" + r;
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat(state.language === "th" ? "th-TH" : "en-GB", {
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
    container.replaceChildren();

    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "copy";
      empty.textContent = t("empty");
      container.append(empty);
      return;
    }

    for (const record of records) {
      const item = document.createElement("div");
      item.className = "record";

      const name = document.createElement("div");
      name.className = "record-name";
      name.textContent = record.title || record.fileName || "MIA audio";

      const meta = document.createElement("div");
      meta.className = "record-meta";
      meta.textContent = [
        record.origin === "imported" ? t("importedType") : t("live"),
        formatDate(record.createdAt),
        formatDuration(record.durationSeconds),
        humanBytes(record.blob?.size || 0)
      ].join(" · ");

      const actions = document.createElement("div");
      actions.className = "record-actions";

      const play = document.createElement("button");
      play.type = "button";
      play.textContent = t("play");
      play.addEventListener("click", () => playRecord(record.id));

      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.textContent = t("export");
      exportButton.addEventListener("click", () => exportRecord(record.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete";
      remove.textContent = t("delete");
      remove.addEventListener("click", () => deleteRecord(record.id));

      actions.append(play, exportButton, remove);
      item.append(name, meta, actions);
      container.append(item);
    }
  }

  function humanBytes(value) {
    if (!value) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return (value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + " " + units[index];
  }

  async function cleanupExpired() {
    const records = await getAllRecordings();
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const expired = records.filter(record => record.createdAt < cutoff);
    for (const record of expired) {
      await dbRequest("readwrite", store => store.delete(record.id));
      revokeObjectUrl(record.id);
    }
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

  async function startRecording() {
    clearWarning();

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      state.stream = stream;
      state.chunks = [];
      state.startedAt = Date.now();
      state.recordingId = crypto.randomUUID();

      const recorder = new MediaRecorder(stream, { mimeType });
      state.recorder = recorder;

      recorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size > 0) state.chunks.push(event.data);
      });

      recorder.addEventListener("error", event => {
        showWarning(event.error?.message || t("storageFailed"));
      });

      recorder.addEventListener("stop", async () => {
        const endedAt = Date.now();
        const durationSeconds = (endedAt - state.startedAt) / 1000;
        const blob = new Blob(state.chunks, { type: recorder.mimeType || mimeType });
        stopTracks();

        state.recorder = null;
        state.chunks = [];
        state.startedAt = null;
        state.recordingId = null;
        stopTimer();

        if (!blob.size) {
          setStatus(t("ready"), false);
          showWarning(t("noAudio"));
          return;
        }

        const safeTitle = (el("meetingTitle").value || "").trim();
        const extension = fileExtension(blob.type);
        const id = crypto.randomUUID();
        const record = {
          id,
          title: safeTitle || (state.language === "th" ? "การประชุม" : "Meeting"),
          fileName: "MIA-" + new Date(endedAt).toISOString().replace(/[:.]/g, "-") + "." + extension,
          origin: "live",
          createdAt: endedAt,
          durationSeconds,
          mimeType: blob.type || "application/octet-stream",
          blob,
          size: blob.size
        };

        try {
          await saveRecording(record);
          setStatus(t("saved"), false);
          clearWarning();
        } catch (error) {
          setStatus(t("ready"), false);
          showWarning(t("storageFailed") + " " + (error?.message || ""));
        }
      });

      recorder.start(1000);
      setStatus(t("recordingStarted"), true);
      startTimer();
    } catch (error) {
      stopTracks();
      state.recorder = null;
      state.stream = null;
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        showWarning(t("micDenied"));
      } else {
        showWarning((error?.message || t("micUnsupported")));
      }
    }
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") {
      state.recorder.stop();
    }
  }

  function startTimer() {
    stopTimer();
    updateTimer();
    state.timerHandle = window.setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    if (!state.startedAt) return;
    el("timer").textContent = formatDuration((Date.now() - state.startedAt) / 1000);
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
    } catch (error) {
      showWarning(t("importFailed") + ": " + (error?.message || ""));
    }
  }

  async function getRecord(id) {
    return dbRequest("readonly", store => store.get(id));
  }

  async function playRecord(id) {
    try {
      const record = await getRecord(id);
      if (!record?.blob) throw new Error("Audio file not found");
      revokeObjectUrl(id);
      const url = URL.createObjectURL(record.blob);
      state.currentObjectUrls.set(id, url);

      const audio = new Audio(url);
      audio.preload = "metadata";
      audio.addEventListener("ended", () => revokeObjectUrl(id), { once: true });
      audio.addEventListener("error", () => {
        revokeObjectUrl(id);
        showWarning(t("noAudio"));
      }, { once: true });
      await audio.play();
    } catch (error) {
      showWarning((error?.message || t("noAudio")));
    }
  }

  async function exportRecord(id) {
    try {
      const record = await getRecord(id);
      if (!record?.blob) throw new Error(t("noExport"));
      const url = URL.createObjectURL(record.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.fileName || "MIA-audio";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (navigator.canShare && typeof File === "function") {
        // Share is intentionally not invoked automatically; user can use the downloaded file via iOS Share Sheet.
      }
    } catch (error) {
      showWarning(t("noExport") + ": " + (error?.message || ""));
    }
  }

  async function deleteRecord(id) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      await dbRequest("readwrite", store => store.delete(id));
      revokeObjectUrl(id);
      await renderRecordings();
      setStatus(t("deleted"), false);
    } catch (error) {
      showWarning(error?.message || t("storageFailed"));
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden" && state.recorder && state.recorder.state === "recording") {
      state.pendingWarning = true;
      showWarning(t("interruption"));
    } else if (document.visibilityState === "visible" && state.pendingWarning) {
      state.pendingWarning = false;
      showWarning(t("interruption"));
    }
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // App remains functional online even if offline caching is unavailable.
      });
    }
  }

  function bindEvents() {
    el("languageButton").addEventListener("click", () => {
      state.language = state.language === "th" ? "en" : "th";
      updateTranslations();
    });
    el("startButton").addEventListener("click", startRecording);
    el("stopButton").addEventListener("click", stopRecording);
    el("importButton").addEventListener("click", () => el("fileInput").click());
    el("fileInput").addEventListener("change", async event => {
      await importFile(event.target.files?.[0]);
      event.target.value = "";
    });
    document.addEventListener("visibilitychange", onVisibilityChange);
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
      await cleanupExpired();
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
