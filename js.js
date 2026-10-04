const SUPABASE_URL = "https://gifizpabjfrymfobqore.supabase.co";
const SUPABASE_KEY = "sb_publishable_xlUJnJCGhWi6s1zaF-gY2w_9gEeLZm3";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let currentUser = null;
let realtimeChannel = null;
let deferredInstallPrompt = null;
let swRegistration = null;
let state = {
  tasks: [],
  events: [],
  notes: [],
  categoryItems: [],
  categoryNotes: [],
  routine: [],
  attachments: [],
  settings: null
};

const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function zonedParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const out = {};
  parts.forEach(part => {
    if (part.type !== "literal") out[part.type] = part.value;
  });
  return out;
}

const todayISO = () => {
  const p = zonedParts();
  return `${p.year}-${p.month}-${p.day}`;
};

function localHour() {
  const p = zonedParts();
  return Number(p.hour) % 24;
}

function localDateObject() {
  const p = zonedParts();
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
}

function formatLocalLongDate() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function updateDynamicDateUI() {
  const hour = localHour();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  const homeGreeting = document.querySelector('body[data-page="home"] .greeting h1');
  if (homeGreeting) {
    homeGreeting.innerHTML = `${greeting}, Kiara <i data-lucide="${hour >= 18 || hour < 6 ? "moon" : "sun"}" class="title-icon"></i>`;
  }

  const todayHeading = document.querySelector('body[data-page="today"] .greeting h1');
  if (todayHeading) {
    todayHeading.innerHTML = `Today <i data-lucide="${hour >= 18 || hour < 6 ? "moon" : "sun"}" class="title-icon"></i>`;
  }

  const pageSubtitle = document.querySelector('body[data-page="today"] .greeting p');
  if (pageSubtitle) {
    pageSubtitle.textContent = `${formatLocalLongDate()} · ${USER_TIMEZONE}`;
  }

  const homeSubtitle = document.querySelector('body[data-page="home"] .greeting p');
  if (homeSubtitle) {
    homeSubtitle.textContent = `Organize today for the life you want tomorrow. · ${USER_TIMEZONE}`;
  }

  icons();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function icons() {
  if (window.lucide) window.lucide.createIcons();
}

function toast(message, isError = false) {
  let el = document.getElementById("appToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "appToast";
    el.className = "app-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.background = isError ? "#9a4d4d" : "#292623";
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 1800);
}

function setSyncStatus(text, offline = false) {
  let pill = document.getElementById("syncPill");
  if (!pill) {
    pill = document.createElement("div");
    pill.id = "syncPill";
    pill.className = "sync-pill";
    pill.innerHTML = '<span class="sync-dot"></span><span class="sync-text"></span>';
    document.body.appendChild(pill);
  }
  pill.classList.toggle("offline", offline);
  pill.querySelector(".sync-text").textContent = text;
}

function makeAuthGate() {
  if (document.getElementById("authGate")) return;
  const gate = document.createElement("div");
  gate.id = "authGate";
  gate.className = "auth-gate";
  gate.innerHTML = `
    <div class="auth-card">
      <h1>K22</h1>
      <p>Your life organizer, synced everywhere.</p>
      <div class="auth-tabs">
        <button class="auth-tab active" data-mode="signin">Sign In</button>
        <button class="auth-tab" data-mode="signup">Create Account</button>
      </div>
      <form class="auth-form" id="authForm">
        <label>Email
          <input id="authEmail" type="email" autocomplete="email" required>
        </label>
        <label>Password
          <input id="authPassword" type="password" autocomplete="current-password" minlength="6" required>
        </label>
        <button class="auth-submit" id="authSubmit" type="submit">Sign In</button>
      </form>
      <div class="auth-message" id="authMessage"></div>
    </div>`;
  document.body.appendChild(gate);

  let mode = "signin";
  gate.querySelectorAll(".auth-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      gate.querySelectorAll(".auth-tab").forEach(x => x.classList.toggle("active", x === btn));
      document.getElementById("authSubmit").textContent = mode === "signin" ? "Sign In" : "Create Account";
      document.getElementById("authPassword").autocomplete = mode === "signin" ? "current-password" : "new-password";
      setAuthMessage("");
    });
  });

  document.getElementById("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const submit = document.getElementById("authSubmit");
    submit.disabled = true;
    submit.textContent = mode === "signin" ? "Signing In..." : "Creating...";

    let error;
    if (mode === "signin") {
      ({ error } = await db.auth.signInWithPassword({ email, password }));
    } else {
      ({ error } = await db.auth.signUp({ email, password }));
    }

    submit.disabled = false;
    submit.textContent = mode === "signin" ? "Sign In" : "Create Account";

    if (error) {
      setAuthMessage(error.message, true);
      return;
    }

    if (mode === "signup") {
      setAuthMessage("Account created. If email confirmation is enabled, check your email before signing in.");
    }
  });
}

function setAuthMessage(message, error = false) {
  const el = document.getElementById("authMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
}

function showApp() {
  document.querySelector(".app-shell")?.classList.remove("auth-hidden");
  document.getElementById("authGate")?.remove();
}

function hideApp() {
  document.querySelector(".app-shell")?.classList.add("auth-hidden");
  makeAuthGate();
  document.getElementById("syncPill")?.remove();
}

async function safe(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}

async function safeOptional(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) {
    console.warn("Optional K22 data source unavailable:", error.message);
    return [];
  }
  return data;
}

const OFFLINE_QUEUE_KEY = "k22OfflineQueue";
const OFFLINE_CACHE_PREFIX = "k22OfflineState:";

function offlineCacheKey() {
  return currentUser ? OFFLINE_CACHE_PREFIX + currentUser.id : null;
}

function saveOfflineCache() {
  const key = offlineCacheKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ state, saved_at: Date.now() }));
  } catch (error) {
    console.warn("Could not save offline cache", error);
  }
}

function restoreOfflineCache() {
  const key = offlineCacheKey();
  if (!key) return false;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (!cached?.state) return false;
    state = cached.state;
    renderEverything();
    return true;
  } catch (error) {
    console.warn("Could not restore offline cache", error);
    return false;
  }
}

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  updateQueuedStatus();
}

function updateQueuedStatus() {
  const count = getOfflineQueue().filter(x => !currentUser || x.user_id === currentUser.id).length;
  if (!navigator.onLine) {
    setSyncStatus(count ? `Offline · ${count} queued` : "Offline", true);
  } else if (count) {
    setSyncStatus(`${count} change${count === 1 ? "" : "s"} waiting to sync`);
  }
}

function queueMutation(mutation) {
  const queue = getOfflineQueue();
  queue.push({
    queue_id: crypto.randomUUID(),
    user_id: currentUser?.id || null,
    created_at: Date.now(),
    ...mutation
  });
  saveOfflineQueue(queue);
  saveOfflineCache();
}

async function runMutation(mutation) {
  const table = db.from(mutation.table);
  let query;

  if (mutation.action === "insert") {
    query = table.insert(mutation.payload).select();
  } else if (mutation.action === "update") {
    query = table.update(mutation.payload).eq("id", mutation.match.id).select();
  } else if (mutation.action === "delete") {
    query = table.delete().eq("id", mutation.match.id);
  } else if (mutation.action === "delete_many") {
    query = table.delete().in("id", mutation.match.ids);
  } else if (mutation.action === "upsert") {
    query = table.upsert(mutation.payload, mutation.onConflict ? { onConflict: mutation.onConflict } : undefined).select();
  } else {
    throw new Error("Unknown offline mutation");
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function commitMutation(mutation, optimisticData = null) {
  if (!navigator.onLine) {
    queueMutation(mutation);
    return { data: optimisticData, queued: true, error: null };
  }

  try {
    const data = await runMutation(mutation);
    saveOfflineCache();
    return { data, queued: false, error: null };
  } catch (error) {
    return { data: null, queued: false, error };
  }
}

async function flushOfflineQueue() {
  if (!navigator.onLine || !currentUser) return;
  let queue = getOfflineQueue();
  const mine = queue.filter(x => x.user_id === currentUser.id);
  if (!mine.length) return;

  setSyncStatus(`Syncing ${mine.length} queued change${mine.length === 1 ? "" : "s"}...`);

  for (const mutation of mine) {
    try {
      await runMutation(mutation);
      queue = queue.filter(x => x.queue_id !== mutation.queue_id);
      saveOfflineQueue(queue);
    } catch (error) {
      console.error("Queued sync failed", mutation, error);
      setSyncStatus("Queued sync needs attention", true);
      return;
    }
  }

  setSyncStatus("Queued changes synced");
}

async function loadAll() {
  if (!currentUser) return;
  setSyncStatus("Syncing...");
  try {
    const [tasks, events, notes, categoryItems, categoryNotes, routine, attachments, settingsRows] = await Promise.all([
      safe(db.from("tasks").select("*").order("position").order("created_at")),
      safe(db.from("calendar_events").select("*").order("event_date").order("event_time")),
      safe(db.from("notes").select("*").order("updated_at", { ascending: false })),
      safe(db.from("category_items").select("*").order("position").order("created_at")),
      safe(db.from("category_notes").select("*")),
      safe(db.from("routine_items").select("*").order("position")),
      safeOptional(db.from("attachments").select("*").order("created_at", { ascending: false })),
      safe(db.from("user_settings").select("*").limit(1))
    ]);

    state.tasks = tasks || [];
    state.events = events || [];
    state.notes = notes || [];
    state.categoryItems = categoryItems || [];
    state.categoryNotes = categoryNotes || [];
    state.routine = routine || [];
    state.attachments = attachments || [];
    state.settings = settingsRows?.[0] || null;

    await migrateLocalStorageIfNeeded();
    await seedRoutineIfNeeded();
    renderEverything();
    applyPendingSearchJump();
    saveOfflineCache();
    setSyncStatus("Synced");
  } catch (error) {
    console.error(error);
    if (restoreOfflineCache()) {
      updateQueuedStatus();
      toast("Showing saved offline data");
    } else {
      setSyncStatus("Sync error", true);
      toast(error.message || "Could not sync", true);
    }
  }
}

async function migrateLocalStorageIfNeeded() {
  const marker = `k22Migrated:${currentUser.id}`;
  if (localStorage.getItem(marker)) return;

  try {
    const inserts = [];

    if (!state.tasks.length) {
      const oldToday = JSON.parse(localStorage.getItem("lifeOrganizerTodayTasks") || "[]");
      const oldHome = JSON.parse(localStorage.getItem("lifeOrganizerTodos") || "[]");
      const rows = [
        ...oldToday.map((x, i) => ({ user_id: currentUser.id, scope: "today", text: x.text, done: !!x.done, position: i })),
        ...oldHome.map((x, i) => ({ user_id: currentUser.id, scope: "home", text: x.text, done: !!x.done, position: i }))
      ];
      if (rows.length) inserts.push(db.from("tasks").insert(rows));
    }

    if (!state.events.length) {
      const old = JSON.parse(localStorage.getItem("lifeOrganizerEvents") || "[]");
      const rows = old.map(x => ({
        user_id: currentUser.id,
        title: x.name || x.title || "Event",
        event_date: x.date || todayISO(),
        event_time: normalizeTime(x.time)
      }));
      if (rows.length) inserts.push(db.from("calendar_events").insert(rows));
    }

    if (!state.notes.length) {
      const old = JSON.parse(localStorage.getItem("lifeOrganizerNotes") || "[]");
      const rows = old.map(x => ({ user_id: currentUser.id, title: x.title || "Untitled note", body: x.body || "" }));
      if (rows.length) inserts.push(db.from("notes").insert(rows));
    }

    if (!state.categoryItems.length) {
      const old = JSON.parse(localStorage.getItem("lifeOrganizerCategoryItems") || "{}");
      const rows = Object.entries(old).flatMap(([category, items]) =>
        (items || []).map((x, i) => ({
          user_id: currentUser.id, category, text: x.text || "", done: !!x.done, position: i
        }))
      );
      if (rows.length) inserts.push(db.from("category_items").insert(rows));
    }

    if (!state.categoryNotes.length) {
      const old = JSON.parse(localStorage.getItem("lifeOrganizerCardNotes") || "{}");
      const rows = Object.entries(old)
        .filter(([, notes]) => notes)
        .map(([category, notes]) => ({ user_id: currentUser.id, category, notes }));
      if (rows.length) inserts.push(db.from("category_notes").insert(rows));
    }

    const oldFocus = localStorage.getItem("lifeOrganizerFocus");
    if (!state.settings && oldFocus) {
      inserts.push(db.from("user_settings").upsert({ user_id: currentUser.id, quick_focus: oldFocus }));
    }

    if (inserts.length) await Promise.all(inserts);
    localStorage.setItem(marker, "1");
    if (inserts.length) {
      const refreshed = await Promise.all([
        safe(db.from("tasks").select("*").order("position").order("created_at")),
        safe(db.from("calendar_events").select("*").order("event_date").order("event_time")),
        safe(db.from("notes").select("*").order("updated_at", { ascending: false })),
        safe(db.from("category_items").select("*").order("position").order("created_at")),
        safe(db.from("category_notes").select("*")),
        safe(db.from("user_settings").select("*").limit(1))
      ]);
      [state.tasks, state.events, state.notes, state.categoryItems, state.categoryNotes] = refreshed.slice(0,5);
      state.settings = refreshed[5]?.[0] || state.settings;
    }
  } catch (e) {
    console.warn("Local migration skipped:", e);
  }
}

async function seedRoutineIfNeeded() {
  if (state.routine.length || !document.getElementById("routineList")) return;

  const defaults = [
    { label:"Morning reset", period:"morning" },
    { label:"Check calendar", period:"morning" },
    { label:"Meal / water", period:"afternoon" },
    { label:"Movement / self care", period:"afternoon" },
    { label:"Evening reset", period:"evening" }
  ];

  const rows = defaults.map((item, i) => ({
    id:crypto.randomUUID(),
    user_id:currentUser.id,
    label:item.label,
    done:false,
    position:i,
    time_of_day:item.period,
    repeat_days:[0,1,2,3,4,5,6],
    last_done_date:null,
    active:true,
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  }));

  const { data, error } = await db.from("routine_items").insert(rows).select();
  if (!error) {
    state.routine = data || rows;
    saveOfflineCache();
  }
}
function renderEverything() {
  updateDynamicDateUI();
  renderTaskSection("homeTodoList","homeTodoForm","homeTodoInput","clearCompleted","home");
  renderTaskSection("todayPageTasks","todayTaskForm","todayTaskInput","todayClearDone","today");
  renderTodoHub();
  renderCalendar();
  renderAgenda();
  bindEventModal();
  renderHomeCalendar();
  renderHomeEvents();
  renderSmartHome();
  renderRoutine();
  renderFocus();
  renderNotesPage();
  bindAttachmentInputs();
  renderNoteAttachments();
  bindCategoryCards();
  bindSearch();
  bindHeaderButtons();
  icons();
}

function renderTaskSection(listId, formId, inputId, clearId, scope) {
  const list = document.getElementById(listId);
  if (!list) return;
  const rows = state.tasks.filter(x => x.scope === scope);
  list.innerHTML = rows.length ? "" : '<div class="empty-inline">Nothing here yet.</div>';

  rows.forEach(task => {
    const row = document.createElement("div");
    row.className = "task-row" + (task.done ? " done" : "");
    row.innerHTML = `
      <label><input type="checkbox" ${task.done ? "checked" : ""}><span>${esc(task.text)}</span></label>
      <button class="task-delete" aria-label="Delete"><i data-lucide="x"></i></button>`;
    row.querySelector("input").addEventListener("change", async e => {
      await setTaskDone(task,e.target.checked);
      row.classList.toggle("done", task.done);
    });
    row.querySelector(".task-delete").addEventListener("click", async () => {
      state.tasks = state.tasks.filter(x => x.id !== task.id);
      saveOfflineCache();
      const result = await commitMutation({
        table:"tasks", action:"delete", match:{ id:task.id }
      });
      if (result.error) return toast(result.error.message, true);
      renderTaskSection(listId, formId, inputId, clearId, scope);
    });
    list.appendChild(row);
  });

  const form = document.getElementById(formId);
  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const input = document.getElementById(inputId);
      const text = input.value.trim();
      if (!text) return;
      const position = state.tasks.filter(x => x.scope === scope).length;
      const localTask = {
        id: crypto.randomUUID(), user_id: currentUser.id, scope, text, done:false, position,
        created_at:new Date().toISOString(), updated_at:new Date().toISOString()
      };
      state.tasks.push(localTask);
      saveOfflineCache();
      const result = await commitMutation({
        table:"tasks", action:"insert", payload:localTask
      }, [localTask]);
      if (result.error) {
        state.tasks = state.tasks.filter(x => x.id !== localTask.id);
        saveOfflineCache();
        return toast(result.error.message, true);
      }
      input.value = "";
      renderTaskSection(listId, formId, inputId, clearId, scope);
      toast("Task added");
    });
  }

  const clear = document.getElementById(clearId);
  if (clear && !clear.dataset.bound) {
    clear.dataset.bound = "1";
    clear.addEventListener("click", async () => {
      const ids = state.tasks.filter(x => x.scope === scope && x.done).map(x => x.id);
      if (!ids.length) return toast("No completed tasks");
      state.tasks = state.tasks.filter(x => !ids.includes(x.id));
      saveOfflineCache();
      const result = await commitMutation({
        table:"tasks", action:"delete_many", match:{ ids }
      });
      if (result.error) return toast(result.error.message, true);
      renderTaskSection(listId, formId, inputId, clearId, scope);
      toast("Completed tasks cleared");
    });
  }
  icons();
}

