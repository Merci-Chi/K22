const SUPABASE_URL = "https://gifizpabjfrymfobqore.supabase.co";
const SUPABASE_KEY = "sb_publishable_xlUJnJCGhWi6s1zaF-gY2w_9gEeLZm3";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let currentUser = null;
let realtimeChannel = null;
let deferredInstallPrompt = null;
let swRegistration = null;
let categoryBlocksAvailable = true;
let state = {
  tasks: [],
  events: [],
  notes: [],
  categoryItems: [],
  categoryNotes: [],
  categoryBlocks: [],
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


function passwordProblem(password) {
  if(password.length < 8) return "Use at least 8 characters.";
  if(!/[A-Z]/.test(password)) return "Add at least one capital letter.";
  if(!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if(!/\d/.test(password)) return "Add at least one number.";
  if(!/[^A-Za-z0-9]/.test(password)) return "Add at least one symbol.";
  return "";
}

function rememberedEmail() {
  return localStorage.getItem("k22RememberedEmail") || "";
}



function makeAuthGate() {
  if (document.getElementById("authGate")) return;

  const gate = document.createElement("div");
  gate.id = "authGate";
  gate.className = "auth-gate";
  gate.innerHTML = `
    <div class="auth-card single-user-auth">
      <div class="auth-brand-icon"><i data-lucide="lock-keyhole"></i></div>
      <h1>K22</h1>
      <p>Private organizer</p>

      <form class="auth-form" id="authForm">
        <label>Password
          <div class="password-field">
            <input id="authPassword" type="password" autocomplete="current-password" required autofocus>
            <button type="button" class="password-toggle" id="authPasswordToggle" aria-label="Show password"><i data-lucide="eye"></i></button>
          </div>
        </label>

        <button class="auth-submit" id="authSubmit" type="submit">Unlock K22</button>
      </form>

      <div class="auth-message" id="authMessage"></div>
    </div>`;
  document.body.appendChild(gate);

  document.getElementById("authPasswordToggle")?.addEventListener("click",()=>{
    const input=document.getElementById("authPassword");
    input.type=input.type==="password"?"text":"password";
    document.getElementById("authPasswordToggle").innerHTML=input.type==="password"
      ? '<i data-lucide="eye"></i>'
      : '<i data-lucide="eye-off"></i>';
    icons();
  });

  document.getElementById("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const password = document.getElementById("authPassword").value;
    const submit = document.getElementById("authSubmit");

    submit.disabled = true;
    submit.textContent = "Unlocking...";

    try {
      const response = await fetch(SUPABASE_URL + "/functions/v1/k22-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY
        },
        body: JSON.stringify({ password })
      });

      const payload = await response.json().catch(()=>({}));
      if(!response.ok || !payload.token_hash) {
        throw new Error(payload.error || "Incorrect password.");
      }

      const { error } = await db.auth.verifyOtp({
        type: "magiclink",
        token_hash: payload.token_hash
      });

      if(error) throw error;
      document.getElementById("authPassword").value="";
    } catch(error) {
      setAuthMessage(error.message || "Could not unlock K22.", true);
    } finally {
      submit.disabled = false;
      submit.textContent = "Unlock K22";
    }
  });

  icons();
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

