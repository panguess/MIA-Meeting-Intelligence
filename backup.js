// MIA backup to the user's OWN Google Drive.
// - Google's official sign-in library (Google Identity Services) is loaded only
//   after the user saves a Client ID, so nothing from Google runs otherwise.
// - Scope drive.file: MIA can see and change ONLY the files MIA itself created,
//   never the rest of the user's Drive.
// - The access token stays on this device and expires after about an hour.
// - Transcripts and reports are backed up after each job; audio only if the
//   user turns it on. Restore brings them into a new copy of MIA (for example
//   Safari vs the Home Screen icon, or a new iPhone).
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const CLIENT_KEY = "mia-google-client";
  const TOKEN_KEY = "mia-google-token";
  const AUDIO_KEY = "mia-backup-audio";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const API = "https://www.googleapis.com/drive/v3";
  const UP = "https://www.googleapis.com/upload/drive/v3";
  const FOLDER = "MIA backup";

  const ls = {
    get: k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} }
  };
  const clientId = () => ls.get(CLIENT_KEY);
  const audioOn = () => ls.get(AUDIO_KEY) === "1";
  function token() {
    try { const t = JSON.parse(ls.get(TOKEN_KEY) || "null"); return t && t.exp > Date.now() + 60000 ? t.value : ""; } catch { return ""; }
  }
  const agent = () => window.MIAAgent;
  const toast = m => (agent() && agent().toast ? agent().toast(m) : null);

  // ---------- Google sign-in (loaded on demand) ----------
  let gisReady = null, tokenClient = null, waiting = null;
  function loadGis() {
    if (gisReady) return gisReady;
    gisReady = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisReady = null; reject(new Error("Couldn't reach Google. Check the internet.")); };
      document.head.appendChild(s);
    });
    return gisReady;
  }
  // Must run from a tap: iOS only opens the Google sign-in window after a tap.
  async function signIn() {
    if (!clientId()) throw new Error("Save your Google Client ID first.");
    await loadGis();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: SCOPE,
        callback: r => {
          const w = waiting; waiting = null;
          if (r && r.access_token) {
            ls.set(TOKEN_KEY, JSON.stringify({ value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 }));
            w && w.resolve(r.access_token);
          } else w && w.reject(new Error((r && r.error_description) || "Google sign-in was cancelled."));
        },
        error_callback: e => { const w = waiting; waiting = null; w && w.reject(new Error(e && e.type === "popup_closed" ? "Google sign-in was closed." : "Google sign-in didn't open. Allow pop-ups and try again.")); }
      });
    }
    return new Promise((resolve, reject) => {
      waiting = { resolve, reject };
      tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  // ---------- Drive calls ----------
  async function drive(url, opts = {}, tok) {
    const t = tok || token();
    if (!t) throw new Error("NEED_SIGNIN");
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + t } });
    if (res.status === 401) { ls.set(TOKEN_KEY, ""); throw new Error("NEED_SIGNIN"); }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d.error && d.error.message) || "Google Drive error " + res.status);
    }
    return res;
  }
  let folderId = "";
  async function folder() {
    if (folderId) return folderId;
    const q = encodeURIComponent("name='" + FOLDER + "' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const list = await (await drive(API + "/files?q=" + q + "&fields=files(id)&spaces=drive")).json();
    if (list.files && list.files.length) return (folderId = list.files[0].id);
    const made = await (await drive(API + "/files?fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" })
    })).json();
    return (folderId = made.id);
  }
  // Small files (the JSON): one multipart request, create or replace.
  async function putJson(name, data, id) {
    const meta = id ? {} : { name, parents: [await folder()], mimeType: "application/json" };
    const b = "mia" + Math.random().toString(36).slice(2);
    const body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
      "\r\n--" + b + "\r\nContent-Type: application/json\r\n\r\n" + JSON.stringify(data) + "\r\n--" + b + "--";
    const url = UP + "/files" + (id ? "/" + id : "") + "?uploadType=multipart&fields=id";
    const res = await drive(url, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body });
    return (await res.json()).id;
  }
  // Audio: resumable upload (works for large files).
  async function putAudio(name, blob) {
    const start = await drive(UP + "/files?uploadType=resumable&fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": blob.type || "application/octet-stream" },
      body: JSON.stringify({ name, parents: [await folder()] })
    });
    const loc = start.headers.get("Location");
    if (!loc) throw new Error("Google Drive didn't accept the audio upload.");
    const res = await fetch(loc, { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    if (!res.ok) throw new Error("Audio upload failed (" + res.status + ").");
    return (await res.json()).id;
  }

  // ---------- Backup ----------
  const sig = j => [j.status, (j.minutes || "").length, (j.transcript || "").length, (j.doneItems || []).length, j.name, (j.childIds || []).length].join("|");
  function snapshot(job) {
    const copy = {};
    for (const [k, v] of Object.entries(job)) if (!(v instanceof Blob) && k !== "driveId" && k !== "driveAudioId" && k !== "backupSig") copy[k] = v;
    return { app: "MIA", v: 1, savedAt: Date.now(), audioId: job.driveAudioId || "", job: copy };
  }
  function needsBackup(j) {
    if (j.status !== "done") return false;
    return j.backupSig !== sig(j) || (audioOn() && j.audio && !j.driveAudioId);
  }
  let busy = false;
  async function backupAll(fromTap) {
    const A = agent();
    if (!A || busy || !clientId()) return;
    const jobs = A.state.jobs.filter(needsBackup);
    if (!jobs.length) { if (fromTap) toast("Everything is already backed up."); render(); return; }
    if (!token()) {
      if (!fromTap) { render(); return; }      // wait for a tap to sign in
      await signIn();
    }
    busy = true; render();
    let done = 0;
    try {
      for (const j of jobs) {
        if (audioOn() && j.audio && !j.driveAudioId) j.driveAudioId = await putAudio("MIA-" + j.id + ".audio", j.audio);
        j.driveId = await putJson("MIA-" + j.id + ".json", snapshot(j), j.driveId);
        j.backupSig = sig(j);
        await A.saveJob(j);
        done++;
      }
      ls.set("mia-backup-at", String(Date.now()));
      if (fromTap) toast("Backed up " + done + (done === 1 ? " recording" : " recordings") + " to Google Drive.");
    } catch (e) {
      if (e.message === "NEED_SIGNIN") { if (fromTap) toast("Tap Back up now to sign in to Google again."); }
      else toast("Backup stopped: " + e.message);
    } finally { busy = false; render(); }
  }

  // ---------- Restore ----------
  async function restore() {
    const A = agent();
    if (!A || busy) return;
    if (!token()) await signIn();
    busy = true; render();
    let added = 0;
    try {
      const f = await folder();
      const q = encodeURIComponent("'" + f + "' in parents and trashed=false and name contains '.json'");
      let page = "", files = [];
      do {
        const r = await (await drive(API + "/files?q=" + q + "&fields=nextPageToken,files(id,name)&pageSize=200" + (page ? "&pageToken=" + page : ""))).json();
        files = files.concat(r.files || []); page = r.nextPageToken || "";
      } while (page);
      const have = new Set(A.state.jobs.map(j => j.id));
      for (const file of files) {
        const data = await (await drive(API + "/files/" + file.id + "?alt=media")).json().catch(() => null);
        if (!data || data.app !== "MIA" || !data.job || !data.job.id || have.has(data.job.id)) continue;
        const job = data.job;
        job.driveId = file.id;
        if (data.audioId) {
          job.driveAudioId = data.audioId;
          try { job.audio = await (await drive(API + "/files/" + data.audioId + "?alt=media")).blob(); } catch {}
        }
        job.backupSig = sig(job);
        await A.saveJob(job);
        A.state.jobs.push(job);
        added++;
      }
      A.render();
      toast(added ? "Restored " + added + (added === 1 ? " recording" : " recordings") + " from Google Drive." : "Nothing new to restore.");
    } catch (e) {
      toast(e.message === "NEED_SIGNIN" ? "Please sign in to Google again." : "Restore stopped: " + e.message);
    } finally { busy = false; render(); }
  }

  // ---------- Storage on this iPhone ----------
  async function storageNote() {
    const el = $("storeNote");
    if (!el || !navigator.storage || !navigator.storage.estimate) return;
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const mb = n => n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(n / 1e6)) + " MB";
      el.textContent = "This copy of MIA uses " + mb(usage) + (quota ? " · room for about " + mb(Math.max(0, quota - usage)) + " more" : "") + ".";
    } catch {}
  }

  // ---------- Settings UI ----------
  function render() {
    if (!$("gdState")) return;
    const id = clientId(), A = agent();
    const pending = A ? A.state.jobs.filter(needsBackup).length : 0;
    $("gdState").textContent = !id ? "Off" : busy ? "Working…" : pending ? pending + " waiting" : "Up to date";
    const st = $("stGd");
    if (st) { st.classList.toggle("ok", !!id && !pending); st.querySelector(".st-val").textContent = !id ? "Off" : pending ? pending + " to back up" : "✓ Up to date"; }
    $("gdButtons").classList.toggle("hidden", !id);
    $("gdBackup").disabled = $("gdRestore").disabled = busy;
    $("gdAudio").checked = audioOn();
    const at = Number(ls.get("mia-backup-at"));
    $("gdNote").textContent = !id ? "Keeps your transcripts and reports in your own Google Drive, folder “MIA backup”. MIA can only see files it made there."
      : (at ? "Last backup: " + new Date(at).toLocaleString() + ". " : "") +
        (token() ? "New reports back up by themselves." : "Tap Back up now to sign in. Sign-in lasts about an hour, then reports wait here until the next tap.");
  }
  function init() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (!$("gdClient")) return;
    $("gdSave").addEventListener("click", () => {
      const v = $("gdClient").value.trim();
      if (v && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(v)) return toast("That doesn't look like a Google Client ID. It ends with .apps.googleusercontent.com");
      ls.set(CLIENT_KEY, v); ls.set(TOKEN_KEY, ""); tokenClient = null; folderId = "";
      $("gdClient").value = "";
      toast(v ? "Google Drive backup is set up. Tap Back up now." : "Google Drive backup turned off.");
      render();
    });
    $("gdBackup").addEventListener("click", () => backupAll(true).catch(e => toast(e.message)));
    $("gdRestore").addEventListener("click", () => restore().catch(e => toast(e.message)));
    $("gdAudio").addEventListener("change", e => { ls.set(AUDIO_KEY, e.target.checked ? "1" : ""); render(); });
    document.addEventListener("click", e => { if (e.target.closest("[data-settings]")) { render(); storageNote(); } });
    render(); storageNote();
    // Automatic backup when a report is ready (only while signed in).
    setInterval(() => { if (clientId() && token()) backupAll(false); }, 60000);
  }
  window.MIABackup = { jobDone: () => { if (clientId() && token()) backupAll(false); else render(); }, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