const initialLocalDate = localDateObject();
let calendarCursor = new Date(initialLocalDate.getFullYear(), initialLocalDate.getMonth(), 1);
let selectedDate = todayISO();

function isoDate(y, m, d) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function monthName(d) {
  return d.toLocaleDateString("en-US",{month:"long",year:"numeric"});
}
function onDate(date) {
  return state.events.filter(e => e.event_date === date);
}
function displayTime(value) {
  if (!value) return "";
  const [h,m] = String(value).split(":");
  const date = new Date(2000,0,1,Number(h),Number(m)||0);
  return date.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
}
function normalizeTime(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(":");
    return `${String(Number(parts[0])).padStart(2,"0")}:${parts[1]}:00`;
  }
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "pm") hour += 12;
  return `${String(hour).padStart(2,"0")}:${match[2] || "00"}:00`;
}

function renderCalendar() {
  const grid = document.querySelector(".full-calendar-grid");
  const panel = document.querySelector(".full-calendar-panel");
  if (!grid || !panel) return;
  panel.querySelector(".calendar-toolbar h2").textContent = monthName(calendarCursor);

  const y = calendarCursor.getFullYear();
  const m = calendarCursor.getMonth();
  const start = new Date(y,m,1).getDay();
  const days = new Date(y,m+1,0).getDate();
  const prev = new Date(y,m,0).getDate();
  grid.innerHTML = "";

  for (let i=0;i<42;i++) {
    let d, cm=m, cy=y, muted=false;
    if (i < start) {
      d = prev-start+i+1; cm--; muted=true;
      if (cm < 0) { cm=11; cy--; }
    } else if (i >= start+days) {
      d = i-start-days+1; cm++; muted=true;
      if (cm > 11) { cm=0; cy++; }
    } else d = i-start+1;

    const ds = isoDate(cy,cm,d);
    const btn = document.createElement("button");
    btn.className = "day-cell" + (muted ? " muted-day" : "") + (ds === selectedDate ? " selected-day" : "");
    btn.innerHTML = `<span>${d}</span>` + onDate(ds).slice(0,2).map(e => `<em class="event-pill">${esc(e.title)}</em>`).join("");
    btn.addEventListener("click", () => { selectedDate = ds; renderCalendar(); });
    btn.addEventListener("dblclick", () => openEventModal(null, ds));
    grid.appendChild(btn);
  }

  const buttons = [...document.querySelectorAll(".calendar-toolbar .soft-btn")];
  if (buttons.length === 3 && !buttons[0].dataset.bound) {
    buttons.forEach(x => x.dataset.bound = "1");
    buttons[0].addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth()-1); renderCalendar(); });
    buttons[1].addEventListener("click", () => {
      const n = localDateObject();
      calendarCursor = new Date(n.getFullYear(), n.getMonth(), 1);
      selectedDate = todayISO();
      renderCalendar();
    });
    buttons[2].addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth()+1); renderCalendar(); });
  }

  const add = document.getElementById("addEventBtn");
  if (add && !add.dataset.bound) {
    add.dataset.bound = "1";
    add.addEventListener("click", () => openEventModal(null, selectedDate));
  }
}

let editingEventId = null;

function toTimeInput(value) {
  if (!value) return "";
  return String(value).slice(0,5);
}

function eventStart(ev) {
  return ev.start_time || ev.event_time || null;
}

function eventTimeLabel(ev) {
  if (ev.all_day) return "All day";
  const start = eventStart(ev);
  const end = ev.end_time;
  if (!start) return "";
  return end ? `${displayTime(start)} – ${displayTime(end)}` : displayTime(start);
}

function reminderLabel(minutes) {
  if (minutes === null || minutes === undefined || minutes === "") return "";
  const n = Number(minutes);
  if (n === 0) return "At event time";
  if (n < 60) return `${n} min before`;
  if (n === 60) return "1 hour before";
  if (n === 1440) return "1 day before";
  return `${n} min before`;
}

function openEventModal(event = null, date = selectedDate) {
  const backdrop = document.getElementById("eventModalBackdrop");
  if (!backdrop) return;

  editingEventId = event?.id || null;
  document.getElementById("eventModalTitle").textContent = event ? "Edit Event" : "Add Event";
  document.getElementById("eventModalEyebrow").textContent = event ? "Calendar Event" : "New Calendar Event";
  document.getElementById("eventId").value = event?.id || "";
  document.getElementById("eventTitleInput").value = event?.title || "";
  document.getElementById("eventDateInput").value = event?.event_date || date || todayISO();
  document.getElementById("eventAllDayInput").checked = !!event?.all_day;
  document.getElementById("eventStartTimeInput").value = toTimeInput(eventStart(event || {}));
  document.getElementById("eventEndTimeInput").value = toTimeInput(event?.end_time);
  document.getElementById("eventLocationInput").value = event?.location || "";
  document.getElementById("eventReminderInput").value =
    event?.reminder_minutes === null || event?.reminder_minutes === undefined ? "" : String(event.reminder_minutes);
  document.getElementById("eventNotesInput").value = event?.notes || "";
  document.getElementById("deleteEventBtn").classList.toggle("hidden", !event);

  updateAllDayFields();
  backdrop.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => document.getElementById("eventTitleInput")?.focus(), 50);
  icons();
}

function closeEventModal() {
  document.getElementById("eventModalBackdrop")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
  editingEventId = null;
}

function updateAllDayFields() {
  const allDay = document.getElementById("eventAllDayInput")?.checked;
  document.querySelectorAll(".event-time-field").forEach(el => el.classList.toggle("disabled-field", !!allDay));
  const start = document.getElementById("eventStartTimeInput");
  const end = document.getElementById("eventEndTimeInput");
  if (start) start.disabled = !!allDay;
  if (end) end.disabled = !!allDay;
}

function bindEventModal() {
  const form = document.getElementById("eventForm");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";

  document.getElementById("closeEventModal")?.addEventListener("click", closeEventModal);
  document.getElementById("cancelEventBtn")?.addEventListener("click", closeEventModal);
  document.getElementById("eventModalBackdrop")?.addEventListener("click", e => {
    if (e.target.id === "eventModalBackdrop") closeEventModal();
  });
  document.getElementById("eventAllDayInput")?.addEventListener("change", updateAllDayFields);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const allDay = document.getElementById("eventAllDayInput").checked;
    const title = document.getElementById("eventTitleInput").value.trim();
    const event_date = document.getElementById("eventDateInput").value;
    const start_time = allDay ? null : normalizeTime(document.getElementById("eventStartTimeInput").value);
    const end_time = allDay ? null : normalizeTime(document.getElementById("eventEndTimeInput").value);
    const location = document.getElementById("eventLocationInput").value.trim() || null;
    const reminderRaw = document.getElementById("eventReminderInput").value;
    const reminder_minutes = reminderRaw === "" ? null : Number(reminderRaw);
    const notes = document.getElementById("eventNotesInput").value.trim() || null;

    if (!title || !event_date) return;

    if (start_time && end_time && end_time <= start_time) {
      return toast("End time must be after start time", true);
    }

    const payload = {
      user_id: currentUser.id,
      title,
      event_date,
      event_time: start_time,
      start_time,
      end_time,
      all_day: allDay,
      location,
      reminder_minutes,
      notes
    };

    const saveBtn = document.getElementById("saveEventBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = editingEventId ? "Saving..." : "Adding...";

    const wasEditing = !!editingEventId;
    const eventId = editingEventId || crypto.randomUUID();
    const localEvent = {
      ...(wasEditing ? (state.events.find(x => x.id === eventId) || {}) : {}),
      ...payload,
      id:eventId,
      created_at: wasEditing ? state.events.find(x => x.id === eventId)?.created_at : new Date().toISOString(),
      updated_at:new Date().toISOString()
    };

    if (wasEditing) {
      const idx = state.events.findIndex(x => x.id === eventId);
      if (idx >= 0) state.events[idx] = localEvent;
    } else {
      state.events.push(localEvent);
    }
    saveOfflineCache();

    const mutation = wasEditing
      ? { table:"calendar_events", action:"update", payload, match:{ id:eventId } }
      : { table:"calendar_events", action:"insert", payload:localEvent };

    const result = await commitMutation(mutation, [localEvent]);

    saveBtn.disabled = false;
    saveBtn.textContent = "Save Event";

    if (result.error) return toast(result.error.message, true);

    if (result.data?.[0]) {
      const idx = state.events.findIndex(x => x.id === eventId);
      if (idx >= 0) state.events[idx] = result.data[0];
    }

    toast(wasEditing ? "Event updated" : "Event added");
    selectedDate = localEvent.event_date;
    closeEventModal();
    renderCalendar();
    renderAgenda();
    renderHomeEvents();
  });

  document.getElementById("deleteEventBtn")?.addEventListener("click", async () => {
    if (!editingEventId) return;
    if (!confirm("Delete this event?")) return;

    const deletingId = editingEventId;
    state.events = state.events.filter(x => x.id !== deletingId);
    saveOfflineCache();

    const result = await commitMutation({
      table:"calendar_events", action:"delete", match:{ id:deletingId }
    });
    if (result.error) return toast(result.error.message, true);
    closeEventModal();
    renderCalendar();
    renderAgenda();
    renderHomeEvents();
    toast("Event deleted");
  });
}