async function loadCategoryBlocksSafe() {
  const { data, error } = await db.from("category_blocks")
    .select("*")
    .order("position")
    .order("created_at");
  if (error) {
    categoryBlocksAvailable = false;
    console.warn("Category blocks are not set up yet:", error.message);
    return [];
  }
  categoryBlocksAvailable = true;
  return data || [];
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
    const [tasks, events, notes, categoryItems, categoryNotes, categoryBlocks, routine, attachments, settingsRows] = await Promise.all([
      safe(db.from("tasks").select("*").order("position").order("created_at")),
      safe(db.from("calendar_events").select("*").order("event_date").order("event_time")),
      safe(db.from("notes").select("*").order("updated_at", { ascending: false })),
      safe(db.from("category_items").select("*").order("position").order("created_at")),
      safe(db.from("category_notes").select("*")),
      loadCategoryBlocksSafe(),
      safe(db.from("routine_items").select("*").order("position")),
      safeOptional(db.from("attachments").select("*").order("created_at", { ascending: false })),
      safe(db.from("user_settings").select("*").limit(1))
    ]);

    state.tasks = tasks || [];
    state.events = events || [];
    state.notes = notes || [];
    state.categoryItems = categoryItems || [];
    state.categoryNotes = categoryNotes || [];
    state.categoryBlocks = categoryBlocks || [];
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
  setupCategoryPage();
  renderCategoryBlocks();
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

const CATEGORY_PAGE_META = {
  "Love": { icon:"heart", tone:"pink", description:"Relationships, memories, plans, and the people close to you." },
  "Medical": { icon:"stethoscope", tone:"lilac", description:"Appointments, providers, health records, documents, and personal medical notes." },
  "Goals": { icon:"target", tone:"gold", description:"Big plans, milestones, progress, and the things you are working toward." },
  "Routine": { icon:"sun", tone:"blue", description:"Daily rhythms, habits, routines, and the systems that keep life moving." },
  "Education": { icon:"graduation-cap", tone:"pink", description:"Learning plans, courses, research, school notes, and useful resources." },
  "Trackers": { icon:"chart-no-axes-column-increasing", tone:"lilac", description:"Anything you want to measure, notice, or keep a running record of." },
  "Cooking": { icon:"cooking-pot", tone:"pink", description:"Recipes, meal ideas, ingredients, favorites, and kitchen inspiration." },
  "My Food Order": { icon:"cup-soda", tone:"green", description:"Your favorite orders, customizations, restaurants, and things worth ordering again." },
  "Lifestyle Notes": { icon:"notebook-pen", tone:"gold", description:"Everyday references, preferences, ideas, and details that make life easier." },
  "Fashion": { icon:"shirt", tone:"pink", description:"Outfits, sizing, inspiration, shopping notes, and personal style." },
  "Parties": { icon:"party-popper", tone:"lilac", description:"Party ideas, guest plans, themes, supplies, and event inspiration." },
  "Wishlist": { icon:"shopping-bag", tone:"blue", description:"Things you want, things to compare, and ideas to come back to later." },
  "Business": { icon:"laptop", tone:"blue", description:"Projects, clients, deadlines, operations, documents, and business planning." },
  "Websites": { icon:"globe-2", tone:"lilac", description:"Websites, domains, renewals, project status, links, and related notes." },
  "Investments": { icon:"chart-no-axes-column-increasing", tone:"green", description:"Investment research, ideas, records, watchlists, and long-term notes." },
  "Networking": { icon:"users", tone:"gold", description:"People, introductions, follow-ups, opportunities, and useful connections." },
  "Legal": { icon:"file-text", tone:"pink", description:"Important legal notes, deadlines, references, and documents." },
  "Nellis Auction": { icon:"tags", tone:"blue", description:"Lots to watch, bid limits, auction links, pickups, and purchase records." },
  "Ideas": { icon:"lightbulb", tone:"pink", description:"A flexible space for thoughts, inspiration, possibilities, and things worth saving." },
  "Gifts": { icon:"gift", tone:"lilac", description:"Gift ideas, budgets, people, occasions, and what you have already bought." },
  "Wedding": { icon:"gem", tone:"green", description:"Plans, vendors, inspiration, budget notes, checklists, and wedding details." },
  "Kids": { icon:"baby", tone:"gold", description:"Ideas, plans, references, memories, and anything you want to keep for the future." },
  "Home": { icon:"house", tone:"pink", description:"Home ideas, projects, purchases, inspiration, maintenance, and plans." },
  "Car": { icon:"car-front", tone:"blue", description:"Maintenance, mileage, registration, insurance, repairs, receipts, and car notes." }
};

function categoryPageUrl(category) {
  return "category.html?name="+encodeURIComponent(category);
}

function setupCategoryPage() {
  if(document.body.dataset.page!=="category")return;
  const params=new URLSearchParams(location.search);
  const requested=params.get("name");
  if(!requested || !CATEGORY_PAGE_META[requested]){
    location.replace("categories.html");
    return;
  }
  openCategory(requested,{replaceUrl:true});
}

function updateCategoryDocumentMeta() {
  if(document.body.dataset.page!=="category" || !activeCategory)return;
  const title=document.getElementById("categoryPageTitle");
  const description=document.getElementById("categoryPageDescription");
  const icon=document.getElementById("categoryPageIcon");
  const cover=document.getElementById("categoryCover");
  const edited=document.getElementById("categoryLastEdited");
  const meta=CATEGORY_PAGE_META[activeCategory] || {icon:"folder-open",tone:"blue",description:"Your space for everything that belongs here."};

  if(title)title.textContent=activeCategory;
  if(description)description.textContent=meta.description;
  if(icon)icon.innerHTML='<i data-lucide="'+meta.icon+'"></i>';
  if(cover){
    cover.className="category-cover tone-"+meta.tone;
    cover.setAttribute("aria-label",activeCategory+" cover");
  }
  document.title=activeCategory+" — K22";

  const timestamps=[
    ...state.categoryItems.filter(x=>x.category===activeCategory).map(x=>x.updated_at||x.created_at),
    ...(state.categoryBlocks||[]).filter(x=>x.category===activeCategory).map(x=>x.updated_at||x.created_at),
    ...state.categoryNotes.filter(x=>x.category===activeCategory).map(x=>x.updated_at||x.created_at),
    ...state.attachments.filter(x=>x.owner_type==="category"&&x.owner_key===activeCategory).map(x=>x.created_at)
  ].filter(Boolean).sort().reverse();

  if(edited){
    edited.textContent=timestamps[0]
      ? "Edited "+new Date(timestamps[0]).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
      : "New page";
  }
  icons();
}


const CATEGORY_BLOCK_TYPES = {
  paragraph:{label:"Text",icon:"pilcrow",placeholder:"Write something..."},
  heading1:{label:"Heading 1",icon:"heading-1",placeholder:"Big heading"},
  heading2:{label:"Heading 2",icon:"heading-2",placeholder:"Section heading"},
  heading3:{label:"Heading 3",icon:"heading-3",placeholder:"Small heading"},
  bullet:{label:"Bullet",icon:"list",placeholder:"List item"},
  numbered:{label:"Numbered",icon:"list-ordered",placeholder:"List item"},
  checklist:{label:"Checklist",icon:"list-checks",placeholder:"To-do item"},
  quote:{label:"Quote",icon:"quote",placeholder:"Quote or important thought"},
  callout:{label:"Highlight",icon:"highlighter",placeholder:"Highlight something important"},
  image:{label:"Image",icon:"image"},
  gallery:{label:"Gallery",icon:"gallery-horizontal"},
  file:{label:"File Card",icon:"file"},
  link:{label:"Link",icon:"link",placeholder:"Link title"},
  code:{label:"Code",icon:"code-2",placeholder:"Paste code or a snippet..."},
  divider:{label:"Divider",icon:"minus"},
  spacer:{label:"Spacer",icon:"move-vertical"}
};

function blocksForActiveCategory() {
  return (state.categoryBlocks || [])
    .filter(block=>block.category===activeCategory)
    .sort((a,b)=>(a.position||0)-(b.position||0));
}

function normalizeBlockContent(block) {
  const content=block?.content;
  if(content && typeof content==="object" && !Array.isArray(content))return content;
  if(typeof content==="string")return {text:content};
  return {};
}

async function migrateCategoryLegacyToBlocks(category) {
  if(!categoryBlocksAvailable || !navigator.onLine || !currentUser)return;
  const existing=(state.categoryBlocks||[]).filter(x=>x.category===category);
  if(existing.length)return;

  const marker="k22LegacyBlocks:"+currentUser.id+":"+category;
  if(localStorage.getItem(marker))return;

  const rows=[];
  let position=0;
  const oldNotes=state.categoryNotes.find(x=>x.category===category)?.notes?.trim();
  if(oldNotes){
    rows.push({
      id:crypto.randomUUID(),user_id:currentUser.id,category,type:"paragraph",
      content:{text:oldNotes},settings:{legacy_source:"category_notes"},position:position++
    });
  }

  state.categoryItems.filter(x=>x.category===category).forEach(item=>{
    rows.push({
      id:crypto.randomUUID(),user_id:currentUser.id,category,type:"checklist",
      content:{text:item.text,checked:!!item.done},
      settings:{legacy_source:"category_items",legacy_item_id:item.id,details:item.details||{}},
      position:position++
    });
  });

  if(!rows.length){
    localStorage.setItem(marker,"1");
    return;
  }

  const {data,error}=await db.from("category_blocks").insert(rows).select();
  if(error){
    console.warn("Legacy category import skipped:",error);
    return;
  }

  state.categoryBlocks.push(...(data||rows));
  localStorage.setItem(marker,"1");
  saveOfflineCache();
}


function sanitizeRichBlockHtml(html) {
  const template=document.createElement("template");
  template.innerHTML=html||"";
  const allowed=new Set(["B","STRONG","I","EM","U","S","STRIKE","CODE","A","SPAN","BR"]);
  const walk=node=>{
    [...node.children].forEach(child=>{
      if(!allowed.has(child.tagName)){
        child.replaceWith(...child.childNodes);
        return;
      }
      [...child.attributes].forEach(attr=>{
        const name=attr.name.toLowerCase();
        if(child.tagName==="A" && name==="href"){
          const href=child.getAttribute("href")||"";
          if(!/^(https?:\/\/|mailto:)/i.test(href))child.removeAttribute("href");
          return;
        }
        if(child.tagName==="A" && ["target","rel"].includes(name))return;
        if(child.tagName==="SPAN" && name==="style"){
          const bg=(child.style.backgroundColor||"").trim();
          child.removeAttribute("style");
          if(bg)child.style.backgroundColor=bg;
          return;
        }
        child.removeAttribute(attr.name);
      });
      if(child.tagName==="A"){
        child.target="_blank";
        child.rel="noopener noreferrer";
      }
      walk(child);
    });
  };
  walk(template.content);
  return template.innerHTML;
}

function blockPlainText(field) {
  return (field.innerText||"").replace(/\u00a0/g," ").trimEnd();
}

function ensureRichTextToolbar() {
  let toolbar=document.getElementById("categoryRichToolbar");
  if(toolbar)return toolbar;

  toolbar=document.createElement("div");
  toolbar.id="categoryRichToolbar";
  toolbar.className="category-rich-toolbar hidden";
  toolbar.innerHTML=`
    <button type="button" data-rich-command="bold" aria-label="Bold"><b>B</b></button>
    <button type="button" data-rich-command="italic" aria-label="Italic"><i>I</i></button>
    <button type="button" data-rich-command="underline" aria-label="Underline"><u>U</u></button>
    <button type="button" data-rich-command="strikeThrough" aria-label="Strikethrough"><s>S</s></button>
    <button type="button" data-rich-command="inlineCode" aria-label="Inline code"><i data-lucide="code"></i></button>
    <button type="button" data-rich-command="createLink" aria-label="Link"><i data-lucide="link"></i></button>
    <span class="category-rich-divider"></span>
    <button type="button" class="category-highlight-dot" data-highlight="#f8e7a8" aria-label="Yellow highlight"></button>
    <button type="button" class="category-highlight-dot" data-highlight="#f3d7dc" aria-label="Pink highlight"></button>
    <button type="button" class="category-highlight-dot" data-highlight="#dcebdc" aria-label="Green highlight"></button>
    <button type="button" class="category-highlight-dot" data-highlight="#dce7f2" aria-label="Blue highlight"></button>
    <button type="button" class="category-highlight-dot" data-highlight="#e7def1" aria-label="Lilac highlight"></button>
    <button type="button" data-rich-command="removeFormat" aria-label="Clear formatting"><i data-lucide="eraser"></i></button>
  `;
  document.body.appendChild(toolbar);

  toolbar.addEventListener("pointerdown",e=>e.preventDefault());
  toolbar.addEventListener("click",e=>{
    const btn=e.target.closest("button");
    const field=document.querySelector(".category-block-input.rich-active");
    if(!btn||!field)return;
    field.focus();

    const highlight=btn.dataset.highlight;
    const command=btn.dataset.richCommand;

    if(highlight){
      document.execCommand("hiliteColor",false,highlight);
      if(!document.queryCommandValue("hiliteColor"))document.execCommand("backColor",false,highlight);
    }else if(command==="createLink"){
      const selection=window.getSelection();
      if(!selection||selection.isCollapsed)return;
      let url=prompt("Paste a link:");
      if(!url)return;
      url=url.trim();
      if(!/^(https?:\/\/|mailto:)/i.test(url))url="https://"+url;
      document.execCommand("createLink",false,url);
      field.querySelectorAll("a").forEach(a=>{a.target="_blank";a.rel="noopener noreferrer";});
    }else if(command==="inlineCode"){
      const selection=window.getSelection();
      if(!selection||selection.isCollapsed)return;
      const text=selection.toString();
      document.execCommand("insertHTML",false,"<code>"+esc(text)+"</code>");
    }else if(command){
      document.execCommand(command,false,null);
    }

    field.dispatchEvent(new Event("input",{bubbles:true}));
    positionRichToolbar(field);
  });

  icons();
  return toolbar;
}

function positionRichToolbar(field) {
  const toolbar=ensureRichTextToolbar();
  if(!field || !document.body.contains(field)){
    toolbar.classList.add("hidden");
    return;
  }

  const selection=window.getSelection();
  const mobile=window.matchMedia("(max-width: 650px)").matches;

  if(mobile){
    toolbar.classList.remove("hidden");
    toolbar.classList.add("mobile");
    toolbar.style.left="";
    toolbar.style.top="";
    return;
  }

  toolbar.classList.remove("mobile");
  if(!selection || selection.isCollapsed || !field.contains(selection.anchorNode)){
    toolbar.classList.add("hidden");
    return;
  }

  const range=selection.getRangeAt(0);
  const rect=range.getBoundingClientRect();
  if(!rect.width && !rect.height){
    toolbar.classList.add("hidden");
    return;
  }

  toolbar.classList.remove("hidden");
  const width=toolbar.offsetWidth||320;
  const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.left+(rect.width-width)/2));
  const top=Math.max(8,rect.top-toolbar.offsetHeight-8);
  toolbar.style.left=left+"px";
  toolbar.style.top=top+"px";
}

