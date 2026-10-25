/* ============================================================
   STUDY TRACKER — app logic
   Every button is wired up:
   - Toasts & confirm/prompt modals replace plain alerts
   - Subjects: add, rename, delete, adjust / set progress
   - Resources: add, edit, delete, open links (validated)
   - Timer: start/pause toggle, stop saves the session,
     milestones, today/all-time totals
   - Stats: live calculations, achievements with progress,
     export backup & reset data
   - Goals: weekly + per-subject goals with progress
   ============================================================ */

const app = document.getElementById("app");

/* ---------- Navigation ---------- */
const navButtons = document.querySelectorAll(".nav-btn[data-view]");
navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    navButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderView(btn.dataset.view);
  });
});

function renderView(view) {
  app.innerHTML = "";
  if (view === "dashboard") return renderDashboard();
  if (view === "subjects") return renderSubjects();
  if (view === "timer") return renderTimer();
  if (view === "calendar") return renderCalendar();
  if (view === "resources") return renderResources();
  if (view === "notes") return renderNotes();
  if (view === "stats") return renderStats();
  if (view === "goals") return renderGoals();
}

/* Navigate by clicking the matching nav button (used by quick actions) */
function goToView(view) {
  const btn = document.querySelector(`.nav-btn[data-view="${view}"]`);
  (btn || navButtons[0]).click();
}

/* ---------- Small utilities ---------- */
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* Local YYYY-MM-DD date key */
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------- Toast notifications ---------- */
function showToast(message, type = "success", ms = 3600) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const icons = { success: "✅", error: "⚠️", info: "ℹ️", streak: "🔥" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon"></span><span class="toast-msg"></span>`;
  toast.querySelector(".toast-icon").textContent = icons[type] || "✅";
  toast.querySelector(".toast-msg").textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  }, ms);
}

/* ---------- Modal system (confirm / prompt) ---------- */
function openModal(html, onMount) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.id = "modalOverlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" data-close title="Close">✕</button>
      ${html}
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => overlay.classList.add("show"));
  overlay.addEventListener("mousedown", e => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector("[data-close]").addEventListener("click", closeModal);
  if (onMount) onMount(overlay);
  return overlay;
}

function closeModal() {
  const old = document.getElementById("modalOverlay");
  if (old) {
    old.remove();
    document.body.classList.remove("no-scroll");
  }
}

/* Confirm dialog: confirmDialog({...opts}, onConfirm) */
function confirmDialog(opts = {}, onConfirm) {
  openModal(`
    <div class="modal-head"><h3>${escapeHtml(opts.title || "Are you sure?")}</h3></div>
    <p class="modal-body">${escapeHtml(opts.message || "")}</p>
    <div class="modal-actions">
      <button class="secondary-btn" data-dismiss>Cancel</button>
      <button class="${opts.danger ? "danger-btn" : ""}" data-confirm>${escapeHtml(opts.confirmText || "Confirm")}</button>
    </div>`, overlay => {
    overlay.querySelector("[data-dismiss]").addEventListener("click", closeModal);
    overlay.querySelector("[data-confirm]").addEventListener("click", () => {
      closeModal();
      onConfirm();
    });
  });
}

/* Prompt dialog: promptDialog({...opts}, onConfirm(value)) */
function promptDialog(opts = {}, onConfirm) {
  openModal(`
    <div class="modal-head"><h3>${escapeHtml(opts.title || "Enter a value")}</h3></div>
    <p class="modal-body">${escapeHtml(opts.message || "")}</p>
    <input type="text" id="modalInput" placeholder="${escapeHtml(opts.placeholder || "")}" value="${escapeHtml(opts.defaultValue || "")}">
    <div class="modal-actions">
      <button class="secondary-btn" data-dismiss>Cancel</button>
      <button data-confirm>${escapeHtml(opts.confirmText || "Save")}</button>
    </div>`, overlay => {
    const input = overlay.querySelector("#modalInput");
    input.focus();
    input.select();
    const submit = () => {
      const val = input.value.trim();
      if (!val) {
        input.classList.add("input-error");
        showToast("Please enter a value.", "error");
        input.focus();
        return;
      }
      closeModal();
      onConfirm(val);
    };
    overlay.querySelector("[data-dismiss]").addEventListener("click", closeModal);
    overlay.querySelector("[data-confirm]").addEventListener("click", submit);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
  });
}

/* ---------- Persistence (subjects / resources / sessions) ---------- */
/* All user data is namespaced per account (see auth.js → userKey()).
   Anyone signed out stays in the shared "guest" namespace. */
function reloadSubjects() {
  try {
    const arr = JSON.parse(localStorage.getItem(userKey("subjects")));
    if (Array.isArray(arr)) subjects.splice(0, subjects.length, ...arr);
  } catch (e) { /* fall back to starter data */ }
}