function renderAgenda() {
  const list = document.getElementById("eventsList");
  if (!list) return;
  bindEventModal();
  list.innerHTML = "";

  const sorted = [...state.events].sort((a,b) => {
    const aKey = a.event_date + (eventStart(a) || "");
    const bKey = b.event_date + (eventStart(b) || "");
    return aKey.localeCompare(bKey);
  });

  if (!sorted.length) {
    list.innerHTML = '<div class="empty-inline">No events yet.</div>';
    return;
  }

  sorted.forEach(ev => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "agenda-item blue agenda-event-button";
    const meta = [
      ev.event_date,
      eventTimeLabel(ev),
      ev.location ? `📍 ${ev.location}` : "",
      reminderLabel(ev.reminder_minutes)
    ].filter(Boolean).join(" · ");

    item.innerHTML = `
      <span class="agenda-dot"></span>
      <div class="agenda-copy">
        <b>${esc(ev.title)}</b>
        <small>${esc(meta)}</small>
        ${ev.notes ? `<span class="agenda-notes">${esc(ev.notes)}</span>` : ""}
      </div>
      <i data-lucide="chevron-right" class="agenda-chevron"></i>`;

    item.addEventListener("click", () => openEventModal(ev, ev.event_date));
    list.appendChild(item);
  });
  icons();
}

function renderHomeCalendar() {
  const panel = document.querySelector(".dashboard-calendar-panel");
  if (!panel) return;
  const now = localDateObject();
  const title = panel.querySelector(".panel-title-row h2");
  if (title) title.innerHTML = `<i data-lucide="calendar-days"></i> ${monthName(new Date(now.getFullYear(), now.getMonth(), 1))}`;

  const daysEl = panel.querySelector(".calendar-days");
  if (!daysEl) return;
  const y=now.getFullYear(), m=now.getMonth(), start=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate(), prev=new Date(y,m,0).getDate();
  const cells = [];
  for (let i=0;i<14;i++) {
    let d, cm=m, cy=y, muted=false;
    if (i < start) { d=prev-start+i+1; cm--; muted=true; if(cm<0){cm=11;cy--;} }
    else { d=i-start+1; if(d>days){d-=days;cm++;muted=true;if(cm>11){cm=0;cy++;}} }
    const ds=isoDate(cy,cm,d);
    cells.push(`<span class="${muted ? "muted " : ""}${ds===todayISO() ? "selected" : ""}">${d}</span>`);
  }
  daysEl.innerHTML = cells.join("");
  icons();
}

function renderHomeEvents() {
  const holder = document.querySelector(".dashboard-events");
  if (!holder) return;
  holder.querySelectorAll(".event-strip,.empty-inline").forEach(x => x.remove());
  const rows = onDate(todayISO()).slice(0,3);
  if (!rows.length) {
    const d = document.createElement("div");
    d.className = "empty-inline";
    d.textContent = "No events for today.";
    holder.appendChild(d);
    return;
  }
  rows.forEach((e,i) => {
    const div = document.createElement("div");
    div.className = "event-strip " + (i%2 ? "lilac" : "pink");
    div.innerHTML = `<span>${esc(e.title)}</span><b>${esc(eventTimeLabel(e))}</b>`;
    holder.appendChild(div);
  });
}


let todoView = "inbox";
let editingTaskId = null;

function taskBucket(task) {
  return task.bucket || (task.scope === "today" ? "today" : "inbox");
}

function taskView(task) {
  if (task.done) return "completed";
  if (taskBucket(task) === "someday") return "someday";
  const due = task.due_date || "";
  if (due && due > todayISO()) return "upcoming";
  if (taskBucket(task) === "today" || (due && due <= todayISO())) return "today";
  return "inbox";
}

function priorityRank(priority) {
  return ({high:0,medium:1,low:2,none:3})[priority || "none"] ?? 3;
}

function taskDueLabel(task) {
  if (!task.due_date) return "";
  if (task.due_date === todayISO()) return "Today";
  if (task.due_date < todayISO()) return "Overdue";
  const d = new Date(task.due_date + "T12:00:00");
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

function normalizeSubtasks(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function(item,index){
    if (typeof item === "string") return {id:"sub-"+index+"-"+item,text:item,done:false};
    return {id:item.id || crypto.randomUUID(),text:item.text || "",done:!!item.done};
  }).filter(function(x){return x.text;});
}

function renderTodoHub() {
  const list=document.getElementById("todoTaskList");
  if(!list)return;

  state.tasks.forEach(function(task){task.subtasks=normalizeSubtasks(task.subtasks);});

  const counts={inbox:0,today:0,upcoming:0,someday:0,completed:0};
  state.tasks.forEach(function(task){counts[taskView(task)]++;});
  Object.entries(counts).forEach(function(entry){
    const key=entry[0],count=entry[1];
    const el=document.querySelector('[data-count="'+key+'"]');
    if(el)el.textContent=count;
  });

  const visible=state.tasks.filter(function(task){
    return taskView(task)===todoView;
  }).sort(function(a,b){
    if(todoView==="completed") return String(b.completed_at||b.updated_at||"").localeCompare(String(a.completed_at||a.updated_at||""));
    const p=priorityRank(a.priority)-priorityRank(b.priority);
    if(p)return p;
    return String(a.due_date||"9999-12-31").localeCompare(String(b.due_date||"9999-12-31"));
  });

  const summary=document.getElementById("todoSummary");
  if(summary){
    if(todoView==="today"){
      const overdue=visible.filter(function(x){return x.due_date && x.due_date<todayISO();}).length;
      summary.textContent=overdue ? visible.length+" tasks · "+overdue+" overdue" : visible.length+" tasks for today";
    }else{
      summary.textContent=visible.length+" "+(visible.length===1?"task":"tasks")+" in "+todoView.charAt(0).toUpperCase()+todoView.slice(1);
    }
  }

  list.innerHTML="";
  if(!visible.length){
    list.innerHTML='<div class="todo-empty"><i data-lucide="check-circle-2"></i><b>Nothing here</b><span>This list is clear.</span></div>';
  }

  visible.forEach(function(task){
    const row=document.createElement("article");
    row.className="todo-task-card"+(task.done?" done":"")+" priority-"+(task.priority||"none");
    const dueLabel=taskDueLabel(task);
    const subs=normalizeSubtasks(task.subtasks);
    const doneSubs=subs.filter(function(x){return x.done;}).length;

    let meta="";
    if(task.priority && task.priority!=="none") meta+='<em class="priority-chip '+esc(task.priority)+'">'+esc(task.priority)+'</em>';
    if(dueLabel) meta+='<em class="task-date-chip '+(task.due_date<todayISO()&&!task.done?"overdue":"")+'"><i data-lucide="calendar"></i>'+esc(dueLabel)+'</em>';
    if(task.category) meta+='<em><i data-lucide="tag"></i>'+esc(task.category)+'</em>';
    if(task.repeat_rule && task.repeat_rule!=="none") meta+='<em><i data-lucide="repeat-2"></i>'+esc(task.repeat_rule)+'</em>';
    if(subs.length) meta+='<em><i data-lucide="list-checks"></i>'+doneSubs+'/'+subs.length+'</em>';

    let subtasksHtml="";
    if(subs.length){
      subtasksHtml='<div class="todo-subtasks">'+subs.map(function(sub){
        return '<label><input type="checkbox" data-subtask-id="'+esc(sub.id)+'" '+(sub.done?"checked":"")+'><span>'+esc(sub.text)+'</span></label>';
      }).join("")+'</div>';
    }

    row.innerHTML=
      '<div class="todo-task-top">'+
        '<label class="todo-main-check"><input type="checkbox" '+(task.done?"checked":"")+'><span class="todo-checkmark"></span></label>'+
        '<button class="todo-task-body" type="button">'+
          '<span class="todo-task-title">'+esc(task.text)+'</span>'+
          '<span class="todo-task-meta">'+meta+'</span>'+
        '</button>'+
        '<button class="todo-edit-btn" type="button" aria-label="Edit task"><i data-lucide="pencil"></i></button>'+
      '</div>'+
      subtasksHtml+
      (task.notes?'<div class="todo-task-note">'+esc(task.notes)+'</div>':"");

    row.querySelector(".todo-main-check input").addEventListener("change",async function(e){
      await setTaskDone(task,e.target.checked);
      renderTodoHub();
    });

    row.querySelector(".todo-task-body").addEventListener("click",function(){openTaskModal(task);});
    row.querySelector(".todo-edit-btn").addEventListener("click",function(){openTaskModal(task);});

    row.querySelectorAll("[data-subtask-id]").forEach(function(box){
      box.addEventListener("change",async function(){
        const sub=task.subtasks.find(function(x){return x.id===box.dataset.subtaskId;});
        if(!sub)return;
        sub.done=box.checked;
        task.updated_at=new Date().toISOString();
        saveOfflineCache();
        const result=await commitMutation({
          table:"tasks",action:"update",payload:{subtasks:task.subtasks},match:{id:task.id}
        },[task]);
        if(result.error)toast(result.error.message,true);
        renderTodoHub();
      });
    });

    list.appendChild(row);
  });

  bindTodoControls();
  icons();
}

function bindTodoControls() {
  document.querySelectorAll(".todo-tab").forEach(function(btn){
    if(btn.dataset.bound)return;
    btn.dataset.bound="1";
    btn.addEventListener("click",function(){
      todoView=btn.dataset.todoView;
      document.querySelectorAll(".todo-tab").forEach(function(x){x.classList.toggle("active",x===btn);});
      renderTodoHub();
    });
  });

  const add=document.getElementById("addTaskBtn");
  if(add&&!add.dataset.bound){
    add.dataset.bound="1";
    add.addEventListener("click",function(){openTaskModal();});
  }

  const quick=document.getElementById("todoQuickAdd");
  if(quick&&!quick.dataset.bound){
    quick.dataset.bound="1";
    quick.addEventListener("submit",async function(e){
      e.preventDefault();
      const input=document.getElementById("todoQuickInput");
      const text=input.value.trim();
      if(!text)return;
      const localTask={
        id:crypto.randomUUID(),user_id:currentUser.id,scope:"home",bucket:"inbox",
        text:text,done:false,position:state.tasks.length,priority:"none",repeat_rule:"none",
        subtasks:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()
      };
      state.tasks.push(localTask);
      saveOfflineCache();
      const result=await commitMutation({table:"tasks",action:"insert",payload:localTask},[localTask]);
      if(result.error){
        state.tasks=state.tasks.filter(function(x){return x.id!==localTask.id;});
        saveOfflineCache();
        return toast(result.error.message,true);
      }
      input.value="";
      renderTodoHub();
      toast("Added to Inbox");
    });
  }

  const form=document.getElementById("taskForm");
  if(!form||form.dataset.bound)return;
  form.dataset.bound="1";

  document.getElementById("closeTaskModal")?.addEventListener("click",closeTaskModal);
  document.getElementById("cancelTaskBtn")?.addEventListener("click",closeTaskModal);
  document.getElementById("taskModalBackdrop")?.addEventListener("click",function(e){
    if(e.target.id==="taskModalBackdrop")closeTaskModal();
  });

  form.addEventListener("submit",async function(e){
    e.preventDefault();
    const text=document.getElementById("taskTextInput").value.trim();
    if(!text)return;

    const bucket=document.getElementById("taskBucketInput").value;
    const due_date=document.getElementById("taskDueDateInput").value||null;
    const priority=document.getElementById("taskPriorityInput").value;
    const category=document.getElementById("taskCategoryInput").value.trim()||null;
    const repeat_rule=document.getElementById("taskRepeatInput").value;
    const notes=document.getElementById("taskNotesInput").value.trim()||null;
    const lines=document.getElementById("taskSubtasksInput").value.split("\n").map(function(x){return x.trim();}).filter(Boolean);

    const existing=state.tasks.find(function(x){return x.id===editingTaskId;});
    const oldSubs=normalizeSubtasks(existing?.subtasks);
    const subtasks=lines.map(function(line){
      const match=oldSubs.find(function(x){return x.text===line;});
      return match || {id:crypto.randomUUID(),text:line,done:false};
    });

    const wasEditing=!!editingTaskId;
    const id=editingTaskId||crypto.randomUUID();
    const row=Object.assign({},existing||{},{
      id:id,user_id:currentUser.id,
      scope:bucket==="today"?"today":"home",
      bucket:bucket,text:text,due_date:due_date,priority:priority,category:category,repeat_rule:repeat_rule,notes:notes,subtasks:subtasks,
      done:existing?.done||false,
      position:existing?.position ?? state.tasks.length,
      created_at:existing?.created_at||new Date().toISOString(),
      updated_at:new Date().toISOString()
    });

    if(wasEditing){
      const idx=state.tasks.findIndex(function(x){return x.id===id;});
      if(idx>=0)state.tasks[idx]=row;
    }else{
      state.tasks.push(row);
    }
    saveOfflineCache();

    const payload={scope:row.scope,bucket:bucket,text:text,due_date:due_date,priority:priority,category:category,repeat_rule:repeat_rule,notes:notes,subtasks:subtasks};
    const result=await commitMutation(
      wasEditing
        ? {table:"tasks",action:"update",payload:payload,match:{id:id}}
        : {table:"tasks",action:"insert",payload:row},
      [row]
    );
    if(result.error)return toast(result.error.message,true);

    if(result.data?.[0]){
      const idx=state.tasks.findIndex(function(x){return x.id===id;});
      if(idx>=0)state.tasks[idx]=result.data[0];
    }

    closeTaskModal();
    renderTodoHub();
    toast(wasEditing?"Task updated":"Task added");
  });

  document.getElementById("deleteTaskBtn")?.addEventListener("click",async function(){
    if(!editingTaskId)return;
    if(!confirm("Delete this task?"))return;
    const id=editingTaskId;
    state.tasks=state.tasks.filter(function(x){return x.id!==id;});
    saveOfflineCache();
    const result=await commitMutation({table:"tasks",action:"delete",match:{id:id}});
    if(result.error)return toast(result.error.message,true);
    closeTaskModal();
    renderTodoHub();
    toast("Task deleted");
  });
}