function hideRichToolbarSoon() {
  setTimeout(()=>{
    const active=document.activeElement;
    if(!active?.classList?.contains("category-block-input")){
      document.getElementById("categoryRichToolbar")?.classList.add("hidden");
      document.querySelectorAll(".category-block-input.rich-active").forEach(x=>x.classList.remove("rich-active"));
    }
  },80);
}

async function createCategoryBlock(type="paragraph", afterId=null) {
  if(!categoryBlocksAvailable){
    toast("Run the Batch 2 category_blocks SQL first",true);
    return;
  }
  if(!activeCategory || !CATEGORY_BLOCK_TYPES[type])return;

  const rows=blocksForActiveCategory();
  let position=rows.length;
  if(afterId){
    const index=rows.findIndex(x=>x.id===afterId);
    if(index>=0)position=index+1;
  }

  // Keep positions stable when inserting in the middle.
  const later=rows.filter(x=>(x.position||0)>=position);
  for(const row of later){
    row.position=(row.position||0)+1;
    commitMutation({
      table:"category_blocks",action:"update",
      payload:{position:row.position},match:{id:row.id}
    },[row]);
  }

  const content=type==="checklist"
    ? {text:"",checked:false}
    : type==="link"
      ? {text:"",url:""}
      : {text:""};

  const local={
    id:crypto.randomUUID(),user_id:currentUser.id,category:activeCategory,type,
    content,settings:{},position,
    created_at:new Date().toISOString(),updated_at:new Date().toISOString()
  };

  state.categoryBlocks.push(local);
  saveOfflineCache();
  const result=await commitMutation({
    table:"category_blocks",action:"insert",payload:local
  },[local]);

  if(result.error){
    state.categoryBlocks=state.categoryBlocks.filter(x=>x.id!==local.id);
    saveOfflineCache();
    return toast(result.error.message,true);
  }
  if(result.data?.[0])Object.assign(local,result.data[0]);

  renderCategoryBlocks();
  updateCategoryDocumentMeta();
  setTimeout(()=>document.querySelector('[data-block-id="'+local.id+'"] .category-block-input')?.focus(),40);
}

async function updateCategoryBlock(block, patch) {
  Object.assign(block,patch,{updated_at:new Date().toISOString()});
  saveOfflineCache();
  const payload={};
  if(patch.content!==undefined)payload.content=patch.content;
  if(patch.settings!==undefined)payload.settings=patch.settings;
  if(patch.type!==undefined)payload.type=patch.type;
  if(patch.position!==undefined)payload.position=patch.position;

  const result=await commitMutation({
    table:"category_blocks",action:"update",payload,match:{id:block.id}
  },[block]);
  if(result.error)toast(result.error.message,true);
  updateCategoryDocumentMeta();
}

async function deleteCategoryBlock(block) {
  state.categoryBlocks=state.categoryBlocks.filter(x=>x.id!==block.id);
  saveOfflineCache();
  renderCategoryBlocks();

  const result=await commitMutation({
    table:"category_blocks",action:"delete",match:{id:block.id}
  });
  if(result.error)return toast(result.error.message,true);
  updateCategoryDocumentMeta();
}

function categoryNumberForBlock(block) {
  return blocksForActiveCategory()
    .filter(x=>x.type==="numbered" && (x.position||0)<=(block.position||0))
    .length;
}


const signedMediaUrlCache=new Map();

async function signedAttachmentUrl(file) {
  if(!file)return null;
  const cached=signedMediaUrlCache.get(file.id);
  if(cached && cached.expires>Date.now())return cached.url;
  if(!navigator.onLine)return null;
  const {data,error}=await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(file.storage_path,3600);
  if(error)return null;
  signedMediaUrlCache.set(file.id,{url:data.signedUrl,expires:Date.now()+55*60*1000});
  return data.signedUrl;
}

