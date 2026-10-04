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
    const [tasks, events, notes, categoryItems, categoryNotes, routine, settingsRows] = await Promise.all([
      safe(db.from("tasks").select("*").order("position").order("created_at")),
      safe(db.from("calendar_events").select("*").order("event_date").order("event_time")),
      safe(db.from("notes").select("*").order("updated_at", { ascending: false })),
      safe(db.from("category_items").select("*").order("position").order("created_at")),
      safe(db.from("category_notes").select("*")),
      safe(db.from("routine_items").select("*").order("position")),
      safe(db.from("user_settings").select("*").limit(1))
    ]);

    state.tasks = tasks || [];
    state.events = events || [];
    state.notes = notes || [];
    state.categoryItems = categoryItems || [];
    state.categoryNotes = categoryNotes || [];
    state.routine = routine || [];
    state.settings = settingsRows?.[0] || null;

    await migrateLocalStorageIfNeeded();
    await seedRoutineIfNeeded();
    renderEverything();
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
  renderCalendar();
  renderAgenda();
  bindEventModal();
  renderHomeCalendar();
  renderHomeEvents();
  renderRoutine();
  renderFocus();
  renderNotesPage();
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
      task.done = e.target.checked;
      row.classList.toggle("done", task.done);
      saveOfflineCache();
      const result = await commitMutation({
        table:"tasks", action:"update", payload:{ done:task.done }, match:{ id:task.id }
      }, [task]);
      if (result.error) toast(result.error.message, true);
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

function bindSearch() {
  const input=document.getElementById("globalSearch");
  if(!input||input.dataset.bound)return;
  input.dataset.bound="1";
  input.addEventListener("input",e=>{
    const q=e.target.value.trim().toLowerCase();
    document.querySelectorAll("[data-card],.note-list-item,.agenda-item,.task-row,.square-card").forEach(el=>{
      el.classList.toggle("search-hidden",!!q&&!el.textContent.toLowerCase().includes(q));
    });
  });
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
        ${isStandaloneApp() ? "" : '<button id="installK22Btn"><i data-lucide="download"></i> Install K22 App</button>'}
        <button class="signout-btn" id="signOutBtn"><i data-lucide="log-out"></i> Sign Out</button>`;
      document.body.appendChild(p);
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
  if(e.key==="Escape"){closeCategory();closeEventModal();closeRoutineModal();document.getElementById("profilePopover")?.remove();}
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
}, 60000);