function openTaskModal(task) {
  task=task||null;
  const modal=document.getElementById("taskModalBackdrop");
  if(!modal)return;
  editingTaskId=task?.id||null;
  document.getElementById("taskModalTitle").textContent=task?"Edit Task":"Add Task";
  document.getElementById("taskId").value=task?.id||"";
  document.getElementById("taskTextInput").value=task?.text||"";
  document.getElementById("taskBucketInput").value=task?taskBucket(task):(todoView==="today"?"today":todoView==="someday"?"someday":"inbox");
  document.getElementById("taskDueDateInput").value=task?.due_date||"";
  document.getElementById("taskPriorityInput").value=task?.priority||"none";
  document.getElementById("taskCategoryInput").value=task?.category||"";
  document.getElementById("taskRepeatInput").value=task?.repeat_rule||"none";
  document.getElementById("taskSubtasksInput").value=normalizeSubtasks(task?.subtasks).map(function(x){return x.text;}).join("\n");
  document.getElementById("taskNotesInput").value=task?.notes||"";
  document.getElementById("deleteTaskBtn").classList.toggle("hidden",!task);
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(function(){document.getElementById("taskTextInput")?.focus();},50);
  icons();
}

function closeTaskModal() {
  document.getElementById("taskModalBackdrop")?.classList.add("hidden");
  editingTaskId=null;
  document.body.classList.remove("modal-open");
}

function nextRepeatDate(task) {
  const rule=task.repeat_rule||"none";
  if(rule==="none")return null;
  const d=new Date((task.due_date||todayISO())+"T12:00:00");
  if(rule==="daily")d.setDate(d.getDate()+1);
  if(rule==="weekly")d.setDate(d.getDate()+7);
  if(rule==="monthly")d.setMonth(d.getMonth()+1);
  if(rule==="weekdays"){
    do{d.setDate(d.getDate()+1);}while([0,6].includes(d.getDay()));
  }
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

async function createNextRepeatedTask(task) {
  const nextDate=nextRepeatDate(task);
  if(!nextDate)return;
  const already=state.tasks.some(function(x){return x.repeat_source_id===task.id && x.due_date===nextDate;});
  if(already)return;

  const clone=Object.assign({},task,{
    id:crypto.randomUUID(),done:false,completed_at:null,due_date:nextDate,
    bucket:nextDate===todayISO()?"today":"inbox",
    scope:nextDate===todayISO()?"today":"home",
    subtasks:normalizeSubtasks(task.subtasks).map(function(x){return Object.assign({},x,{id:crypto.randomUUID(),done:false});}),
    repeat_source_id:task.id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()
  });
  state.tasks.push(clone);
  saveOfflineCache();
  const result=await commitMutation({table:"tasks",action:"insert",payload:clone},[clone]);
  if(result.error)toast("Next repeating task could not sync",true);
}

async function setTaskDone(task,checked) {
  const wasDone=!!task.done;
  task.done=checked;
  task.completed_at=checked?new Date().toISOString():null;
  task.updated_at=new Date().toISOString();
  saveOfflineCache();

  const result=await commitMutation({
    table:"tasks",action:"update",
    payload:{done:task.done,completed_at:task.completed_at},
    match:{id:task.id}
  },[task]);
  if(result.error)return toast(result.error.message,true);

  if(checked&&!wasDone&&task.repeat_rule&&task.repeat_rule!=="none"){
    await createNextRepeatedTask(task);
  }
}

let routineFilter = "all";
let editingRoutineId = null;

function routineWeekday() {
  return localDateObject().getDay();
}

function routineRunsToday(item) {
  const days = Array.isArray(item.repeat_days) && item.repeat_days.length
    ? item.repeat_days.map(Number)
    : [0,1,2,3,4,5,6];
  return item.active !== false && days.includes(routineWeekday());
}

function routineIsDoneToday(item) {
  return !!item.done && item.last_done_date === todayISO();
}

function routineRepeatLabel(item) {
  const days = Array.isArray(item.repeat_days) ? item.repeat_days.map(Number).sort() : [0,1,2,3,4,5,6];
  const daily = [0,1,2,3,4,5,6];
  const weekdays = [1,2,3,4,5];
  const weekends = [0,6];
  if (JSON.stringify(days) === JSON.stringify(daily)) return "Every day";
  if (JSON.stringify(days) === JSON.stringify(weekdays)) return "Weekdays";
  if (JSON.stringify(days) === JSON.stringify(weekends)) return "Weekends";
  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return days.map(d=>names[d]).join(", ");
}


function formatEventDateLabel(ev) {
  if (!ev?.event_date) return "";
  if (ev.event_date === todayISO()) return "Today";
  const tomorrow = localDateObject();
  tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowISO = isoDate(tomorrow.getFullYear(),tomorrow.getMonth(),tomorrow.getDate());
  if (ev.event_date === tomorrowISO) return "Tomorrow";
  return new Date(ev.event_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

function renderSmartHome() {
  if (!document.getElementById("homeOverdueCount")) return;

  const activeTasks = state.tasks.filter(task=>!task.done);
  const overdue = activeTasks.filter(task=>task.due_date && task.due_date < todayISO());
  document.getElementById("homeOverdueCount").textContent = overdue.length;
  document.getElementById("homeOverdueText").textContent = overdue.length
    ? overdue[0].text + (overdue.length>1 ? " +" + (overdue.length-1) + " more" : "")
    : "Nothing overdue";

  const upcomingEvents = [...state.events]
    .filter(ev=>ev.event_date >= todayISO())
    .sort((a,b)=>{
      const ak=a.event_date+(eventStart(a)||"00:00");
      const bk=b.event_date+(eventStart(b)||"00:00");
      return ak.localeCompare(bk);
    });
  const nextEvent = upcomingEvents[0];
  document.getElementById("homeNextEventTitle").textContent = nextEvent?.title || "No events";
  document.getElementById("homeNextEventTime").textContent = nextEvent
    ? [formatEventDateLabel(nextEvent),eventTimeLabel(nextEvent)].filter(Boolean).join(" · ")
    : "Calendar is clear";

  const todayRoutines = state.routine.filter(routineRunsToday);
  const doneRoutines = todayRoutines.filter(routineIsDoneToday).length;
  document.getElementById("homeRoutineProgress").textContent = doneRoutines+" / "+todayRoutines.length;
  document.getElementById("homeRoutineText").textContent = todayRoutines.length
    ? (doneRoutines===todayRoutines.length ? "All routines complete" : (todayRoutines.length-doneRoutines)+" left today")
    : "Nothing scheduled";

  const highPriority = activeTasks
    .filter(task=>task.priority==="high")
    .sort((a,b)=>{
      const ad=a.due_date||"9999-12-31",bd=b.due_date||"9999-12-31";
      return ad.localeCompare(bd);
    })[0];
  document.getElementById("homePriorityTitle").textContent = highPriority?.text || "All clear";
  document.getElementById("homePriorityText").textContent = highPriority
    ? (taskDueLabel(highPriority) || "High priority")
    : "No high-priority tasks";

  bindHomeCapture();
}

function bindHomeCapture() {
  const form=document.getElementById("homeCaptureForm");
  if(!form||form.dataset.bound)return;
  form.dataset.bound="1";

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const type=document.getElementById("homeCaptureType").value;
    const input=document.getElementById("homeCaptureInput");
    const text=input.value.trim();
    if(!text)return;

    if(type==="task"){
      const row={
        id:crypto.randomUUID(),user_id:currentUser.id,scope:"home",bucket:"inbox",
        text,done:false,position:state.tasks.length,priority:"none",repeat_rule:"none",
        subtasks:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()
      };
      state.tasks.push(row);
      saveOfflineCache();
      const result=await commitMutation({table:"tasks",action:"insert",payload:row},[row]);
      if(result.error){
        state.tasks=state.tasks.filter(x=>x.id!==row.id);
        saveOfflineCache();
        return toast(result.error.message,true);
      }
      toast("Added to Inbox");
    }

    if(type==="note"){
      const row={
        id:crypto.randomUUID(),user_id:currentUser.id,title:text,body:"",
        created_at:new Date().toISOString(),updated_at:new Date().toISOString()
      };
      state.notes.unshift(row);
      saveOfflineCache();
      const result=await commitMutation({table:"notes",action:"insert",payload:row},[row]);
      if(result.error){
        state.notes=state.notes.filter(x=>x.id!==row.id);
        saveOfflineCache();
        return toast(result.error.message,true);
      }
      toast("Note captured");
    }

    if(type==="event"){
      const row={
        id:crypto.randomUUID(),user_id:currentUser.id,title:text,event_date:todayISO(),
        event_time:null,start_time:null,end_time:null,all_day:true,location:null,
        reminder_minutes:null,notes:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()
      };
      state.events.push(row);
      saveOfflineCache();
      const result=await commitMutation({table:"calendar_events",action:"insert",payload:row},[row]);
      if(result.error){
        state.events=state.events.filter(x=>x.id!==row.id);
        saveOfflineCache();
        return toast(result.error.message,true);
      }
      toast("Event added for today");
    }

    input.value="";
    renderHomeEvents();
    renderSmartHome();
  });
}

function renderRoutine() {
  const list = document.getElementById("routineList");
  if (!list) return;

  const dateLabel = document.getElementById("routineDateLabel");
  if (dateLabel) dateLabel.textContent = `${formatLocalLongDate()} · resets daily`;

  const rows = state.routine
    .filter(routineRunsToday)
    .filter(item => routineFilter === "all" || (item.time_of_day || "anytime") === routineFilter)
    .sort((a,b)=>(a.position ?? 0)-(b.position ?? 0));

  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = '<div class="empty-inline">No routines scheduled here today.</div>';
  }

  rows.forEach(item => {
    const row = document.createElement("div");
    row.className = "routine-item" + (routineIsDoneToday(item) ? " done" : "");
    row.innerHTML = `
      <label class="routine-check">
        <input type="checkbox" ${routineIsDoneToday(item) ? "checked" : ""}>
        <span>
          <b>${esc(item.label)}</b>
          <small>${esc((item.time_of_day || "anytime").replace(/^./,c=>c.toUpperCase()))} · ${esc(routineRepeatLabel(item))}</small>
        </span>
      </label>
      <button class="routine-edit-btn" aria-label="Edit routine"><i data-lucide="pencil"></i></button>`;

    row.querySelector("input").addEventListener("change", async e => {
      const checked = e.target.checked;
      item.done = checked;
      item.last_done_date = checked ? todayISO() : null;
      item.updated_at = new Date().toISOString();
      row.classList.toggle("done", checked);
      saveOfflineCache();

      const result = await commitMutation({
        table:"routine_items",
        action:"update",
        payload:{ done:item.done, last_done_date:item.last_done_date },
        match:{ id:item.id }
      }, [item]);

      if (result.error) toast(result.error.message,true);
    });

    row.querySelector(".routine-edit-btn").addEventListener("click",()=>openRoutineModal(item));
    list.appendChild(row);
  });

  bindRoutineControls();
  icons();
}