function attachmentById(id) {
  return (state.attachments||[]).find(x=>x.id===id)||null;
}

async function chooseFiles(accept,multiple=false) {
  return await new Promise(resolve=>{
    const input=document.createElement("input");
    input.type="file";
    input.accept=accept||"*/*";
    input.multiple=multiple;
    input.style.display="none";
    document.body.appendChild(input);
    input.addEventListener("change",()=>{
      const files=[...input.files];
      input.remove();
      resolve(files);
    },{once:true});
    input.addEventListener("cancel",()=>{
      input.remove();
      resolve([]);
    },{once:true});
    input.click();
  });
}

async function createMediaBlock(kind) {
  if(!activeCategory)return;
  if(!navigator.onLine){
    toast("Connect to the internet to add media",true);
    return;
  }
  const multiple=kind==="gallery";
  const files=await chooseFiles(kind==="file"?"*/*":"image/*",multiple);
  if(!files.length)return;

  const selected=kind==="gallery"?files.filter(f=>String(f.type||"").startsWith("image/")):files.slice(0,1);
  if(!selected.length){
    toast("Choose image files for a gallery",true);
    return;
  }

  const uploaded=[];
  for(const file of selected){
    const row=await uploadAttachment(file,"category",activeCategory,{quiet:true});
    if(row)uploaded.push(row);
  }
  if(!uploaded.length)return;

  const content=kind==="gallery"
    ? {attachment_ids:uploaded.map(x=>x.id),caption:""}
    : kind==="image"
      ? {attachment_id:uploaded[0].id,caption:""}
      : {attachment_id:uploaded[0].id};

  const rows=blocksForActiveCategory();
  const local={
    id:crypto.randomUUID(),user_id:currentUser.id,category:activeCategory,type:kind,
    content,settings:kind==="image"?{size:"medium"}:kind==="gallery"?{columns:2}:{},
    position:rows.length,created_at:new Date().toISOString(),updated_at:new Date().toISOString()
  };

  state.categoryBlocks.push(local);
  saveOfflineCache();
  const result=await commitMutation({
    table:"category_blocks",action:"insert",payload:local
  },[local]);

  if(result.error){
    state.categoryBlocks=state.categoryBlocks.filter(x=>x.id!==local.id);
    saveOfflineCache();
    return toast(result.error.message,true);
  }
  if(result.data?.[0])Object.assign(local,result.data[0]);

  renderCategoryBlocks();
  renderCategoryAttachments();
  updateCategoryDocumentMeta();
  toast(kind==="gallery"?"Gallery added":kind==="image"?"Image added":"File added");
}

async function hydrateMediaBlock(block,row) {
  const content=normalizeBlockContent(block);

  if(block.type==="image"){
    const file=attachmentById(content.attachment_id);
    const img=row.querySelector(".category-media-image");
    if(!file||!img)return;
    const url=await signedAttachmentUrl(file);
    if(url)img.src=url;
  }

  if(block.type==="gallery"){
    const ids=Array.isArray(content.attachment_ids)?content.attachment_ids:[];
    for(const id of ids){
      const file=attachmentById(id);
      const img=row.querySelector('[data-attachment-id="'+id+'"]');
      if(!file||!img)continue;
      const url=await signedAttachmentUrl(file);
      if(url)img.src=url;
    }
  }
}

function mediaBlockField(block,content) {
  const wrap=document.createElement("div");
  wrap.className="category-media-block";

  if(block.type==="image"){
    const file=attachmentById(content.attachment_id);
    const size=block.settings?.size||"medium";
    wrap.classList.add("size-"+size);
    wrap.innerHTML=`
      <div class="category-media-frame">
        <img class="category-media-image" alt="${esc(content.caption||file?.file_name||"Category image")}">
        <div class="category-media-loading"><i data-lucide="image"></i></div>
      </div>
      <div class="category-media-controls">
        <div class="category-media-size">
          <button type="button" data-size="small" class="${size==="small"?"active":""}">S</button>
          <button type="button" data-size="medium" class="${size==="medium"?"active":""}">M</button>
          <button type="button" data-size="full" class="${size==="full"?"active":""}">Full</button>
        </div>
        <span>${esc(file?.file_name||"Image")}</span>
      </div>
      <input class="category-media-caption" type="text" placeholder="Add a caption..." value="${esc(content.caption||"")}">
    `;

    wrap.querySelectorAll("[data-size]").forEach(btn=>btn.addEventListener("click",async()=>{
      block.settings={...(block.settings||{}),size:btn.dataset.size};
      await updateCategoryBlock(block,{settings:block.settings});
      renderCategoryBlocks();
    }));

    let timer;
    wrap.querySelector(".category-media-caption").addEventListener("input",e=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        content={...content,caption:e.target.value};
        updateCategoryBlock(block,{content});
      },350);
    });
    return wrap;
  }

  if(block.type==="gallery"){
    const ids=Array.isArray(content.attachment_ids)?content.attachment_ids:[];
    const columns=Number(block.settings?.columns)||2;
    wrap.innerHTML=`
      <div class="category-gallery-grid columns-${columns}">
        ${ids.map(id=>{
          const file=attachmentById(id);
          return '<div class="category-gallery-item"><img data-attachment-id="'+esc(id)+'" alt="'+esc(file?.file_name||"Gallery image")+'"><span><i data-lucide="image"></i></span></div>';
        }).join("")}
      </div>
      <div class="category-media-controls">
        <div class="category-media-size">
          <button type="button" data-columns="2" class="${columns===2?"active":""}">2</button>
          <button type="button" data-columns="3" class="${columns===3?"active":""}">3</button>
        </div>
        <span>${ids.length} ${ids.length===1?"photo":"photos"}</span>
      </div>
      <input class="category-media-caption" type="text" placeholder="Add a gallery caption..." value="${esc(content.caption||"")}">
    `;

    wrap.querySelectorAll("[data-columns]").forEach(btn=>btn.addEventListener("click",async()=>{
      block.settings={...(block.settings||{}),columns:Number(btn.dataset.columns)};
      await updateCategoryBlock(block,{settings:block.settings});
      renderCategoryBlocks();
    }));

    let timer;
    wrap.querySelector(".category-media-caption").addEventListener("input",e=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        content={...content,caption:e.target.value};
        updateCategoryBlock(block,{content});
      },350);
    });
    return wrap;
  }

  if(block.type==="file"){
    const file=attachmentById(content.attachment_id);
    wrap.innerHTML=`
      <button type="button" class="category-file-card">
        <span class="category-file-card-icon"><i data-lucide="${attachmentIcon(file?.mime_type)}"></i></span>
        <span class="category-file-card-copy">
          <b>${esc(file?.file_name||"Attached file")}</b>
          <small>${esc(formatFileSize(file?.file_size||0))}${file?.mime_type?" · "+esc(file.mime_type):""}</small>
        </span>
        <i data-lucide="external-link"></i>
      </button>
    `;
    wrap.querySelector(".category-file-card").addEventListener("click",()=>file&&openAttachment(file));
    return wrap;
  }

  return wrap;
}