function saveSubjects() {
  localStorage.setItem(userKey("subjects"), JSON.stringify(subjects));
}

function reloadResources() {
  try {
    const arr = JSON.parse(localStorage.getItem(userKey("resources")));
    if (Array.isArray(arr)) resources.splice(0, resources.length, ...arr);
  } catch (e) { /* fall back to starter data */ }
}

function saveResources() {
  localStorage.setItem(userKey("resources"), JSON.stringify(resources));
}

function getSessions() {
  try {
    const arr = JSON.parse(localStorage.getItem(userKey("sessions")));
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem(userKey("sessions"), JSON.stringify(sessions));
}

/* Records one finished focus session and returns it */
function recordSession(seconds) {
  const secs = Math.round(seconds);
  if (!(secs > 0)) return null;
  const sessions = getSessions();
  const session = { date: todayKey(), ts: Date.now(), seconds: secs };
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

/* ---------- Stats ---------- */
function computeStats() {
  const sessions = getSessions();
  const today = todayKey();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  const dow = now.getDay() || 7; // 1 = Monday ... 7 = Sunday
  weekStart.setDate(now.getDate() - dow + 1);
  const weekKey = todayKey(weekStart);

  let total = 0, longest = 0, todayTotal = 0, todayCount = 0, weekTotal = 0;
  sessions.forEach(s => {
    total += s.seconds;
    if (s.seconds > longest) longest = s.seconds;
    if (s.date === today) { todayTotal += s.seconds; todayCount++; }
    if (s.date >= weekKey) weekTotal += s.seconds;
  });

  return {
    sessionCount: sessions.length,
    total,
    longest,
    totalToday: todayTotal,
    todayCount,
    weekTotal,
    avg: sessions.length ? Math.round(total / sessions.length) : 0
  };
}

function completedSubjects() {
  return subjects.filter(s => Number(s.progress) >= 100).length;
}

/* Progress + unlock state for each achievement (id rules in data.js) */
function achievementProgress(a) {
  const stats = computeStats();
  const complete = completedSubjects();
  const pct = (cur, target) => Math.min(100, Math.round((cur / target) * 100));
  switch (a.id) {
    case 1:
      return { unlocked: stats.sessionCount >= 1, pct: pct(stats.sessionCount, 1), detail: `${stats.sessionCount} / 1 session` };
    case 2:
      return { unlocked: stats.longest >= 1500, pct: pct(stats.longest, 1500), detail: `${formatTime(stats.longest)} / 25:00` };
    case 3:
      return { unlocked: stats.total >= 3600, pct: pct(stats.total, 3600), detail: `${formatTime(stats.total)} / 1:00:00` };
    case 4:
      return { unlocked: stats.total >= 18000, pct: pct(stats.total, 18000), detail: `${formatTime(stats.total)} / 5:00:00` };
    case 5:
      return { unlocked: stats.total >= 36000, pct: pct(stats.total, 36000), detail: `${formatTime(stats.total)} / 10:00:00` };
    case 6:
      return { unlocked: stats.total >= 86400, pct: pct(stats.total, 86400), detail: `${formatTime(stats.total)} / 24:00:00` };
    case 7:
      return { unlocked: stats.sessionCount >= 10, pct: pct(stats.sessionCount, 10), detail: `${stats.sessionCount} / 10 sessions` };
    case 8:
      return { unlocked: complete >= 1, pct: pct(complete, 1), detail: `${complete} / 1 subject` };
    default:
      return { unlocked: !!a.unlocked, pct: a.unlocked ? 100 : 0, detail: "" };
  }
}

/* ---------- Subjects ---------- */
function renderSubjects() {
  let html = `<h2>Subjects</h2>
    <div class="card form-card">
      <div class="card-head"><h3>Add a new subject</h3></div>
      <label for="newSubject">Subject name</label>
      <input type="text" id="newSubject" placeholder="e.g. Chemistry" maxlength="60">
      <button onclick="addSubject()" title="Add this subject to your list">＋ Add Subject</button>
    </div>`;

  if (subjects.length === 0) {
    html += `<p class="empty-text">No subjects yet — add one above to start tracking your progress.</p>`;
  } else {
    html += `<div class="bento-grid">`;
    subjects.forEach(s => {
      const pct = Math.max(0, Math.min(100, Number(s.progress) || 0));
      const done = pct >= 100;
      html += `
        <div class="card subject-card">
          <div class="card-head">
            <h3>${escapeHtml(s.name)}</h3>
            <div class="card-actions">
              <button class="icon-btn" onclick="renameSubject(${s.id})" title="Rename subject">✎</button>
              <button class="icon-btn danger-btn" onclick="deleteSubject(${s.id})" title="Delete subject">✕</button>
            </div>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
          <p class="ring-sublabel">${done ? "Completed 🎉" : `${pct}% complete`}</p>
          <div class="progress-controls">
            <button class="small-btn" onclick="adjustProgress(${s.id}, -10)" title="Decrease progress by 10%">−10</button>
            <input type="number" id="prog-${s.id}" min="0" max="100" step="5" value="${pct}" title="Set exact percentage">
            <button class="small-btn" onclick="setSubjectProgress(${s.id})" title="Apply the number typed above">Set</button>
            <button class="small-btn" onclick="adjustProgress(${s.id}, 10)" title="Increase progress by 10%">+10</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  }
  app.innerHTML = html;
}

function addSubject() {
  const input = document.getElementById("newSubject");
  const name = input.value.trim();
  if (!name) {
    showToast("Please enter a subject name.", "error");
    input.focus();
    return;
  }
  const newId = subjects.length ? Math.max(...subjects.map(s => s.id)) + 1 : 1;
  subjects.push({ id: newId, name, progress: 0 });
  saveSubjects();
  showToast(`Subject “${name}” added to your list.`);
  renderSubjects();
  setTimeout(() => {
    const fresh = document.getElementById("newSubject");
    if (fresh) fresh.focus();
  }, 60);
}

function renameSubject(id) {
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  promptDialog({
    title: `Rename “${s.name}”`,
    message: "Give this subject a new name.",
    placeholder: "Subject name",
    defaultValue: s.name,
    confirmText: "Rename"
  }, newName => {
    s.name = newName;
    saveSubjects();
    showToast(`Subject renamed to “${newName}”.`);
    renderSubjects();
  });
}

function deleteSubject(id) {
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  confirmDialog({
    title: "Delete subject?",
    message: `“${s.name}” will be removed from your subjects list. This cannot be undone.`,
    confirmText: "Delete",
    danger: true
  }, () => {
    subjects.splice(subjects.indexOf(s), 1);
    saveSubjects();
    showToast(`Subject “${s.name}” deleted.`, "info");
    renderSubjects();
  });
}

function adjustProgress(id, delta) {
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  const next = Math.max(0, Math.min(100, (Number(s.progress) || 0) + delta));
  s.progress = next;
  saveSubjects();
  renderSubjects();
  if (next >= 100) showToast(`🎉 “${s.name}” reached 100% complete!`, "streak");
}

function setSubjectProgress(id) {
  const s = subjects.find(x => x.id === id);
  const input = document.getElementById(`prog-${id}`);
  if (!s || !input) return;
  const val = Math.round(Number(input.value));
  if (Number.isNaN(val)) {
    showToast("Please enter a valid percentage.", "error");
    input.focus();
    return;
  }
  s.progress = Math.max(0, Math.min(100, val));
  saveSubjects();
  showToast(`“${s.name}” progress set to ${s.progress}%.`);
  renderSubjects();
}

/* ---------- Resources ---------- */
let editingResourceId = null;

function isValidLink(link) {
  try {
    const u = new URL(link);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) { return false; }
}

function linkHostname(link) {
  if (!isValidLink(link)) return "Open resource ↗";
  try { return new URL(link).hostname; } catch (e) { return "Open resource ↗"; }
}

function renderResources() {
  const editing = editingResourceId ? resources.find(r => r.id === editingResourceId) : null;
  let html = `<h2>Resources</h2>
    <div class="card form-card">
      <div class="card-head"><h3 id="resourceFormTitle">${editing ? "Edit resource" : "Add a new resource"}</h3></div>
      <label for="resTitle">Title</label>
      <input type="text" id="resTitle" value="${editing ? escapeHtml(editing.title) : ""}" placeholder="e.g. Khan Academy — Algebra" maxlength="80">
      <label for="resLink">Link</label>
      <input type="text" id="resLink" value="${editing ? escapeHtml(editing.link) : ""}" placeholder="https://example.com">
      <div class="form-actions">
        <button onclick="saveResource()" title="${editing ? "Save your changes" : "Save this resource"}">${editing ? "💾 Update Resource" : "＋ Save Resource"}</button>
        ${editing ? `<button class="secondary-btn" onclick="cancelEditResource()" title="Discard changes">Cancel</button>` : ""}
      </div>
    </div>`;

  if (resources.length === 0) {
    html += `<p class="empty-text">No resources saved yet — add your favourite links above.</p>`;
  } else {
    html += `<div class="bento-grid">`;
    resources.forEach(r => {
      html += `
        <div class="card resource-card">
          <div class="resource-icon">📄</div>
          <div class="resource-body">
            <h3>${escapeHtml(r.title)}</h3>
            ${isValidLink(r.link)
              ? `<a href="${escapeHtml(r.link)}" target="_blank" rel="noopener" title="${escapeHtml(r.link)}">${escapeHtml(linkHostname(r.link))} ↗</a>`
              : `<span class="muted-link">No link yet — click ✎ to add one</span>`}
          </div>
          <div class="card-actions">
            <button class="icon-btn" onclick="editResource(${r.id})" title="Edit resource">✎</button>
            <button class="icon-btn danger-btn" onclick="deleteResource(${r.id})" title="Delete resource">✕</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  }
  app.innerHTML = html;
}

function saveResource() {
  const title = document.getElementById("resTitle").value.trim();
  const link = document.getElementById("resLink").value.trim();
  if (!title) {
    showToast("Please enter a resource title.", "error");
    document.getElementById("resTitle").focus();
    return;
  }
  if (link && !isValidLink(link)) {
    showToast("Links must start with http:// or https://", "error");
    document.getElementById("resLink").focus();
    return;
  }
  if (editingResourceId) {
    const r = resources.find(x => x.id === editingResourceId);
    if (r) {
      r.title = title;
      r.link = link;
      saveResources();
      showToast(`Resource updated.`);
    }
    editingResourceId = null;
  } else {
    const newId = resources.length ? Math.max(...resources.map(r => r.id)) + 1 : 1;
    resources.push({ id: newId, title, link });
    saveResources();
    showToast(`Resource “${title}” saved to your library.`);
  }
  renderResources();
}

function editResource(id) {
  editingResourceId = id;
  renderResources();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEditResource() {
  editingResourceId = null;
  renderResources();
}

function deleteResource(id) {
  const r = resources.find(x => x.id === id);
  if (!r) return;
  confirmDialog({
    title: "Delete resource?",
    message: `“${r.title}” will be removed from your library.`,
    confirmText: "Delete",
    danger: true
  }, () => {
    resources.splice(resources.indexOf(r), 1);
    if (editingResourceId === id) editingResourceId = null;
    saveResources();
    showToast(`Resource “${r.title}” deleted.`, "info");
    renderResources();
  });
}

/* ---------- Timer ---------- */
let timerInterval = null;
let timerRunning = false;
let runningSince = null;   /* timestamp of current run segment */
let elapsedBefore = 0;     /* accumulated ms before the current segment */
let lastMilestone = 0;     /* last announced minute milestone */

function currentElapsedMs() {
  return elapsedBefore + (runningSince ? Date.now() - runningSince : 0);
}

function renderTimer() {
  const stats = computeStats();
  const el = currentElapsedMs();
  app.innerHTML = `<h2>Study Timer</h2>
    <div class="timer-panel">
      <div class="timer-ring${timerRunning ? " running" : ""}">
        <span id="timer">${formatTime(el / 1000)}</span>
        <span class="timer-status" id="timerStatus">${timerRunning ? "Focusing…" : el ? "Paused" : "Ready to focus"}</span>
      </div>
      <div class="timer-controls">
        <button id="timerToggleBtn" onclick="toggleTimer()" title="${timerRunning ? "Pause the timer" : "Start focusing"}">${timerRunning ? "⏸ Pause" : "▶ Start"}</button>
        <button class="secondary-btn" onclick="stopTimer()" title="Stop and save this session to your stats" ${timerRunning || el ? "" : "disabled"}>⏹ Stop & Save</button>
        <button class="secondary-btn" onclick="resetTimer()" title="Clear the current timer" ${el ? "" : "disabled"}>↺ Reset</button>
      </div>
      <div class="timer-summary">
        <div class="card-head"><h3>Your focus totals</h3></div>
        <div class="mini-stats">
          <div><span class="mini-stat-value">${formatTime(el / 1000)}</span><span class="mini-stat-label">This session</span></div>
          <div><span class="mini-stat-value">${formatTime(stats.totalToday)}</span><span class="mini-stat-label">Today</span></div>
          <div><span class="mini-stat-value">${formatTime(stats.total)}</span><span class="mini-stat-label">All time</span></div>
        </div>
      </div>
      <p class="empty-text">Tip: press Start, then open another tab to keep notes while the timer runs in the background.</p>
    </div>`;
}

function toggleTimer() {
  if (timerRunning) pauseTimer();
  else startTimer();
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  runningSince = Date.now();
  lastMilestone = Math.floor(currentElapsedMs() / 60000);
  timerInterval = setInterval(tickTimer, 500);
  updateTimerUI("Focusing…");
  showToast("Focus session started — you’ve got this! 💪", "info");
}

function pauseTimer() {
  if (!timerRunning) return;
  elapsedBefore = currentElapsedMs();
  runningSince = null;
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  updateTimerUI("Paused");
}

function tickTimer() {
  if (!timerRunning) return;
  const el = document.getElementById("timer");
  if (el) el.textContent = formatTime(currentElapsedMs() / 1000);
  updateTimerRing();
  const minute = Math.floor(currentElapsedMs() / 60000);
  if (minute > lastMilestone) {
    if (minute !== 0 && minute % 25 === 0) {
      showToast(`🌟 ${minute} minutes of deep focus — amazing consistency!`, "streak");
    } else if (minute >= 5) {
      showToast(`⏱️ ${minute} minutes focused. Keep going!`, "info");
    }
    lastMilestone = minute;
  }
}

function updateTimerRing() {
  const ring = document.querySelector(".timer-ring");
  if (!ring) return;
  ring.classList.toggle("running", timerRunning);
  const secs = currentElapsedMs() / 1000;
  const pct = Math.min(100, Math.round((secs / 1500) * 100)); // fills toward the 25-minute block
  ring.style.setProperty("--timer-progress", `${pct}%`);
}

function updateTimerUI(statusText) {
  const el = document.getElementById("timer");
  const status = document.getElementById("timerStatus");
  const btn = document.getElementById("timerToggleBtn");
  if (el) el.textContent = formatTime(currentElapsedMs() / 1000);
  if (status) status.textContent = statusText || (timerRunning ? "Focusing…" : currentElapsedMs() ? "Paused" : "Ready to focus");
  if (btn) btn.textContent = timerRunning ? "⏸ Pause" : "▶ Start";
  if (btn) btn.title = timerRunning ? "Pause the timer" : "Start focusing";
  updateTimerRing();
}

function resetTimerState() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  runningSince = null;
  elapsedBefore = 0;
}

function resetTimer() {
  if (!currentElapsedMs() && !timerRunning) {
    showToast("The timer is already at zero.", "info");
    return;
  }
  confirmDialog({
    title: "Reset timer?",
    message: "The current countdown will be cleared and not saved.",
    confirmText: "Reset",
    danger: false
  }, () => {
    resetTimerState();
    showToast("Timer reset.", "info");
    renderTimer();
  });
}

function stopTimer() {
  if (timerRunning) pauseTimer();
  const secs = Math.floor(currentElapsedMs() / 1000);
  if (secs < 1) {
    showToast("Start the timer first — then stop it after a good focus run.", "info");
    return;
  }
  const session = recordSession(secs);
  resetTimerState();
  showToast(`Session saved: ${formatTime(session.seconds)} of focus. 🔥`, "streak");
  renderTimer();
}

/* ---------- Stats & Achievements ---------- */
function renderStats() {
  const stats = computeStats();
  const unlockedCount = achievements.filter(a => achievementProgress(a).unlocked).length;
  const next = achievements.map(a => ({ a, p: achievementProgress(a) }))
    .filter(x => !x.p.unlocked)
    .sort((x, y) => y.p.pct - x.p.pct)[0];

  let html = `<h2>Statistics & Achievements</h2>
    <div class="stat-grid">
      <div class="card stat-card inline-stat-card">
        <div class="card-head"><h3>⏱ Focus time</h3></div>
        <div class="mini-stats">
          <div><span class="mini-stat-value">${formatTime(stats.total)}</span><span class="mini-stat-label">All time</span></div>
          <div><span class="mini-stat-value">${formatTime(stats.totalToday)}</span><span class="mini-stat-label">Today</span></div>
          <div><span class="mini-stat-value">${formatTime(stats.weekTotal)}</span><span class="mini-stat-label">This week</span></div>
        </div>
      </div>
      <div class="card stat-card inline-stat-card">
        <div class="card-head"><h3>📅 Sessions</h3></div>
        <div class="mini-stats">
          <div><span class="mini-stat-value">${stats.sessionCount}</span><span class="mini-stat-label">Total</span></div>
          <div><span class="mini-stat-value">${stats.todayCount}</span><span class="mini-stat-label">Today</span></div>
          <div><span class="mini-stat-value">${formatTime(stats.longest)}</span><span class="mini-stat-label">Longest</span></div>
        </div>
      </div>
      <div class="card stat-card inline-stat-card">
        <div class="card-head"><h3>🏅 Badges</h3></div>
        <div class="mini-stats">
          <div><span class="mini-stat-value">${unlockedCount}</span><span class="mini-stat-label">Unlocked</span></div>
          <div><span class="mini-stat-value">${achievements.length}</span><span class="mini-stat-label">Total</span></div>
          <div><span class="mini-stat-value">${completedSubjects()}</span><span class="mini-stat-label">Subjects done</span></div>
        </div>
      </div>
    </div>`;

  if (next) {
    const { a, p } = next;
    html += `
      <div class="card list-card next-badge">
        <div class="card-head"><h3>Next up: ${a.emoji} ${escapeHtml(a.title)}</h3></div>
        <p class="next-badge-desc">${escapeHtml(a.desc)}</p>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${p.pct}%"></div></div>
        <p class="ring-sublabel">${p.pct}% — ${escapeHtml(p.detail)}</p>
        <div class="card-actions">
          <button onclick="goToView('timer')" title="Do a focus session to unlock this badge">⏱ Start a session</button>
        </div>
      </div>`;
  }

  html += `<div class="goals-grid achievements-grid">`;
  achievements.forEach(a => {
    const p = achievementProgress(a);
    html += `
      <div class="card list-card achievement-card ${p.unlocked ? "unlocked" : "locked"}">
        <div class="card-head"><h3>${a.emoji} ${escapeHtml(a.title)}</h3></div>
        <p class="next-badge-desc">${escapeHtml(a.desc)}</p>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${p.pct}%"></div></div>
        <p class="ring-sublabel">${p.unlocked ? "✅ Unlocked" : (p.pct === 0 ? "🔒 Locked" : `${p.pct}% — ${escapeHtml(p.detail)}`)}</p>
      </div>`;
  });
  html += `</div>`;

  html += `
    <div class="card list-card data-tools">
      <div class="card-head"><h3>🗄 Your data</h3></div>
      <p class="next-badge-desc">Everything is stored locally in your browser. Download a backup anytime, or start fresh.</p>
      <div class="card-actions">
        <button onclick="exportData()" title="Download all your data as a JSON file">⬇ Export data</button>
        <button class="danger-btn" onclick="resetAllData()" title="Permanently delete all local data">🗑 Reset all data</button>
      </div>
    </div>`;
  app.innerHTML = html;
}

function exportData() {
  const data = {
    app: "study-tracker",
    exportedAt: new Date().toISOString(),
    subjects,
    resources,
    sessions: getSessions(),
    studyGoal: localStorage.getItem(userKey("studyGoal")) || null,
    subjectGoals: JSON.parse(localStorage.getItem(userKey("subjectGoals"))) || {}
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `study-tracker-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showToast("Backup downloaded. 📦");
}

function resetAllData() {
  confirmDialog({
    title: "Reset all data?",
    message: "This permanently deletes your subjects, resources, study sessions, goals and achievements.",
    confirmText: "Erase everything",
    danger: true
  }, () => {
    ["subjects", "resources", "sessions", "studyGoal", "subjectGoals"].forEach(k => localStorage.removeItem(userKey(k)));
    subjects.splice(0, subjects.length);
    resources.splice(0, resources.length);
    editingResourceId = null;
    showToast("All data has been reset.", "info");
    renderView("dashboard");
    navButtons.forEach(b => b.classList.remove("active"));
    document.querySelector('.nav-btn[data-view="dashboard"]').classList.add("active");
  });
}

/* ---------- Goals ---------- */
function renderGoals() {
  const goal = Number(localStorage.getItem(userKey("studyGoal"))) || 0;
  const stats = computeStats();
  const goalSec = goal * 3600;
  const goalPct = goalSec ? Math.min(100, Math.round((stats.weekTotal / goalSec) * 100)) : 0;
  const remaining = Math.max(0, goalSec - stats.weekTotal);

  app.innerHTML = `<h2>Study Goals</h2>
    <div class="goals-grid">
      <div class="card form-card">
        <div class="card-head"><h3>Weekly focus goal</h3></div>
        <label for="goalInput">Hours to focus this week</label>
        <input type="number" id="goalInput" placeholder="e.g. 12" min="1" value="${goal || ""}">
        <div class="form-actions">
          <button onclick="saveGoal()" title="Save your weekly focus target">💾 Save Goal</button>
          ${goal ? `<button class="secondary-btn" onclick="clearGoal()" title="Remove your weekly goal">Clear Goal</button>` : ""}
        </div>
        <div id="goalDisplay" class="goal-display"></div>
      </div>
      <div class="card list-card">
        <div class="card-head"><h3>This week</h3></div>
        <div class="mini-stats">
          <div><span class="mini-stat-value">${formatTime(stats.weekTotal)}</span><span class="mini-stat-label">Focused</span></div>
          <div><span class="mini-stat-value">${goal ? `${goal}h` : "—"}</span><span class="mini-stat-label">Goal</span></div>
        </div>
        ${goal ? `
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${goalPct}%"></div></div>
          <p class="ring-sublabel">${goalPct}% of your weekly goal${remaining > 0 ? ` · ${formatTime(remaining)} to go` : " · goal reached! 🎉"}</p>`
          : `<p class="empty-text">Set a weekly goal to see your progress here.</p>`}
      </div>
    </div>
    <div class="card list-card">
      <div class="card-head"><h3>Per-subject goals</h3></div>
      <div id="subjectGoals"></div>
    </div>`;

  displayGoal();
  renderSubjectGoals();
}

function saveGoal() {
  const input = document.getElementById("goalInput");
  const val = Number(input.value);
  if (Number.isNaN(val) || val <= 0) {
    showToast("Please enter a valid number of hours (1 or more).", "error");
    input.focus();
    return;
  }
  localStorage.setItem(userKey("studyGoal"), String(val));
  showToast(`Weekly goal set to ${val} hours. Let’s do this! 🎯`);
  renderGoals();
}

function clearGoal() {
  confirmDialog({
    title: "Clear your weekly goal?",
    message: "Your weekly target will be removed, but your study data stays.",
    confirmText: "Clear goal",
    danger: false
  }, () => {
    localStorage.removeItem(userKey("studyGoal"));
    showToast("Weekly goal cleared.", "info");
    renderGoals();
  });
}

function displayGoal() {
  const el = document.getElementById("goalDisplay");
  if (!el) return;
  const goal = Number(localStorage.getItem(userKey("studyGoal"))) || 0;
  if (!goal) {
    el.innerHTML = "";
    return;
  }
  const stats = computeStats();
  const goalSec = goal * 3600;
  const pct = Math.min(100, Math.round((stats.weekTotal / goalSec) * 100));
  const remaining = Math.max(0, goalSec - stats.weekTotal);
  el.innerHTML = `
    <span class="goal-emoji">${pct >= 100 ? "🏆" : "🎯"}</span>
    <span>
      <span class="goal-strong">${formatTime(stats.weekTotal)}</span>
      <span class="mini-stat-label">of ${goal} hour${goal === 1 ? "" : "s"} this week${remaining > 0 ? ` · ${formatTime(remaining)} to go` : " · goal reached!"}</span>
    </span>
    <span class="mini-stat-value goal-pct">${pct}%</span>`;
}

function renderSubjectGoals() {
  const container = document.getElementById("subjectGoals");
  if (!container) return;
  if (subjects.length === 0) {
    container.innerHTML = `<p class="empty-text">Add a subject first to set its goal.</p>`;
    return;
  }
  const savedGoals = JSON.parse(localStorage.getItem(userKey("subjectGoals"))) || {};
  let html = "";
  subjects.forEach(s => {
    const cur = savedGoals[s.name] || "";
    html += `
      <div class="subject-goal-row">
        <label for="goal-${s.id}">${escapeHtml(s.name)}</label>
        <div class="goal-row-inputs">
          <input type="number" id="goal-${s.id}" value="${escapeHtml(cur)}" placeholder="hours" min="1" title="Target study hours for this subject">
          <button class="small-btn" onclick="saveSubjectGoal(${s.id})" title="Save this subject’s goal">Save</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function saveSubjectGoal(id) {
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  const input = document.getElementById(`goal-${id}`);
  const val = Number(input.value);
  if (Number.isNaN(val) || val <= 0) {
    showToast("Please enter a valid number of hours.", "error");
    input.focus();
    return;
  }
  const savedGoals = JSON.parse(localStorage.getItem(userKey("subjectGoals"))) || {};
  savedGoals[s.name] = val;
  localStorage.setItem(userKey("subjectGoals"), JSON.stringify(savedGoals));
  showToast(`Goal for “${s.name}” saved: ${val} hours.`);
}

/* ---------- Progress ring helper ---------- */
function progressRing(percent, size = 120, label = "", sublabel = "") {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="ring" style="--ring-percent:${clamped}; width:${size}px; height:${size}px;">
      <div class="ring-inner">
        <span class="ring-value">${clamped}%</span>
        ${label ? `<span class="ring-label">${label}</span>` : ""}
      </div>
    </div>
    ${sublabel ? `<p class="ring-sublabel">${sublabel}</p>` : ""}`;
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const totalSubjects = subjects.length;
  const avgProgress = totalSubjects
    ? Math.round(subjects.reduce((sum, s) => sum + Number(s.progress || 0), 0) / totalSubjects)
    : 0;
  const completed = completedSubjects();
  const stats = computeStats();
  const goal = Number(localStorage.getItem(userKey("studyGoal"))) || 0;
  const goalPct = goal ? Math.min(100, Math.round((stats.weekTotal / (goal * 3600)) * 100)) : 0;
  const unlockedCount = achievements.filter(a => achievementProgress(a).unlocked).length;
  const next = achievements.map(a => ({ a, p: achievementProgress(a) }))
    .filter(x => !x.p.unlocked).sort((x, y) => y.p.pct - x.p.pct)[0];

  let html = `<h2>Dashboard</h2>
    <div class="quick-actions">
      <button onclick="goToView('subjects')" title="Jump to subjects and add a new one">＋ Add Subject</button>
      <button onclick="goToView('resources')" title="Save a study link in the resources library">＋ Add Resource</button>
      <button class="secondary-btn" onclick="goToView('timer')" title="Open the focus timer">⏱ Open Timer</button>
    </div>
    <div class="bento-grid">
      <div class="card stat-card">
        <div class="card-head"><h3>Overall Progress</h3></div>
        <div class="ring-wrap">
          ${progressRing(avgProgress, 130, "", "Across all subjects")}
        </div>
        <div class="mini-stats">
          <div><span class="mini-stat-value">${totalSubjects}</span><span class="mini-stat-label">Subjects</span></div>
          <div><span class="mini-stat-value">${completed}</span><span class="mini-stat-label">Completed</span></div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="card-head"><h3>Focus so far</h3></div>
        <div class="ring-wrap">
          ${progressRing(goal ? goalPct : (stats.total ? Math.min(100, Math.round(stats.total / 3600)) : 0), 130, "", goal ? "of your weekly goal" : "of 1 hour today")}
        </div>
        <div class="mini-stats">
          <div><span class="mini-stat-value">${formatTime(stats.total)}</span><span class="mini-stat-label">All time</span></div>
          <div><span class="mini-stat-value">${formatTime(stats.totalToday)}</span><span class="mini-stat-label">Today</span></div>
        </div>
      </div>

      <div class="card list-card">
        <div class="card-head">
          <h3>Subjects</h3>
          <button class="small-btn" onclick="goToView('subjects')" title="Manage your subjects">Manage</button>
        </div>`;

  if (subjects.length === 0) {
    html += `<p class="empty-text">No subjects yet.</p>
      <button onclick="goToView('subjects')" title="Create your first subject">＋ Add your first subject</button>`;
  } else {
    html += `<div class="task-list">`;
    subjects.forEach(s => {
      const isDone = Number(s.progress) >= 100;
      html += `
        <div class="task-row">
          <span class="task-check ${isDone ? "done" : ""}">${isDone ? "✓" : ""}</span>
          <span class="task-name">${escapeHtml(s.name)}</span>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${s.progress}%"></div>
          </div>
          <span class="task-status">${s.progress}%</span>
        </div>`;
    });
    html += `</div>`;
  }

  html += `</div>

      <div class="card list-card">
        <div class="card-head">
          <h3>Badges</h3>
          <button class="small-btn" onclick="goToView('stats')" title="View all achievements">View all</button>
        </div>`;

  if (next) {
    html += `
      <div class="mini-stats">
        <div><span class="mini-stat-value">${unlockedCount}</span><span class="mini-stat-label">Unlocked</span></div>
        <div><span class="mini-stat-value">${achievements.length}</span><span class="mini-stat-label">Total</span></div>
      </div>
      <p class="ring-sublabel">Next: ${next.a.emoji} ${escapeHtml(next.a.title)} (${next.p.pct}%)</p>
      <button class="small-btn" onclick="goToView('timer')" title="Earn this badge with a focus session">⏱ Work toward it</button>`;
  } else {
    html += `<p class="empty-text">All badges unlocked — incredible! 🏆</p>`;
  }

  html += `</div>
    </div>`;

  app.innerHTML = html;
}

/* ---------- Greeting + live clock ---------- */
function updateGreetingAndClock() {
  const now = new Date();
  const hour = now.getHours();
  const eyebrowEl = document.getElementById("greetingEyebrow");
  const nameEl = document.getElementById("greetingName");
  if (eyebrowEl && nameEl) {
    let greeting = "Good evening,";
    if (hour < 12) greeting = "Good morning,";
    else if (hour < 18) greeting = "Good afternoon,";
    eyebrowEl.textContent = greeting;
    nameEl.textContent = (AuthManager.currentUser && AuthManager.currentUser.name) ? AuthManager.currentUser.name.split(" ")[0] : "Student";
  }
  const dateEl = document.getElementById("clockDate");
  const timeEl = document.getElementById("clockTime");
  const periodEl = document.getElementById("clockPeriod");
  if (dateEl && timeEl) {
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
    timeEl.textContent = now.toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit", hour12: true
    });
    if (periodEl) {
      periodEl.textContent = hour < 12 ? "AM" : "PM";
    }
  }
}

/* ---------- Theme toggle ---------- */
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.body.setAttribute("data-theme", savedTheme);
  updateThemeToggleUI(savedTheme);
}

function updateThemeToggleUI(theme) {
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (icon && label) {
    icon.textContent = theme === "light" ? "☀️" : "🌙";
    label.textContent = theme === "light" ? "Light" : "Dark";
  }
}

const themeToggleBtn = document.getElementById("themeToggle");
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const current = document.body.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateThemeToggleUI(next);
    showToast(next === "light" ? "Light theme enabled. ☀️" : "Dark theme enabled. 🌙", "info");
  });
}

/* ---------- Init ---------- */
function reloadAllData() {
  reloadSubjects();
  reloadResources();
}

function init() {
  if (!AuthManager.currentUser) return; // only render app views when signed in
  reloadAllData();
  initTheme();
  updateGreetingAndClock();
  renderView("dashboard");
}

init();
setInterval(updateGreetingAndClock, 30 * 1000);