function bindRoutineControls() {
  const add = document.getElementById("addRoutineBtn");
  if (add && !add.dataset.bound) {
    add.dataset.bound="1";
    add.addEventListener("click",()=>openRoutineModal());
  }

  document.querySelectorAll(".routine-filter").forEach(btn=>{
    if (btn.dataset.bound) return;
    btn.dataset.bound="1";
    btn.addEventListener("click",()=>{
      routineFilter = btn.dataset.routineFilter;
      document.querySelectorAll(".routine-filter").forEach(x=>x.classList.toggle("active",x===btn));
      renderRoutine();
    });
  });

  const form = document.getElementById("routineForm");
  if (!form || form.dataset.bound) return;
  form.dataset.bound="1";

  document.getElementById("closeRoutineModal")?.addEventListener("click",closeRoutineModal);
  document.getElementById("cancelRoutineBtn")?.addEventListener("click",closeRoutineModal);
  document.getElementById("routineModalBackdrop")?.addEventListener("click",e=>{
    if(e.target.id==="routineModalBackdrop") closeRoutineModal();
  });
  document.getElementById("routineRepeatPreset")?.addEventListener("change",e=>{
    setRoutineDayPreset(e.target.value);
  });

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const label=document.getElementById("routineLabelInput").value.trim();
    if(!label)return;

    const period=document.getElementById("routinePeriodInput").value;
    const repeat_days=[...document.querySelectorAll("#routineDays input:checked")].map(x=>Number(x.value));
    if(!repeat_days.length)return toast("Choose at least one repeat day",true);

    const wasEditing=!!editingRoutineId;
    const id=editingRoutineId||crypto.randomUUID();
    const existing=state.routine.find(x=>x.id===id);

    const localRow={
      ...(existing||{}),
      id,
      user_id:currentUser.id,
      label,
      time_of_day:period,
      repeat_days,
      active:true,
      done:existing?.done||false,
      last_done_date:existing?.last_done_date||null,
      position:existing?.position ?? state.routine.length,
      created_at:existing?.created_at||new Date().toISOString(),
      updated_at:new Date().toISOString()
    };

    if(wasEditing){
      const idx=state.routine.findIndex(x=>x.id===id);
      if(idx>=0)state.routine[idx]=localRow;
    }else{
      state.routine.push(localRow);
    }
    saveOfflineCache();

    const mutation=wasEditing
      ? {table:"routine_items",action:"update",payload:{
          label,time_of_day:period,repeat_days,active:true
        },match:{id}}
      : {table:"routine_items",action:"insert",payload:localRow};

    const result=await commitMutation(mutation,[localRow]);
    if(result.error)return toast(result.error.message,true);

    if(result.data?.[0]){
      const idx=state.routine.findIndex(x=>x.id===id);
      if(idx>=0)state.routine[idx]=result.data[0];
    }

    closeRoutineModal();
    renderRoutine();
    toast(wasEditing?"Routine updated":"Routine added");
  });

  document.getElementById("deleteRoutineBtn")?.addEventListener("click",async()=>{
    if(!editingRoutineId)return;
    if(!confirm("Delete this routine?"))return;
    const id=editingRoutineId;
    state.routine=state.routine.filter(x=>x.id!==id);
    saveOfflineCache();

    const result=await commitMutation({
      table:"routine_items",action:"delete",match:{id}
    });
    if(result.error)return toast(result.error.message,true);

    closeRoutineModal();
    renderRoutine();
    toast("Routine deleted");
  });
}

function setRoutineDayPreset(preset) {
  const map={
    daily:[0,1,2,3,4,5,6],
    weekdays:[1,2,3,4,5],
    weekends:[0,6]
  };
  if(!map[preset])return;
  document.querySelectorAll("#routineDays input").forEach(box=>{
    box.checked=map[preset].includes(Number(box.value));
  });
}

function detectRoutinePreset(days) {
  const d=[...(days||[])].map(Number).sort();
  const eq=a=>JSON.stringify(d)===JSON.stringify(a);
  if(eq([0,1,2,3,4,5,6]))return "daily";
  if(eq([1,2,3,4,5]))return "weekdays";
  if(eq([0,6]))return "weekends";
  return "custom";
}

function openRoutineModal(item=null) {
  const modal=document.getElementById("routineModalBackdrop");
  if(!modal)return;
  editingRoutineId=item?.id||null;

  document.getElementById("routineModalTitle").textContent=item?"Edit Routine":"Add Routine";
  document.getElementById("routineId").value=item?.id||"";
  document.getElementById("routineLabelInput").value=item?.label||"";
  document.getElementById("routinePeriodInput").value=item?.time_of_day||"morning";

  const days=Array.isArray(item?.repeat_days)&&item.repeat_days.length
    ? item.repeat_days.map(Number)
    : [0,1,2,3,4,5,6];

  document.getElementById("routineRepeatPreset").value=detectRoutinePreset(days);
  document.querySelectorAll("#routineDays input").forEach(box=>{
    box.checked=days.includes(Number(box.value));
  });

  document.getElementById("deleteRoutineBtn").classList.toggle("hidden",!item);
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(()=>document.getElementById("routineLabelInput")?.focus(),50);
  icons();
}

function closeRoutineModal() {
  document.getElementById("routineModalBackdrop")?.classList.add("hidden");
  editingRoutineId=null;
  document.body.classList.remove("modal-open");
}


function renderFocus() {
  const focus = document.getElementById("focusNote");
  if (!focus) return;
  focus.value = state.settings?.quick_focus || "";
  let timer;
  if (!focus.dataset.bound) {
    focus.dataset.bound = "1";
    focus.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveFocus(false), 500);
    });
    document.getElementById("saveFocus")?.addEventListener("click", () => saveFocus(true));
  }
}
async function saveFocus(showToast = false) {
  const focus = document.getElementById("focusNote");
  if (!focus) return;
  const row = { user_id: currentUser.id, quick_focus: focus.value };
  state.settings = { ...(state.settings || {}), ...row, updated_at:new Date().toISOString() };
  saveOfflineCache();
  const result = await commitMutation({
    table:"user_settings", action:"upsert", payload:row, onConflict:"user_id"
  }, [state.settings]);
  if (result.error) return toast(result.error.message, true);
  if (result.data?.[0]) state.settings = result.data[0];
  if (showToast) toast("Focus saved");
}

let activeNoteId = null;
function renderNotesPage() {
  const list = document.getElementById("notesList");
  if (!list) return;
  if (!activeNoteId && state.notes.length) activeNoteId = state.notes[0].id;
  list.innerHTML = "";

  state.notes.forEach(note => {
    const btn = document.createElement("button");
    btn.className = "note-list-item" + (note.id === activeNoteId ? " active" : "");
    btn.innerHTML = `<b>${esc(note.title || "Untitled note")}</b><small>${esc(note.body || "Empty note")}</small>`;
    btn.addEventListener("click", () => { activeNoteId = note.id; renderNotesPage(); });
    list.appendChild(btn);
  });

  const title = document.getElementById("noteTitle");
  const body = document.getElementById("noteBody");
  const active = state.notes.find(x => x.id === activeNoteId);
  if (title) title.value = active?.title || "";
  if (body) body.value = active?.body || "";
  renderNoteAttachments();

  const newBtn = document.getElementById("newNoteBtn");
  if (newBtn && !newBtn.dataset.bound) {
    newBtn.dataset.bound = "1";
    newBtn.addEventListener("click", async () => {
      const localNote = {
        id:crypto.randomUUID(), user_id:currentUser.id, title:"Untitled note", body:"",
        created_at:new Date().toISOString(), updated_at:new Date().toISOString()
      };
      state.notes.unshift(localNote);
      activeNoteId = localNote.id;
      saveOfflineCache();
      const result = await commitMutation({
        table:"notes", action:"insert", payload:localNote
      }, [localNote]);
      if (result.error) {
        state.notes = state.notes.filter(x => x.id !== localNote.id);
        activeNoteId = state.notes[0]?.id || null;
        saveOfflineCache();
        return toast(result.error.message, true);
      }
      renderNotesPage();
      document.getElementById("noteTitle")?.focus();
    });
  }

  let saveTimer;
  const saveCurrent = async (notify=false) => {
    const note = state.notes.find(x => x.id === activeNoteId);
    if (!note) return;
    note.title = title.value.trim() || "Untitled note";
    note.body = body.value;
    note.updated_at = new Date().toISOString();
    saveOfflineCache();
    const result = await commitMutation({
      table:"notes", action:"update", payload:{ title:note.title, body:note.body }, match:{ id:note.id }
    }, [note]);
    if (result.error) return toast(result.error.message, true);
    if (result.data?.[0]) Object.assign(note, result.data[0]);
    if (notify) toast("Note saved");
  };

  if (title && !title.dataset.bound) {
    title.dataset.bound = "1";
    title.addEventListener("input", () => { clearTimeout(saveTimer); saveTimer=setTimeout(()=>saveCurrent(false),500); });
  }
  if (body && !body.dataset.bound) {
    body.dataset.bound = "1";
    body.addEventListener("input", () => { clearTimeout(saveTimer); saveTimer=setTimeout(()=>saveCurrent(false),500); });
  }
  const saveBtn = document.getElementById("saveNoteBtn");
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound="1";
    saveBtn.addEventListener("click",()=>saveCurrent(true));
  }
  const deleteBtn = document.getElementById("deleteNoteBtn");
  if (deleteBtn && !deleteBtn.dataset.bound) {
    deleteBtn.dataset.bound="1";
    deleteBtn.addEventListener("click", async () => {
      if (!activeNoteId || !confirm("Delete this note?")) return;
      const deletingId = activeNoteId;
      state.notes = state.notes.filter(x => x.id !== deletingId);
      saveOfflineCache();
      const result = await commitMutation({
        table:"notes", action:"delete", match:{ id:deletingId }
      });
      if (result.error) return toast(result.error.message,true);
      activeNoteId = state.notes[0]?.id || null;
      renderNotesPage();
      toast("Note deleted");
    });
  }
}

let activeCategory = "";
let editingCategoryItemId = null;

const CATEGORY_TEMPLATES = {
  "Medical": {
    placeholder: "Appointment, medication, doctor, symptom...",
    fields: [
      { key:"type", label:"Type", type:"select", options:["Appointment","Medication","Doctor","Symptom","Test","Other"] },
      { key:"provider", label:"Doctor / Provider", type:"text", placeholder:"Name" },
      { key:"date", label:"Date", type:"date" }
    ]
  },
  "Business": {
    placeholder: "Project, client, business task...",
    fields: [
      { key:"status", label:"Status", type:"select", options:["Idea","To Do","In Progress","Waiting","Complete"] },
      { key:"due_date", label:"Due date", type:"date" },
      { key:"company", label:"Company / Client", type:"text", placeholder:"Optional" }
    ]
  },
  "Websites": {
    placeholder: "Website or domain...",
    fields: [
      { key:"url", label:"Website URL", type:"url", placeholder:"https://..." },
      { key:"status", label:"Status", type:"select", options:["Planning","Building","Live","Paused"] },
      { key:"renewal_date", label:"Renewal date", type:"date" }
    ]
  },
  "Car": {
    placeholder: "Oil change, registration, repair...",
    fields: [
      { key:"type", label:"Type", type:"select", options:["Maintenance","Repair","Registration","Insurance","Fuel","Other"] },
      { key:"mileage", label:"Mileage", type:"number", placeholder:"Current mileage" },
      { key:"due_date", label:"Due date", type:"date" }
    ]
  },
  "Wedding": {
    placeholder: "Vendor, checklist item, idea...",
    fields: [
      { key:"status", label:"Status", type:"select", options:["Idea","Researching","Booked","Paid","Complete"] },
      { key:"vendor", label:"Vendor", type:"text", placeholder:"Optional" },
      { key:"budget", label:"Budget", type:"number", placeholder:"Amount" },
      { key:"due_date", label:"Due date", type:"date" }
    ]
  },
  "Gifts": {
    placeholder: "Gift idea...",
    fields: [
      { key:"person", label:"For", type:"text", placeholder:"Person" },
      { key:"budget", label:"Budget", type:"number", placeholder:"Amount" },
      { key:"status", label:"Status", type:"select", options:["Idea","Need to Buy","Bought","Wrapped","Given"] }
    ]
  },
  "Nellis Auction": {
    placeholder: "Auction item...",
    fields: [
      { key:"lot", label:"Lot / Item #", type:"text", placeholder:"Optional" },
      { key:"max_price", label:"Max price", type:"number", placeholder:"Your limit" },
      { key:"end_date", label:"Auction end", type:"datetime-local" },
      { key:"url", label:"Auction URL", type:"url", placeholder:"https://..." },
      { key:"status", label:"Status", type:"select", options:["Watching","Bidding","Won","Lost","Picked Up"] }
    ]
  }
};