function categoryBlockField(block, content) {
  if(["image","gallery","file"].includes(block.type)){
    return mediaBlockField(block,content);
  }

  if(block.type==="divider"){
    const divider=document.createElement("div");
    divider.className="category-block-divider";
    divider.innerHTML="<hr>";
    return divider;
  }

  if(block.type==="spacer"){
    const spacer=document.createElement("div");
    spacer.className="category-block-spacer";
    spacer.innerHTML='<span>Spacer</span>';
    return spacer;
  }

  const wrap=document.createElement("div");
  wrap.className="category-block-content";

  if(block.type==="checklist"){
    const check=document.createElement("input");
    check.type="checkbox";
    check.className="category-block-check";
    check.checked=!!content.checked;
    check.addEventListener("change",()=>{
      updateCategoryBlock(block,{content:{...content,checked:check.checked}});
      wrap.closest(".category-block")?.classList.toggle("checked",check.checked);
    });
    wrap.appendChild(check);
  }else if(block.type==="bullet"){
    const marker=document.createElement("span");
    marker.className="category-list-marker";
    marker.textContent="•";
    wrap.appendChild(marker);
  }else if(block.type==="numbered"){
    const marker=document.createElement("span");
    marker.className="category-list-marker numbered";
    marker.textContent=categoryNumberForBlock(block)+".";
    wrap.appendChild(marker);
  }

  const field=document.createElement("div");
  field.className="category-block-input";
  field.contentEditable="true";
  field.spellcheck=true;
  field.dataset.placeholder=CATEGORY_BLOCK_TYPES[block.type]?.placeholder||"Write something...";
  field.setAttribute("role","textbox");
  field.setAttribute("aria-multiline","true");
  field.setAttribute("aria-label",CATEGORY_BLOCK_TYPES[block.type]?.label||"Block");

  const initialHtml=content.html
    ? sanitizeRichBlockHtml(content.html)
    : esc(content.text||"").replace(/\n/g,"<br>");
  field.innerHTML=initialHtml;
  wrap.appendChild(field);

  if(block.type==="link"){
    const url=document.createElement("input");
    url.type="url";
    url.className="category-block-link-url";
    url.value=content.url||"";
    url.placeholder="https://...";
    wrap.appendChild(url);

    let urlTimer;
    url.addEventListener("input",()=>{
      clearTimeout(urlTimer);
      urlTimer=setTimeout(()=>{
        content={...content,url:url.value.trim()};
        updateCategoryBlock(block,{content});
      },450);
    });
  }

  let timer;
  const saveRichContent=()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const html=sanitizeRichBlockHtml(field.innerHTML);
      content={...content,text:blockPlainText(field),html};
      updateCategoryBlock(block,{content});
    },350);
  };

  field.addEventListener("input",saveRichContent);

  field.addEventListener("paste",e=>{
    e.preventDefault();
    const text=e.clipboardData?.getData("text/plain")||"";
    document.execCommand("insertText",false,text);
  });

  field.addEventListener("focus",()=>{
    document.querySelectorAll(".category-block-input.rich-active").forEach(x=>x.classList.remove("rich-active"));
    field.classList.add("rich-active");
    positionRichToolbar(field);
  });

  field.addEventListener("blur",hideRichToolbarSoon);

  field.addEventListener("mouseup",()=>setTimeout(()=>positionRichToolbar(field),0));
  field.addEventListener("keyup",()=>setTimeout(()=>positionRichToolbar(field),0));

  field.addEventListener("keydown",e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){
      e.preventDefault();
      createCategoryBlock("paragraph",block.id);
    }
  });

  return wrap;
}


function isConvertibleCategoryBlock(type) {
  return ["paragraph","heading1","heading2","heading3","bullet","numbered","checklist","quote","callout","link","code"].includes(type);
}

async function persistCategoryBlockOrder(rows) {
  rows.forEach((row,index)=>row.position=index);
  saveOfflineCache();

  for(const row of rows){
    const result=await commitMutation({
      table:"category_blocks",
      action:"update",
      payload:{position:row.position},
      match:{id:row.id}
    },[row]);
    if(result.error){
      toast(result.error.message,true);
      break;
    }
  }
  updateCategoryDocumentMeta();
}

async function moveCategoryBlock(block,direction) {
  const rows=blocksForActiveCategory();
  const index=rows.findIndex(x=>x.id===block.id);
  const nextIndex=index+direction;
  if(index<0||nextIndex<0||nextIndex>=rows.length)return;
  const [moved]=rows.splice(index,1);
  rows.splice(nextIndex,0,moved);
  await persistCategoryBlockOrder(rows);
  renderCategoryBlocks();
  setTimeout(()=>document.querySelector('[data-block-id="'+block.id+'"]')?.scrollIntoView({block:"nearest"}),20);
}

async function moveCategoryBlockTo(block,targetBlock,before=true) {
  if(!block||!targetBlock||block.id===targetBlock.id)return;
  const rows=blocksForActiveCategory();
  const from=rows.findIndex(x=>x.id===block.id);
  if(from<0)return;
  const [moved]=rows.splice(from,1);
  let target=rows.findIndex(x=>x.id===targetBlock.id);
  if(target<0)return;
  if(!before)target+=1;
  rows.splice(target,0,moved);
  await persistCategoryBlockOrder(rows);
  renderCategoryBlocks();
}

async function duplicateCategoryBlock(block) {
  const rows=blocksForActiveCategory();
  const index=rows.findIndex(x=>x.id===block.id);
  if(index<0)return;

  const clone={
    id:crypto.randomUUID(),
    user_id:currentUser.id,
    category:activeCategory,
    type:block.type,
    content:structuredClone(normalizeBlockContent(block)),
    settings:structuredClone(block.settings||{}),
    position:index+1,
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };

  rows.splice(index+1,0,clone);
  state.categoryBlocks=state.categoryBlocks.filter(x=>x.category!==activeCategory).concat(rows);
  saveOfflineCache();

  const result=await commitMutation({
    table:"category_blocks",
    action:"insert",
    payload:clone
  },[clone]);

  if(result.error){
    state.categoryBlocks=state.categoryBlocks.filter(x=>x.id!==clone.id);
    saveOfflineCache();
    return toast(result.error.message,true);
  }
  if(result.data?.[0])Object.assign(clone,result.data[0]);

  await persistCategoryBlockOrder(rows);
  renderCategoryBlocks();
  toast("Block duplicated");
}

async function convertCategoryBlock(block,nextType) {
  if(!isConvertibleCategoryBlock(block.type)||!isConvertibleCategoryBlock(nextType))return;
  const content=normalizeBlockContent(block);
  const nextContent={...content};

  if(nextType==="checklist" && nextContent.checked===undefined)nextContent.checked=false;
  if(nextType!=="checklist")delete nextContent.checked;
  if(nextType!=="link")delete nextContent.url;

  block.type=nextType;
  block.content=nextContent;
  await updateCategoryBlock(block,{type:nextType,content:nextContent});
  renderCategoryBlocks();
  setTimeout(()=>document.querySelector('[data-block-id="'+block.id+'"] .category-block-input')?.focus(),30);
}

function closeCategoryBlockMenus(except=null) {
  document.querySelectorAll(".category-block-action-menu").forEach(menu=>{
    if(menu!==except)menu.classList.add("hidden");
  });
}

function categoryBlockActionMenu(block,index,total) {
  const menu=document.createElement("div");
  menu.className="category-block-action-menu hidden";

  const convertItems=isConvertibleCategoryBlock(block.type)
    ? Object.entries(CATEGORY_BLOCK_TYPES)
        .filter(([type])=>isConvertibleCategoryBlock(type)&&type!==block.type)
        .map(([type,meta])=>'<button type="button" data-convert="'+type+'"><i data-lucide="'+meta.icon+'"></i><span>'+esc(meta.label)+'</span></button>')
        .join("")
    : "";

  menu.innerHTML=`
    <button type="button" data-action="up" ${index===0?"disabled":""}><i data-lucide="arrow-up"></i><span>Move up</span></button>
    <button type="button" data-action="down" ${index===total-1?"disabled":""}><i data-lucide="arrow-down"></i><span>Move down</span></button>
    <button type="button" data-action="duplicate"><i data-lucide="copy"></i><span>Duplicate</span></button>
    ${convertItems ? '<div class="category-block-menu-separator"></div><div class="category-block-convert-label">Turn into</div><div class="category-block-convert-list">'+convertItems+'</div>' : ""}
    <div class="category-block-menu-separator"></div>
    <button type="button" data-action="delete" class="danger"><i data-lucide="trash-2"></i><span>Delete</span></button>
  `;

  menu.addEventListener("click",async e=>{
    const button=e.target.closest("button");
    if(!button||button.disabled)return;
    menu.classList.add("hidden");

    if(button.dataset.action==="up")return moveCategoryBlock(block,-1);
    if(button.dataset.action==="down")return moveCategoryBlock(block,1);
    if(button.dataset.action==="duplicate")return duplicateCategoryBlock(block);
    if(button.dataset.action==="delete"){
      if(confirm("Delete this block?"))return deleteCategoryBlock(block);
      return;
    }
    if(button.dataset.convert)return convertCategoryBlock(block,button.dataset.convert);
  });

  return menu;
}

document.addEventListener("click",e=>{
  if(!e.target.closest(".category-block-actions")){
    closeCategoryBlockMenus();
  }
});


function renderCategoryBlocks() {
  const canvas=document.getElementById("categoryBlockCanvas");
  const empty=document.getElementById("categoryBlockEmpty");
  const count=document.getElementById("categoryBlockCount");
  if(!canvas)return;

  canvas.innerHTML="";

  if(!categoryBlocksAvailable){
    empty?.classList.remove("hidden");
    if(empty){
      empty.innerHTML='<div class="category-block-empty-icon"><i data-lucide="database"></i></div><b>Block editor needs setup</b><span>Run the Batch 2 SQL in Supabase, then refresh K22.</span>';
    }
    if(count)count.textContent="Setup needed";
    bindCategoryBlockMenu();
    icons();
    return;
  }

  const rows=blocksForActiveCategory();
  empty?.classList.toggle("hidden",rows.length>0);
  if(count)count.textContent=rows.length+" "+(rows.length===1?"block":"blocks");

  rows.forEach((block,index)=>{
    const type=CATEGORY_BLOCK_TYPES[block.type]||CATEGORY_BLOCK_TYPES.paragraph;
    const content=normalizeBlockContent(block);
    const row=document.createElement("div");
    row.className="category-block category-block-"+block.type+(content.checked?" checked":"");
    row.dataset.blockId=block.id;
    row.draggable=true;

    const rail=document.createElement("div");
    rail.className="category-block-rail category-block-actions";
    rail.innerHTML=
      '<button type="button" class="category-block-drag" aria-label="Drag block" title="Drag to reorder"><i data-lucide="grip-vertical"></i></button>'+
      '<button type="button" class="category-block-more" aria-label="Block options"><i data-lucide="ellipsis"></i></button>';

    const actionMenu=categoryBlockActionMenu(block,index,rows.length);
    rail.appendChild(actionMenu);

    const field=categoryBlockField(block,content);
    row.appendChild(rail);
    row.appendChild(field);

    rail.querySelector(".category-block-more").addEventListener("click",e=>{
      e.stopPropagation();
      const wasHidden=actionMenu.classList.contains("hidden");
      closeCategoryBlockMenus(actionMenu);
      actionMenu.classList.toggle("hidden",!wasHidden);
      icons();
    });

    row.addEventListener("dragstart",e=>{
      if(window.matchMedia("(max-width: 650px)").matches){
        e.preventDefault();
        return;
      }
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed="move";
      e.dataTransfer.setData("text/plain",block.id);
    });

    row.addEventListener("dragend",()=>{
      row.classList.remove("dragging");
      canvas.querySelectorAll(".drag-over-before,.drag-over-after").forEach(x=>x.classList.remove("drag-over-before","drag-over-after"));
    });

    row.addEventListener("dragover",e=>{
      if(window.matchMedia("(max-width: 650px)").matches)return;
      e.preventDefault();
      if(!e.dataTransfer.types.includes("text/plain"))return;
      const rect=row.getBoundingClientRect();
      const before=e.clientY<rect.top+rect.height/2;
      row.classList.toggle("drag-over-before",before);
      row.classList.toggle("drag-over-after",!before);
      e.dataTransfer.dropEffect="move";
    });

    row.addEventListener("dragleave",()=>{
      row.classList.remove("drag-over-before","drag-over-after");
    });

    row.addEventListener("drop",async e=>{
      if(window.matchMedia("(max-width: 650px)").matches)return;
      e.preventDefault();
      const draggedId=e.dataTransfer.getData("text/plain");
      const dragged=rows.find(x=>x.id===draggedId);
      if(!dragged||dragged.id===block.id)return;
      const rect=row.getBoundingClientRect();
      const before=e.clientY<rect.top+rect.height/2;
      await moveCategoryBlockTo(dragged,block,before);
    });

    canvas.appendChild(row);
    if(["image","gallery"].includes(block.type)){
      hydrateMediaBlock(block,row);
    }
  });

  bindCategoryBlockMenu();
  icons();
}

function bindCategoryBlockMenu() {
  const add=document.getElementById("addCategoryBlockBtn");
  const menu=document.getElementById("categoryBlockMenu");
  if(!add||!menu)return;

  if(!add.dataset.bound){
    add.dataset.bound="1";
    add.addEventListener("click",()=>{
      menu.classList.toggle("hidden");
      icons();
    });
  }

  menu.querySelectorAll("[data-media-block]").forEach(btn=>{
    if(btn.dataset.bound)return;
    btn.dataset.bound="1";
    btn.addEventListener("click",async()=>{
      menu.classList.add("hidden");
      await createMediaBlock(btn.dataset.mediaBlock);
    });
  });

  menu.querySelectorAll("[data-block-type]").forEach(btn=>{
    if(btn.dataset.bound)return;
    btn.dataset.bound="1";
    btn.addEventListener("click",async()=>{
      menu.classList.add("hidden");
      await createCategoryBlock(btn.dataset.blockType);
    });
  });
}

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
    card.addEventListener("click",()=> {
      location.href=categoryPageUrl(card.dataset.card);
    });
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

function openCategory(category, options={}) {
  if(!CATEGORY_PAGE_META[category])return;

  if(document.body.dataset.page!=="category"){
    location.href=categoryPageUrl(category);
    return;
  }

  activeCategory=category;
  editingCategoryItemId=null;

  const wantedUrl=categoryPageUrl(category);
  if(!options.replaceUrl && !location.href.endsWith(wantedUrl)){
    history.pushState({category},"",wantedUrl);
  }else if(options.replaceUrl){
    history.replaceState({category},"",wantedUrl);
  }

  updateCategoryDocumentMeta();
  renderCategoryAttachments();

  migrateCategoryLegacyToBlocks(category).then(()=>{
    renderCategoryBlocks();
    updateCategoryDocumentMeta();
  });

  renderCategoryBlocks();
}