function bindCategoryCards() {
  document.querySelectorAll("[data-card]").forEach(card => {
    if (card.dataset.bound) return;
    card.dataset.bound="1";
    card.addEventListener("click",()=>openCategory(card.dataset.card));
  });
}

function renderCategorySpecialFields(item = null) {
  const holder = document.getElementById("categorySpecialFields");
  const input = document.getElementById("categoryItemInput");
  if (!holder || !input) return;

  const config = CATEGORY_TEMPLATES[activeCategory];
  input.placeholder = config?.placeholder || "Add something...";
  holder.innerHTML = "";

  if (!config) {
    holder.classList.add("hidden");
    return;
  }

  holder.classList.remove("hidden");
  config.fields.forEach(field => {
    const label = document.createElement("label");
    label.className = "category-special-field";
    label.innerHTML = `<span>${esc(field.label)}</span>`;

    let control;
    if (field.type === "select") {
      control = document.createElement("select");
      control.innerHTML = '<option value="">Select...</option>' + field.options.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
    } else {
      control = document.createElement("input");
      control.type = field.type;
      if (field.placeholder) control.placeholder = field.placeholder;
      if (field.type === "number") control.step = "any";
    }

    control.dataset.detailKey = field.key;
    control.value = item?.details?.[field.key] ?? "";
    label.appendChild(control);
    holder.appendChild(label);
  });
}

function collectCategoryDetails() {
  const details = {};
  document.querySelectorAll("#categorySpecialFields [data-detail-key]").forEach(el => {
    const value = el.value?.trim?.() ?? el.value;
    if (value !== "" && value !== null) details[el.dataset.detailKey] = value;
  });
  return details;
}

function resetCategoryForm() {
  editingCategoryItemId = null;
  const input = document.getElementById("categoryItemInput");
  if (input) input.value = "";
  document.getElementById("categorySubmitBtn")?.replaceChildren(document.createTextNode("Add"));
  document.getElementById("cancelCategoryEdit")?.classList.add("hidden");
  renderCategorySpecialFields();
}

function openCategory(category) {
  activeCategory = category;
  editingCategoryItemId = null;
  const backdrop = document.getElementById("modalBackdrop");
  const title = document.getElementById("modalTitle");
  const notes = document.getElementById("modalNotes");
  if (!backdrop || !title || !notes) return;

  title.textContent = category;
  notes.value = state.categoryNotes.find(x => x.category === category)?.notes || "";
  backdrop.classList.remove("hidden");
  document.body.classList.add("modal-open");
  resetCategoryForm();
  renderCategoryItems();
  renderCategoryAttachments();

  const closeBtn = document.getElementById("closeModal");
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound="1";
    closeBtn.addEventListener("click",closeCategory);
    backdrop.addEventListener("click",e=>{if(e.target===backdrop)closeCategory();});
  }

  const form = document.getElementById("categoryItemForm");
  if (form && !form.dataset.bound) {
    form.dataset.bound="1";
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const input=document.getElementById("categoryItemInput");
      const text=input.value.trim();
      if(!text || !activeCategory) return;

      const details = collectCategoryDetails();

      if (editingCategoryItemId) {
        const item = state.categoryItems.find(x => x.id === editingCategoryItemId);
        if (!item) return;

        item.text = text;
        item.details = details;
        item.updated_at = new Date().toISOString();
        saveOfflineCache();

        const result = await commitMutation({
          table:"category_items",
          action:"update",
          payload:{ text:item.text, details:item.details },
          match:{ id:item.id }
        }, [item]);

        if(result.error) return toast(result.error.message,true);
        if(result.data?.[0]) Object.assign(item,result.data[0]);
        toast("Item updated");
      } else {
        const position=state.categoryItems.filter(x=>x.category===activeCategory).length;
        const localItem={
          id:crypto.randomUUID(),
          user_id:currentUser.id,
          category:activeCategory,
          text,
          details,
          done:false,
          position,
          created_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        };

        state.categoryItems.push(localItem);
        saveOfflineCache();

        const result=await commitMutation({
          table:"category_items",action:"insert",payload:localItem
        },[localItem]);

        if(result.error){
          state.categoryItems=state.categoryItems.filter(x=>x.id!==localItem.id);
          saveOfflineCache();
          return toast(result.error.message,true);
        }
        toast("Item added");
      }

      resetCategoryForm();
      renderCategoryItems();
    });
  }

  const cancelEdit = document.getElementById("cancelCategoryEdit");
  if (cancelEdit && !cancelEdit.dataset.bound) {
    cancelEdit.dataset.bound="1";
    cancelEdit.addEventListener("click", resetCategoryForm);
  }

  const save = document.getElementById("saveNotes");
  if (save && !save.dataset.bound) {
    save.dataset.bound="1";
    save.addEventListener("click",()=>saveCategoryNotes(true));
  }

  if (!notes.dataset.bound) {
    notes.dataset.bound="1";
    let timer;
    notes.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>saveCategoryNotes(false),500);});
  }
}

function closeCategory() {
  document.getElementById("modalBackdrop")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
  editingCategoryItemId = null;
}

function categoryDetailChips(item) {
  const d = item.details || {};
  const labels = [];

  const friendly = {
    type:"Type", provider:"Provider", date:"Date", status:"Status", due_date:"Due",
    company:"Client", url:"URL", renewal_date:"Renewal", mileage:"Mileage",
    vendor:"Vendor", budget:"Budget", person:"For", lot:"Lot", max_price:"Max",
    end_date:"Ends"
  };

  Object.entries(d).forEach(([key,value]) => {
    if (value === "" || value === null || value === undefined) return;
    if (key === "url") return;
    let shown = String(value);
    if (["budget","max_price"].includes(key) && !shown.startsWith("$")) shown = "$" + shown;
    labels.push(`<span class="category-meta-chip"><b>${esc(friendly[key] || key)}</b> ${esc(shown)}</span>`);
  });

  return labels.join("");
}

function renderCategoryItems() {
  const holder=document.getElementById("categoryItems");
  const empty=document.getElementById("categoryEmpty");
  const count=document.getElementById("categoryItemCount");
  if(!holder)return;

  const items=state.categoryItems.filter(x=>x.category===activeCategory);
  holder.innerHTML="";

  items.forEach(item=>{
    const row=document.createElement("div");
    row.className="category-item category-item-rich"+(item.done?" done":"");

    const url = item.details?.url;
    row.innerHTML=`
      <div class="category-item-main">
        <label class="category-item-check">
          <input type="checkbox" ${item.done?"checked":""}>
          <span class="category-item-title">${esc(item.text)}</span>
        </label>
        <div class="category-item-meta">${categoryDetailChips(item)}</div>
        ${url ? `<a class="category-item-link" href="${esc(url)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Open link</a>` : ""}
      </div>
      <div class="category-item-actions">
        <button class="category-item-edit" aria-label="Edit"><i data-lucide="pencil"></i></button>
        <button class="category-item-delete" aria-label="Delete"><i data-lucide="trash-2"></i></button>
      </div>`;

    row.querySelector("input").addEventListener("change",async e=>{
      item.done=e.target.checked;
      row.classList.toggle("done",item.done);
      saveOfflineCache();
      const result=await commitMutation({
        table:"category_items",action:"update",payload:{done:item.done},match:{id:item.id}
      },[item]);
      if(result.error)toast(result.error.message,true);
    });

    row.querySelector(".category-item-edit").addEventListener("click",()=>{
      editingCategoryItemId=item.id;
      const input=document.getElementById("categoryItemInput");
      input.value=item.text;
      document.getElementById("categorySubmitBtn").textContent="Save";
      document.getElementById("cancelCategoryEdit").classList.remove("hidden");
      renderCategorySpecialFields(item);
      input.focus();
    });

    row.querySelector(".category-item-delete").addEventListener("click",async()=>{
      state.categoryItems=state.categoryItems.filter(x=>x.id!==item.id);
      saveOfflineCache();
      const result=await commitMutation({
        table:"category_items",action:"delete",match:{id:item.id}
      });
      if(result.error)return toast(result.error.message,true);
      if (editingCategoryItemId === item.id) resetCategoryForm();
      renderCategoryItems();
    });

    holder.appendChild(row);
  });

  if(count)count.textContent=`${items.length} ${items.length===1?"item":"items"}`;
  empty?.classList.toggle("hidden",items.length>0);
  icons();
}

async function saveCategoryNotes(notify=false) {
  if(!activeCategory)return;
  const notes=document.getElementById("modalNotes")?.value||"";
  const row={user_id:currentUser.id,category:activeCategory,notes};
  const idx=state.categoryNotes.findIndex(x=>x.category===activeCategory);
  const localRow=idx>=0?{...state.categoryNotes[idx],...row,updated_at:new Date().toISOString()}:
    {id:crypto.randomUUID(),...row,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  if(idx>=0)state.categoryNotes[idx]=localRow;else state.categoryNotes.push(localRow);
  saveOfflineCache();
  const result=await commitMutation({
    table:"category_notes",action:"upsert",payload:localRow,onConflict:"user_id,category"
  },[localRow]);
  if(result.error)return toast(result.error.message,true);
  if(result.data?.[0]){
    const nextIdx=state.categoryNotes.findIndex(x=>x.category===activeCategory);
    if(nextIdx>=0)state.categoryNotes[nextIdx]=result.data[0];
  }
  if(notify)toast(activeCategory+" notes saved");
}



const ATTACHMENT_BUCKET = "k22-files";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

function attachmentOwnerKey(ownerType) {
  if (ownerType === "note") return activeNoteId || null;
  if (ownerType === "category") return activeCategory || null;
  return null;
}

function ownerAttachments(ownerType, ownerKey) {
  return state.attachments.filter(file =>
    file.owner_type === ownerType &&
    (ownerType === "note" ? file.owner_id === ownerKey : file.owner_key === ownerKey)
  );
}

function safeFileName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g,"-")
    .replace(/-+/g,"-")
    .slice(0,120);
}

function formatFileSize(bytes) {
  const n=Number(bytes)||0;
  if(n<1024)return n+" B";
  if(n<1024*1024)return (n/1024).toFixed(n<10240?1:0)+" KB";
  return (n/(1024*1024)).toFixed(1)+" MB";
}

function attachmentIcon(mime) {
  if(String(mime||"").startsWith("image/")) return "image";
  if(String(mime||"").includes("pdf")) return "file-text";
  if(String(mime||"").includes("sheet") || String(mime||"").includes("excel")) return "sheet";
  return "file";
}

async function uploadAttachment(file, ownerType, ownerKey) {
  if(!currentUser || !ownerKey)return;
  if(!navigator.onLine){
    toast("Connect to the internet to upload files",true);
    return;
  }
  if(file.size > MAX_ATTACHMENT_SIZE){
    toast(file.name+" is over the 10 MB limit",true);
    return;
  }

  const id=crypto.randomUUID();
  const clean=safeFileName(file.name);
  const folder=ownerType==="note" ? "notes" : "categories";
  const path=currentUser.id+"/"+folder+"/"+encodeURIComponent(String(ownerKey))+"/"+id+"-"+clean;

  setSyncStatus("Uploading "+file.name+"...");
  const upload=await db.storage.from(ATTACHMENT_BUCKET).upload(path,file,{
    cacheControl:"3600",
    upsert:false,
    contentType:file.type || undefined
  });

  if(upload.error){
    setSyncStatus("Upload failed",true);
    return toast(upload.error.message,true);
  }

  const row={
    id,
    user_id:currentUser.id,
    owner_type:ownerType,
    owner_id:ownerType==="note"?ownerKey:null,
    owner_key:ownerType==="category"?String(ownerKey):null,
    file_name:file.name,
    storage_path:path,
    mime_type:file.type||null,
    file_size:file.size
  };

  const {data,error}=await db.from("attachments").insert(row).select().single();
  if(error){
    await db.storage.from(ATTACHMENT_BUCKET).remove([path]);
    setSyncStatus("Upload failed",true);
    return toast(error.message,true);
  }

  state.attachments.unshift(data);
  saveOfflineCache();
  renderNoteAttachments();
  renderCategoryAttachments();
  setSyncStatus("Synced");
  toast("File uploaded");
}

async function openAttachment(file) {
  if(!navigator.onLine){
    return toast("Connect to the internet to open this file",true);
  }
  const {data,error}=await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(file.storage_path,60);
  if(error)return toast(error.message,true);
  window.open(data.signedUrl,"_blank","noopener");
}

async function deleteAttachment(file) {
  if(!navigator.onLine)return toast("Connect to the internet to delete files",true);
  if(!confirm('Delete "'+file.file_name+'"?'))return;

  const storage=await db.storage.from(ATTACHMENT_BUCKET).remove([file.storage_path]);
  if(storage.error)return toast(storage.error.message,true);

  const {error}=await db.from("attachments").delete().eq("id",file.id);
  if(error)return toast(error.message,true);

  state.attachments=state.attachments.filter(x=>x.id!==file.id);
  saveOfflineCache();
  renderNoteAttachments();
  renderCategoryAttachments();
  toast("File deleted");
}

function attachmentCard(file) {
  const card=document.createElement("div");
  card.className="attachment-card";
  card.innerHTML=
    '<button class="attachment-open" type="button">'+
      '<span class="attachment-file-icon"><i data-lucide="'+attachmentIcon(file.mime_type)+'"></i></span>'+
      '<span class="attachment-copy"><b>'+esc(file.file_name)+'</b><small>'+esc(formatFileSize(file.file_size))+'</small></span>'+
    '</button>'+
    '<button class="attachment-delete" type="button" aria-label="Delete attachment"><i data-lucide="trash-2"></i></button>';
  card.querySelector(".attachment-open").addEventListener("click",()=>openAttachment(file));
  card.querySelector(".attachment-delete").addEventListener("click",()=>deleteAttachment(file));
  return card;
}

function renderNoteAttachments() {
  const holder=document.getElementById("noteAttachments");
  if(!holder)return;
  holder.innerHTML="";
  const rows=activeNoteId ? ownerAttachments("note",activeNoteId) : [];
  rows.forEach(file=>holder.appendChild(attachmentCard(file)));
  if(!rows.length)holder.innerHTML='<div class="attachment-empty">No files attached.</div>';
  const count=document.getElementById("noteAttachmentCount");
  if(count)count.textContent=rows.length+" "+(rows.length===1?"file":"files");
  const input=document.getElementById("noteAttachmentInput");
  if(input)input.disabled=!activeNoteId;
  icons();
}

function renderCategoryAttachments() {
  const holder=document.getElementById("categoryAttachments");
  if(!holder)return;
  holder.innerHTML="";
  const rows=activeCategory ? ownerAttachments("category",activeCategory) : [];
  rows.forEach(file=>holder.appendChild(attachmentCard(file)));
  if(!rows.length)holder.innerHTML='<div class="attachment-empty">No files or photos yet.</div>';
  const count=document.getElementById("categoryAttachmentCount");
  if(count)count.textContent=rows.length+" "+(rows.length===1?"file":"files");
  icons();
}

function bindAttachmentInputs() {
  const noteInput=document.getElementById("noteAttachmentInput");
  if(noteInput&&!noteInput.dataset.bound){
    noteInput.dataset.bound="1";
    noteInput.addEventListener("change",async()=>{
      const files=[...noteInput.files];
      const ownerKey=attachmentOwnerKey("note");
      if(!ownerKey){
        toast("Create or select a note first",true);
        noteInput.value="";
        return;
      }
      for(const file of files)await uploadAttachment(file,"note",ownerKey);
      noteInput.value="";
    });
  }

  const categoryInput=document.getElementById("categoryAttachmentInput");
  if(categoryInput&&!categoryInput.dataset.bound){
    categoryInput.dataset.bound="1";
    categoryInput.addEventListener("change",async()=>{
      const files=[...categoryInput.files];
      const ownerKey=attachmentOwnerKey("category");
      if(!ownerKey){
        categoryInput.value="";
        return;
      }
      for(const file of files)await uploadAttachment(file,"category",ownerKey);
      categoryInput.value="";
    });
  }
}

function buildUniversalSearchResults(query) {
  const q=query.trim().toLowerCase();
  if(!q)return [];
  const results=[];

  state.tasks.forEach(task=>{
    const hay=[task.text,task.category,task.notes,task.due_date,task.priority,task.repeat_rule]
      .filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:"Task",icon:"check-square",title:task.text,
        detail:[taskView(task),task.category,taskDueLabel(task)].filter(Boolean).join(" · "),
        page:"today.html",action:"task",id:task.id
      });
    }
  });

  state.notes.forEach(note=>{
    const hay=[note.title,note.body].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:"Note",icon:"notebook-pen",title:note.title||"Untitled note",
        detail:(note.body||"").slice(0,90),page:"notes.html",action:"note",id:note.id
      });
    }
  });

  state.events.forEach(ev=>{
    const hay=[ev.title,ev.event_date,ev.location,ev.notes,eventTimeLabel(ev)].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:"Calendar",icon:"calendar-days",title:ev.title,
        detail:[formatEventDateLabel(ev),eventTimeLabel(ev),ev.location].filter(Boolean).join(" · "),
        page:"calendar.html",action:"event",id:ev.id
      });
    }
  });

  state.categoryItems.forEach(item=>{
    const details=Object.values(item.details||{}).join(" ");
    const hay=[item.category,item.text,details].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:item.category,icon:"folder-open",title:item.text,
        detail:"Category item",page:"categories.html",action:"category-item",id:item.id,category:item.category
      });
    }
  });

  state.categoryNotes.forEach(note=>{
    const hay=[note.category,note.notes].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:note.category,icon:"notebook-tabs",title:note.category+" notes",
        detail:(note.notes||"").slice(0,90),page:"categories.html",action:"category",category:note.category
      });
    }
  });

  state.routine.forEach(item=>{
    const hay=[item.label,item.time_of_day,routineRepeatLabel(item)].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:"Routine",icon:"repeat-2",title:item.label,
        detail:[item.time_of_day,routineRepeatLabel(item)].filter(Boolean).join(" · "),
        page:"today.html",action:"routine",id:item.id
      });
    }
  });

  state.attachments.forEach(file=>{
    const hay=[file.file_name,file.mime_type,file.owner_key].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      const isNote=file.owner_type==="note";
      const note=isNote?state.notes.find(n=>n.id===file.owner_id):null;
      results.push({
        type:"File",icon:attachmentIcon(file.mime_type),title:file.file_name,
        detail:isNote ? (note?.title||"Note attachment") : ((file.owner_key||"Category")+" attachment"),
        page:isNote?"notes.html":"categories.html",
        action:isNote?"note":"category",
        id:isNote?file.owner_id:undefined,
        category:!isNote?file.owner_key:undefined
      });
    }
  });

  const categories=[...new Set([
    ...state.categoryItems.map(x=>x.category),
    ...state.categoryNotes.map(x=>x.category)
  ])];
  categories.forEach(category=>{
    if(category && category.toLowerCase().includes(q)){
      results.push({
        type:"Category",icon:"layout-grid",title:category,
        detail:"Open category",page:"categories.html",action:"category",category
      });
    }
  });

  return results.slice(0,40);
}

function ensureSearchPanel(input) {
  let panel=document.getElementById("universalSearchPanel");
  if(panel)return panel;
  panel=document.createElement("div");
  panel.id="universalSearchPanel";
  panel.className="universal-search-panel hidden";
  document.body.appendChild(panel);
  return panel;
}

function positionSearchPanel(input,panel) {
  const rect=input.closest(".search-wrap")?.getBoundingClientRect()||input.getBoundingClientRect();
  panel.style.top=(rect.bottom+8)+"px";
  panel.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-panel.offsetWidth-12))+"px";
  panel.style.width=Math.min(520,window.innerWidth-24)+"px";
}

function renderUniversalSearch(input) {
  const panel=ensureSearchPanel(input);
  const q=input.value.trim();
  if(!q){
    panel.classList.add("hidden");
    panel.innerHTML="";
    return;
  }

  const results=buildUniversalSearchResults(q);
  panel.innerHTML=
    '<div class="universal-search-head"><span>Search K22</span><b>'+results.length+' result'+(results.length===1?"":"s")+'</b></div>'+
    (results.length
      ? '<div class="universal-search-results">'+results.map((r,i)=>
          '<button class="universal-search-result" data-result-index="'+i+'">'+
            '<span class="universal-result-icon"><i data-lucide="'+esc(r.icon)+'"></i></span>'+
            '<span class="universal-result-copy"><small>'+esc(r.type)+'</small><b>'+esc(r.title)+'</b>'+
            (r.detail?'<em>'+esc(r.detail)+'</em>':'')+'</span>'+
            '<i data-lucide="arrow-up-right" class="universal-result-arrow"></i>'+
          '</button>'
        ).join("")+'</div>'
      : '<div class="universal-search-empty"><i data-lucide="search-x"></i><b>No matches</b><span>Try another word or phrase.</span></div>');

  panel.classList.remove("hidden");
  requestAnimationFrame(()=>positionSearchPanel(input,panel));

  panel.querySelectorAll("[data-result-index]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const result=results[Number(btn.dataset.resultIndex)];
      if(!result)return;
      localStorage.setItem("k22SearchJump",JSON.stringify(result));
      if(location.pathname.endsWith(result.page)||location.pathname.endsWith("/"+result.page)){
        handleSearchJump(result);
        panel.classList.add("hidden");
        input.value="";
      }else{
        location.href=result.page;
      }
    });
  });

  icons();
}

function bindSearch() {
  const input=document.getElementById("globalSearch");
  if(!input||input.dataset.bound)return;
  input.dataset.bound="1";
  input.placeholder="Search K22...";

  input.addEventListener("input",()=>renderUniversalSearch(input));
  input.addEventListener("focus",()=>{if(input.value.trim())renderUniversalSearch(input);});
  input.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      document.getElementById("universalSearchPanel")?.classList.add("hidden");
      input.blur();
    }
  });

  document.addEventListener("click",e=>{
    const panel=document.getElementById("universalSearchPanel");
    if(!panel)return;
    if(!panel.contains(e.target)&&!input.closest(".search-wrap")?.contains(e.target)){
      panel.classList.add("hidden");
    }
  });

  window.addEventListener("resize",()=>{
    const panel=document.getElementById("universalSearchPanel");
    if(panel&&!panel.classList.contains("hidden"))positionSearchPanel(input,panel);
  });
}

function handleSearchJump(result) {
  if(!result)return;

  if(result.action==="note"){
    activeNoteId=result.id;
    renderNotesPage();
    setTimeout(()=>document.getElementById("noteTitle")?.focus(),80);
  }

  if(result.action==="event"){
    const ev=state.events.find(x=>x.id===result.id);
    if(ev){
      selectedDate=ev.event_date;
      const d=new Date(ev.event_date+"T12:00:00");
      calendarCursor=new Date(d.getFullYear(),d.getMonth(),1);
      renderCalendar();
      openEventModal(ev,ev.event_date);
    }
  }

  if(result.action==="task"){
    const task=state.tasks.find(x=>x.id===result.id);
    if(task){
      todoView=taskView(task);
      document.querySelectorAll(".todo-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.todoView===todoView));
      renderTodoHub();
      openTaskModal(task);
    }
  }

  if(result.action==="routine"){
    const item=state.routine.find(x=>x.id===result.id);
    if(item)openRoutineModal(item);
  }

  if(result.action==="category"||result.action==="category-item"){
    openCategory(result.category);
    if(result.action==="category-item"&&result.id){
      setTimeout(()=>{
        const item=state.categoryItems.find(x=>x.id===result.id);
        if(item){
          editingCategoryItemId=item.id;
          const input=document.getElementById("categoryItemInput");
          if(input)input.value=item.text;
          document.getElementById("categorySubmitBtn").textContent="Save";
          document.getElementById("cancelCategoryEdit").classList.remove("hidden");
          renderCategorySpecialFields(item);
        }
      },60);
    }
  }

  localStorage.removeItem("k22SearchJump");
}

function applyPendingSearchJump() {
  const raw=localStorage.getItem("k22SearchJump");
  if(!raw)return;
  try{
    const result=JSON.parse(raw);
    setTimeout(()=>handleSearchJump(result),100);
  }catch{
    localStorage.removeItem("k22SearchJump");
  }
}



function downloadTextFile(filename, content, mime="text/plain") {
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function backupDateStamp() {
  const p=zonedParts();
  return p.year+"-"+p.month+"-"+p.day;
}

function buildK22Backup() {
  return {
    app:"K22 Life Organizer",
    version:1,
    exported_at:new Date().toISOString(),
    timezone:USER_TIMEZONE,
    data:{
      tasks:state.tasks,
      calendar_events:state.events,
      notes:state.notes,
      category_items:state.categoryItems,
      category_notes:state.categoryNotes,
      routine_items:state.routine,
      user_settings:state.settings ? [state.settings] : [],
      attachment_manifest:state.attachments.map(file=>({
        id:file.id,
        owner_type:file.owner_type,
        owner_id:file.owner_id,
        owner_key:file.owner_key,
        file_name:file.file_name,
        mime_type:file.mime_type,
        file_size:file.file_size,
        storage_path:file.storage_path,
        created_at:file.created_at
      }))
    }
  };
}

function csvEscape(value) {
  if(value===null||value===undefined)return "";
  let text=typeof value==="object" ? JSON.stringify(value) : String(value);
  if(/[",\n\r]/.test(text))text='"'+text.replace(/"/g,'""')+'"';
  return text;
}

function rowsToCSV(rows) {
  if(!rows.length)return "";
  const headers=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  return [
    headers.map(csvEscape).join(","),
    ...rows.map(row=>headers.map(key=>csvEscape(row[key])).join(","))
  ].join("\n");
}

function exportBackupJSON() {
  const backup=buildK22Backup();
  downloadTextFile(
    "K22-backup-"+backupDateStamp()+".json",
    JSON.stringify(backup,null,2),
    "application/json"
  );
  toast("Backup downloaded");
}

function csvRowsFor(type) {
  if(type==="tasks") return state.tasks.map(x=>({...x,subtasks:JSON.stringify(x.subtasks||[])}));
  if(type==="calendar") return state.events;
  if(type==="notes") return state.notes;
  if(type==="routines") return state.routine.map(x=>({...x,repeat_days:JSON.stringify(x.repeat_days||[])}));
  if(type==="categories") return state.categoryItems.map(x=>({...x,details:JSON.stringify(x.details||{})}));
  if(type==="category-notes") return state.categoryNotes;
  if(type==="attachments") return state.attachments.map(x=>({
    file_name:x.file_name,owner_type:x.owner_type,owner_id:x.owner_id,owner_key:x.owner_key,
    mime_type:x.mime_type,file_size:x.file_size,created_at:x.created_at
  }));
  return [];
}

function exportSelectedCSV() {
  const select=document.getElementById("backupCsvType");
  if(!select)return;
  const type=select.value;
  const rows=csvRowsFor(type);
  if(!rows.length)return toast("Nothing to export in that section",true);
  downloadTextFile("K22-"+type+"-"+backupDateStamp()+".csv",rowsToCSV(rows),"text/csv");
  toast("CSV downloaded");
}

function openBackupManager() {
  document.getElementById("profilePopover")?.remove();

  let backdrop=document.getElementById("backupModalBackdrop");
  if(!backdrop){
    backdrop=document.createElement("div");
    backdrop.id="backupModalBackdrop";
    backdrop.className="event-modal-backdrop";
    backdrop.innerHTML=`
      <div class="event-modal backup-modal">
        <div class="event-modal-head">
          <div>
            <small>K22 Data</small>
            <h2>Backup & Export</h2>
          </div>
          <button class="modal-close" id="closeBackupModal" aria-label="Close"><i data-lucide="x"></i></button>
        </div>

        <div class="backup-grid">
          <section class="backup-card">
            <div class="backup-card-icon"><i data-lucide="database-backup"></i></div>
            <div>
              <h3>Full Backup</h3>
              <p>Download your tasks, calendar, notes, categories, routines, settings, and an attachment inventory as one JSON file.</p>
            </div>
            <button class="save-btn" id="downloadBackupBtn"><i data-lucide="download"></i> Download JSON Backup</button>
          </section>

          <section class="backup-card">
            <div class="backup-card-icon"><i data-lucide="table-2"></i></div>
            <div>
              <h3>CSV Export</h3>
              <p>Export one section for spreadsheets or your own records.</p>
            </div>
            <div class="backup-inline">
              <select id="backupCsvType">
                <option value="tasks">Tasks</option>
                <option value="calendar">Calendar Events</option>
                <option value="notes">Notes</option>
                <option value="routines">Routines</option>
                <option value="categories">Category Items</option>
                <option value="category-notes">Category Notes</option>
                <option value="attachments">Attachment Inventory</option>
              </select>
              <button class="soft-btn" id="downloadCsvBtn"><i data-lucide="download"></i> Export CSV</button>
            </div>
          </section>

          <section class="backup-card backup-restore-card">
            <div class="backup-card-icon"><i data-lucide="rotate-ccw"></i></div>
            <div>
              <h3>Restore Backup</h3>
              <p>Choose a K22 JSON backup. Restore merges it into this account; it does not erase other current data.</p>
            </div>
            <label class="backup-file-picker">
              <input id="restoreBackupInput" type="file" accept=".json,application/json" hidden>
              <i data-lucide="file-up"></i>
              <span>Choose Backup File</span>
            </label>
            <div id="restoreBackupStatus" class="backup-status"></div>
          </section>
        </div>

        <div class="backup-note">
          <i data-lucide="paperclip"></i>
          <span>Uploaded file contents are not copied into the JSON backup. The backup includes an attachment inventory; your existing uploaded files remain safely in Supabase Storage.</span>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    document.getElementById("closeBackupModal")?.addEventListener("click",closeBackupManager);
    backdrop.addEventListener("click",e=>{if(e.target===backdrop)closeBackupManager();});
    document.getElementById("downloadBackupBtn")?.addEventListener("click",exportBackupJSON);
    document.getElementById("downloadCsvBtn")?.addEventListener("click",exportSelectedCSV);
    document.getElementById("restoreBackupInput")?.addEventListener("change",handleBackupRestore);
  }else{
    backdrop.classList.remove("hidden");
  }

  document.body.classList.add("modal-open");
  icons();
}

function closeBackupManager() {
  document.getElementById("backupModalBackdrop")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function cleanRestoreRows(rows, table) {
  if(!Array.isArray(rows))return [];
  const allowed={
    tasks:["id","scope","text","done","position","bucket","due_date","priority","category","repeat_rule","notes","subtasks","completed_at","repeat_source_id","created_at","updated_at"],
    calendar_events:["id","title","event_date","event_time","start_time","end_time","all_day","location","reminder_minutes","notes","created_at","updated_at"],
    notes:["id","title","body","created_at","updated_at"],
    category_items:["id","category","text","done","position","details","created_at","updated_at"],
    category_notes:["id","category","notes","created_at","updated_at"],
    routine_items:["id","label","done","position","time_of_day","repeat_days","last_done_date","active","created_at","updated_at"],
    user_settings:["quick_focus","display_name","created_at","updated_at"]
  }[table]||[];

  return rows.map(row=>{
    const clean={user_id:currentUser.id};
    allowed.forEach(key=>{if(row[key]!==undefined)clean[key]=row[key];});
    return clean;
  });
}

async function restoreRows(table, rows, options={}) {
  if(!rows.length)return 0;
  const query=db.from(table).upsert(rows,options);
  const {error}=await query;
  if(error)throw error;
  return rows.length;
}

async function handleBackupRestore(e) {
  const input=e.target;
  const file=input.files?.[0];
  if(!file)return;

  const status=document.getElementById("restoreBackupStatus");
  try{
    if(!navigator.onLine)throw new Error("Connect to the internet before restoring a backup.");
    status.textContent="Reading backup...";

    const parsed=JSON.parse(await file.text());
    if(parsed?.app!=="K22 Life Organizer" || !parsed?.data){
      throw new Error("This does not look like a valid K22 backup.");
    }

    if(!confirm("Restore this backup into your account? Existing items are kept unless the backup contains the same item ID.")){
      input.value="";
      status.textContent="";
      return;
    }

    setSyncStatus("Restoring backup...");
    status.textContent="Restoring your data...";

    const d=parsed.data;
    let restored=0;

    restored+=await restoreRows("tasks",cleanRestoreRows(d.tasks,"tasks"));
    restored+=await restoreRows("calendar_events",cleanRestoreRows(d.calendar_events,"calendar_events"));
    restored+=await restoreRows("notes",cleanRestoreRows(d.notes,"notes"));
    restored+=await restoreRows("category_items",cleanRestoreRows(d.category_items,"category_items"));
    restored+=await restoreRows(
      "category_notes",
      cleanRestoreRows(d.category_notes,"category_notes"),
      {onConflict:"user_id,category"}
    );
    restored+=await restoreRows("routine_items",cleanRestoreRows(d.routine_items,"routine_items"));

    const settings=cleanRestoreRows(d.user_settings,"user_settings");
    if(settings.length){
      const {error}=await db.from("user_settings").upsert(settings[0],{onConflict:"user_id"});
      if(error)throw error;
      restored++;
    }

    await loadAll();
    status.textContent="Restore complete · "+restored+" records processed.";
    toast("Backup restored");
  }catch(error){
    console.error(error);
    status.textContent=error.message||"Restore failed.";
    toast(error.message||"Restore failed",true);
    setSyncStatus("Restore failed",true);
  }finally{
    input.value="";
  }
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function installK22() {
  if (isStandaloneApp()) {
    toast("K22 is already installed");
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === "accepted") toast("K22 installation started");
    deferredInstallPrompt = null;
    document.getElementById("profilePopover")?.remove();
    return;
  }

  if (isIOS()) {
    alert("To install K22 on iPhone/iPad: tap Safari’s Share button, then choose “Add to Home Screen.”");
    return;
  }

  alert("Your browser will offer installation once K22 meets its install requirements. You can also look for “Install app” in your browser menu.");
}

function showUpdateBanner(registration) {
  if (document.getElementById("pwaUpdateBanner")) return;
  const banner = document.createElement("div");
  banner.id = "pwaUpdateBanner";
  banner.className = "pwa-update-banner";
  banner.innerHTML = `
    <div>
      <b>New K22 update ready</b>
      <span>Reload to use the newest version.</span>
    </div>
    <button id="applyK22Update">Update</button>`;
  document.body.appendChild(banner);
  document.getElementById("applyK22Update")?.addEventListener("click", () => {
    registration.waiting?.postMessage("SKIP_WAITING");
  });
}

async function registerK22PWA() {
  if (!("serviceWorker" in navigator)) return;

  try {
    swRegistration = await navigator.serviceWorker.register("./sw.js");

    if (swRegistration.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(swRegistration);
    }

    swRegistration.addEventListener("updatefound", () => {
      const worker = swRegistration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner(swRegistration);
        }
      });
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  } catch (error) {
    console.warn("K22 service worker registration failed:", error);
  }
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  document.getElementById("profilePopover")?.remove();
  toast("K22 installed");
});