window.addEventListener("popstate",()=>{
  if(document.body.dataset.page!=="category")return;
  const category=new URLSearchParams(location.search).get("name");
  if(category&&CATEGORY_PAGE_META[category])openCategory(category,{replaceUrl:true});
});

function closeCategory() {
  if(document.body.dataset.page==="category"){
    location.href="categories.html";
    return;
  }
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
  updateCategoryDocumentMeta();
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
  updateCategoryDocumentMeta();
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

async function uploadAttachment(file, ownerType, ownerKey, options={}) {
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
  if(!options.quiet)toast("File uploaded");
  return data;
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
  updateCategoryDocumentMeta();
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
        detail:"Category item",page:"category.html",action:"category-item",id:item.id,category:item.category
      });
    }
  });

  (state.categoryBlocks||[]).forEach(block=>{
    const content=normalizeBlockContent(block);
    const mediaNames=[
      content.attachment_id ? attachmentById(content.attachment_id)?.file_name : "",
      ...(Array.isArray(content.attachment_ids)?content.attachment_ids.map(id=>attachmentById(id)?.file_name||"") : [])
    ];
    const hay=[block.category,content.text,content.url,content.caption,...mediaNames].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q) && (content.text||content.url)){
      results.push({
        type:block.category,icon:CATEGORY_BLOCK_TYPES[block.type]?.icon||"blocks",
        title:content.text||content.caption||mediaNames.filter(Boolean).join(", ")||content.url||CATEGORY_BLOCK_TYPES[block.type]?.label||"Block",
        detail:(CATEGORY_BLOCK_TYPES[block.type]?.label||"Block")+" · Category page",
        page:"category.html",action:"category-block",id:block.id,category:block.category
      });
    }
  });

  state.categoryNotes.forEach(note=>{
    const hay=[note.category,note.notes].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:note.category,icon:"notebook-tabs",title:note.category+" notes",
        detail:(note.notes||"").slice(0,90),page:"category.html",action:"category",category:note.category
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
        detail:"Open category",page:"category.html",action:"category",category
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
        location.href=(result.page==="category.html"&&result.category)
          ? categoryPageUrl(result.category)
          : result.page;
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

  if(result.action==="category"||result.action==="category-item"||result.action==="category-block"){
    openCategory(result.category);
    if(result.action==="category-block"&&result.id){
      setTimeout(()=>{
        const el=document.querySelector('[data-block-id="'+result.id+'"]');
        el?.scrollIntoView({behavior:"smooth",block:"center"});
        el?.classList.add("search-jump-highlight");
        setTimeout(()=>el?.classList.remove("search-jump-highlight"),1800);
        el?.querySelector(".category-block-input")?.focus();
      },120);
    }
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




function securityDate(value) {
  if(!value)return "Not available";
  try{return new Date(value).toLocaleString();}catch{return String(value);}
}

function deviceDescription() {
  const platform=navigator.userAgentData?.platform || navigator.platform || "This device";
  return platform+" · "+USER_TIMEZONE;
}

function appLockKey() {
  return currentUser ? "k22AppLock:"+currentUser.id : null;
}

async function hashPin(pin) {
  const data=new TextEncoder().encode(pin);
  const hash=await crypto.subtle.digest("SHA-256",data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function appLockEnabled() {
  const key=appLockKey();
  return !!(key && localStorage.getItem(key));
}

async function setAppLockPin(pin) {
  if(!/^\d{4,8}$/.test(pin))throw new Error("Use a 4–8 digit PIN.");
  localStorage.setItem(appLockKey(),await hashPin(pin));
  sessionStorage.setItem("k22Unlocked:"+currentUser.id,"1");
}

function disableAppLock() {
  const key=appLockKey();
  if(key)localStorage.removeItem(key);
  if(currentUser)sessionStorage.removeItem("k22Unlocked:"+currentUser.id);
  document.getElementById("appLockGate")?.remove();
}

function lockApp() {
  if(!currentUser || !appLockEnabled())return;
  sessionStorage.removeItem("k22Unlocked:"+currentUser.id);
  showAppLockGate();
}

function showAppLockGate() {
  if(!currentUser || !appLockEnabled())return;
  if(sessionStorage.getItem("k22Unlocked:"+currentUser.id)==="1")return;
  if(document.getElementById("appLockGate"))return;

  const gate=document.createElement("div");
  gate.id="appLockGate";
  gate.className="app-lock-gate";
  gate.innerHTML=`
    <div class="app-lock-card">
      <div class="app-lock-icon"><i data-lucide="lock-keyhole"></i></div>
      <h2>K22 is locked</h2>
      <p>Enter this device’s PIN to continue.</p>
      <form id="appLockForm">
        <input id="appLockPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="PIN" required>
        <button type="submit">Unlock</button>
      </form>
      <div class="app-lock-message" id="appLockMessage"></div>
      <button class="app-lock-signout" id="appLockSignOut" type="button">Sign out instead</button>
    </div>`;
  document.body.appendChild(gate);

  document.getElementById("appLockForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const pin=document.getElementById("appLockPin").value;
    const expected=localStorage.getItem(appLockKey());
    if(await hashPin(pin)!==expected){
      document.getElementById("appLockMessage").textContent="Incorrect PIN.";
      document.getElementById("appLockPin").value="";
      return;
    }
    sessionStorage.setItem("k22Unlocked:"+currentUser.id,"1");
    gate.remove();
  });

  document.getElementById("appLockSignOut").addEventListener("click",async()=>{
    await db.auth.signOut();
  });
  setTimeout(()=>document.getElementById("appLockPin")?.focus(),50);
  icons();
}

async function openAccountSecurity() {
  document.getElementById("profilePopover")?.remove();
  if(!currentUser)return;

  let backdrop=document.getElementById("accountSecurityBackdrop");
  if(backdrop)backdrop.remove();

  backdrop=document.createElement("div");
  backdrop.id="accountSecurityBackdrop";
  backdrop.className="event-modal-backdrop";
  const verified=!!currentUser.email_confirmed_at;
  backdrop.innerHTML=`
    <div class="event-modal account-security-modal">
      <div class="event-modal-head">
        <div>
          <small>K22 Account</small>
          <h2>Account & Security</h2>
        </div>
        <button class="modal-close" id="closeAccountSecurity" aria-label="Close"><i data-lucide="x"></i></button>
      </div>

      <div class="security-sections">
        <section class="security-card">
          <div class="security-card-head">
            <span class="security-icon"><i data-lucide="mail-check"></i></span>
            <div><h3>Email</h3><p>${esc(currentUser.email||"")}</p></div>
            <span class="security-badge ${verified?"verified":"warning"}">${verified?"Verified":"Not verified"}</span>
          </div>
          ${verified ? "" : '<div class="security-inline-status">This account must be activated by the K22 administrator.</div>'}
        </section>

        <section class="security-card">
          <div class="security-card-head">
            <span class="security-icon"><i data-lucide="key-round"></i></span>
            <div><h3>Password</h3><p>Use 8+ characters with a capital, lowercase, number, and symbol.</p></div>
          </div>
          <div class="security-password-form">
            <input id="newAccountPassword" type="password" autocomplete="new-password" placeholder="New password">
            <button class="soft-btn" id="changePasswordBtn">Change Password</button>
          </div>
          <div class="security-inline-status" id="passwordSecurityStatus"></div>
        </section>

        <section class="security-card">
          <div class="security-card-head">
            <span class="security-icon"><i data-lucide="monitor-smartphone"></i></span>
            <div><h3>Current Session</h3><p>${esc(deviceDescription())}</p></div>
          </div>
          <div class="security-session-grid">
            <span><small>Last sign in</small><b>${esc(securityDate(currentUser.last_sign_in_at))}</b></span>
            <span><small>Account created</small><b>${esc(securityDate(currentUser.created_at))}</b></span>
          </div>
          <button class="soft-btn danger-soft security-action" id="signOutEverywhereBtn"><i data-lucide="log-out"></i> Sign Out All Sessions</button>
        </section>

        <section class="security-card">
          <div class="security-card-head">
            <span class="security-icon"><i data-lucide="lock-keyhole"></i></span>
            <div><h3>Device App Lock</h3><p>Optional local PIN for this browser/device. This is a screen lock, not encryption.</p></div>
            <span class="security-badge ${appLockEnabled()?"verified":""}">${appLockEnabled()?"On":"Off"}</span>
          </div>
          <div class="security-lock-controls">
            <input id="newAppLockPin" type="password" inputmode="numeric" maxlength="8" placeholder="4–8 digit PIN">
            <button class="soft-btn" id="saveAppLockBtn">${appLockEnabled()?"Change PIN":"Enable Lock"}</button>
            ${appLockEnabled()?'<button class="soft-btn" id="lockNowBtn">Lock Now</button><button class="soft-btn danger-soft" id="disableAppLockBtn">Turn Off</button>':""}
          </div>
          <div class="security-inline-status" id="appLockStatus"></div>
        </section>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const close=()=>{backdrop.remove();document.body.classList.remove("modal-open");};
  document.getElementById("closeAccountSecurity")?.addEventListener("click",close);
  backdrop.addEventListener("click",e=>{if(e.target===backdrop)close();});

  document.getElementById("resendVerifyBtn")?.addEventListener("click",async()=>{
    const {error}=await db.auth.resend({type:"signup",email:currentUser.email});
    if(error)return toast(error.message,true);
    toast("Verification email sent");
  });

  document.getElementById("emailResetBtn")?.addEventListener("click",async()=>{
    const {error}=await db.auth.resetPasswordForEmail(currentUser.email,{redirectTo:location.origin+location.pathname});
    if(error)return toast(error.message,true);
    document.getElementById("passwordSecurityStatus").textContent="Reset email sent.";
  });

  document.getElementById("changePasswordBtn")?.addEventListener("click",async()=>{
    const password=document.getElementById("newAccountPassword").value;
    const problem=passwordProblem(password);
    if(problem){
      document.getElementById("passwordSecurityStatus").textContent=problem;
      return;
    }
    const {error}=await db.auth.updateUser({password});
    if(error)return document.getElementById("passwordSecurityStatus").textContent=error.message;
    document.getElementById("newAccountPassword").value="";
    document.getElementById("passwordSecurityStatus").textContent="Password changed.";
  });

  document.getElementById("signOutEverywhereBtn")?.addEventListener("click",async()=>{
    if(!confirm("Sign out of K22 on all sessions?"))return;
    const {error}=await db.auth.signOut({scope:"global"});
    if(error)return toast(error.message,true);
  });

  document.getElementById("saveAppLockBtn")?.addEventListener("click",async()=>{
    const pin=document.getElementById("newAppLockPin").value;
    try{
      await setAppLockPin(pin);
      document.getElementById("appLockStatus").textContent="Device lock enabled.";
      toast("App lock enabled");
      close();
      openAccountSecurity();
    }catch(error){
      document.getElementById("appLockStatus").textContent=error.message;
    }
  });

  document.getElementById("lockNowBtn")?.addEventListener("click",()=>{
    close();
    lockApp();
  });

  document.getElementById("disableAppLockBtn")?.addEventListener("click",()=>{
    if(!confirm("Turn off the device app lock?"))return;
    disableAppLock();
    toast("App lock turned off");
    close();
    openAccountSecurity();
  });

  icons();
}

function showPasswordRecovery() {
  let gate=document.getElementById("passwordRecoveryGate");
  if(gate)return;
  gate=document.createElement("div");
  gate.id="passwordRecoveryGate";
  gate.className="auth-gate";
  gate.innerHTML=`
    <div class="auth-card">
      <div class="auth-brand-icon"><i data-lucide="key-round"></i></div>
      <h1>Choose a new password</h1>
      <p>Your reset link is valid. Set your new K22 password below.</p>
      <form class="auth-form" id="passwordRecoveryForm">
        <label>New Password
          <input id="recoveryPassword" type="password" autocomplete="new-password" minlength="8" required>
        </label>
        <div class="password-rules">8+ characters · capital · lowercase · number · symbol</div>
        <button class="auth-submit" type="submit">Update Password</button>
      </form>
      <div class="auth-message" id="recoveryMessage"></div>
    </div>`;
  document.body.appendChild(gate);

  document.getElementById("passwordRecoveryForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const password=document.getElementById("recoveryPassword").value;
    const problem=passwordProblem(password);
    if(problem){
      document.getElementById("recoveryMessage").textContent=problem;
      document.getElementById("recoveryMessage").classList.add("error");
      return;
    }
    const {error}=await db.auth.updateUser({password});
    if(error){
      document.getElementById("recoveryMessage").textContent=error.message;
      document.getElementById("recoveryMessage").classList.add("error");
      return;
    }
    gate.remove();
    toast("Password updated");
  });
  icons();
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
      category_blocks:state.categoryBlocks||[],
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
  if(type==="category-blocks") return (state.categoryBlocks||[]).map(x=>({...x,content:JSON.stringify(x.content||{}),settings:JSON.stringify(x.settings||{})}));
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
                <option value="category-blocks">Category Blocks</option>
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
    category_blocks:["id","category","type","content","settings","position","created_at","updated_at"],
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
    restored+=await restoreRows("category_blocks",cleanRestoreRows(d.category_blocks,"category_blocks"));
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
        <button id="accountSecurityBtn"><i data-lucide="shield-check"></i> Account & Security</button>
        <button id="backupK22Btn"><i data-lucide="database-backup"></i> Backup & Export</button>
        ${isStandaloneApp() ? "" : '<button id="installK22Btn"><i data-lucide="download"></i> Install K22 App</button>'}
        <button class="signout-btn" id="signOutBtn"><i data-lucide="log-out"></i> Sign Out</button>`;
      document.body.appendChild(p);
      document.getElementById("accountSecurityBtn")?.addEventListener("click",openAccountSecurity);
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
    .on("postgres_changes",{event:"*",schema:"public",table:"category_blocks"},()=>loadAll())
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
  showAppLockGate();
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
  if(e.key==="Escape"){closeCategory();closeEventModal();closeRoutineModal();closeTaskModal();closeBackupManager();document.getElementById("accountSecurityBackdrop")?.remove();document.body.classList.remove("modal-open");document.getElementById("profilePopover")?.remove();}
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
  db.auth.onAuthStateChange((event, nextSession) => {
    setTimeout(() => handleSession(nextSession), 0);
  });
  icons();
})();


let k22HiddenAt = null;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    k22HiddenAt = Date.now();
    return;
  }
  if (k22HiddenAt && Date.now()-k22HiddenAt > 5*60*1000 && appLockEnabled()) {
    lockApp();
  }
  k22HiddenAt = null;
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