function bindHeaderButtons() {
  const bell=document.querySelector(".round-btn");
  if(bell&&!bell.dataset.bound){bell.dataset.bound="1";bell.addEventListener("click",()=>toast("You’re all caught up — no new notifications"));}
  const avatar=document.querySelector(".avatar-btn");
  if(avatar&&!avatar.dataset.bound){
    avatar.dataset.bound="1";
    avatar.addEventListener("click",()=>{
      let p=document.getElementById("profilePopover");
      if(p){p.remove();return;}
      p=document.createElement("div");
      p.id="profilePopover";
      p.className="profile-popover";
      p.innerHTML=`
        <b>Kiara</b>
        <small class="profile-email">${esc(currentUser?.email||"")}</small>
        <a href="categories.html"><i data-lucide="layout-grid"></i> Open Categories</a>
        <button id="backupK22Btn"><i data-lucide="database-backup"></i> Backup & Export</button>
        ${isStandaloneApp() ? "" : '<button id="installK22Btn"><i data-lucide="download"></i> Install K22 App</button>'}
        <button class="signout-btn" id="signOutBtn"><i data-lucide="log-out"></i> Sign Out</button>`;
      document.body.appendChild(p);
      document.getElementById("backupK22Btn")?.addEventListener("click",openBackupManager);
      document.getElementById("installK22Btn")?.addEventListener("click",installK22);
      document.getElementById("signOutBtn").addEventListener("click",async()=>{await db.auth.signOut();});
      icons();
    });
  }
}

function startRealtime() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  realtimeChannel = db.channel("k22-sync")
    .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"calendar_events"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"notes"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"category_items"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"category_notes"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"routine_items"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"attachments"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"user_settings"},()=>loadAll())
    .subscribe(status=>{
      if(status==="SUBSCRIBED")setSyncStatus("Live sync on");
    });
}

async function handleSession(session) {
  currentUser = session?.user || null;
  if (!currentUser) {
    hideApp();
    return;
  }
  showApp();
  if (!navigator.onLine) {
    restoreOfflineCache();
    updateQueuedStatus();
  } else {
    await flushOfflineQueue();
    await loadAll();
  }
  startRealtime();
}

document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){closeCategory();closeEventModal();closeRoutineModal();closeTaskModal();closeBackupManager();document.getElementById("profilePopover")?.remove();}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="s"&&document.getElementById("saveNoteBtn")){
    e.preventDefault();document.getElementById("saveNoteBtn").click();
  }
});

window.addEventListener("online",async()=>{
  setSyncStatus("Back online");
  await flushOfflineQueue();
  await loadAll();
});
window.addEventListener("offline",()=>{
  saveOfflineCache();
  updateQueuedStatus();
});

(async function init(){
  registerK22PWA();
  updateDynamicDateUI();
  document.querySelector(".app-shell")?.classList.add("auth-hidden");
  makeAuthGate();
  const { data:{ session } } = await db.auth.getSession();
  await handleSession(session);
  db.auth.onAuthStateChange(async (_event, nextSession) => {
    await handleSession(nextSession);
  });
  icons();
})();


document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateDynamicDateUI();
    renderHomeCalendar();
    renderHomeEvents();
    renderSmartHome();
    if (document.querySelector(".full-calendar-grid")) {
      const d = localDateObject();
      if (selectedDate === todayISO()) {
        calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      renderCalendar();
    }
  }
});

setInterval(() => {
  updateDynamicDateUI();
  renderHomeEvents();
  renderSmartHome();
}, 60000);
