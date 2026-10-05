// K22 — Main / shared app core
// Keep this file loaded by every HTML page. It loads the separated page files.

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
  categoryPages: [],
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
  const user_id=currentUser?.id||null;

  // Coalesce repeated offline autosaves for the same category block.
  // This keeps rapid typing from producing a long queue of stale updates.
  if(
    mutation.table==="category_blocks" &&
    mutation.action==="update" &&
    mutation.match?.id
  ){
    const existing=[...queue].reverse().find(item=>
      item.user_id===user_id &&
      item.table==="category_blocks" &&
      item.action==="update" &&
      item.match?.id===mutation.match.id
    );

    if(existing){
      existing.payload={...(existing.payload||{}),...(mutation.payload||{})};
      existing.created_at=Date.now();
      saveOfflineQueue(queue);
      saveOfflineCache();
      return;
    }
  }

  queue.push({
    queue_id: crypto.randomUUID(),
    user_id,
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
    const [tasks, events, notes, categoryItems, categoryNotes, categoryPages, categoryBlocks, routine, attachments, settingsRows] = await Promise.all([
      safe(db.from("tasks").select("*").order("position").order("created_at")),
      safe(db.from("calendar_events").select("*").order("event_date").order("event_time")),
      safe(db.from("notes").select("*").order("updated_at", { ascending: false })),
      safe(db.from("category_items").select("*").order("position").order("created_at")),
      safe(db.from("category_notes").select("*")),
      safeOptional(db.from("category_pages").select("*").order("position").order("created_at")),
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
    state.categoryPages = categoryPages || [];
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

  if (typeof renderTodoHub === "function") renderTodoHub();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof renderAgenda === "function") renderAgenda();
  if (typeof bindEventModal === "function") bindEventModal();
  if (typeof renderHomeCalendar === "function") renderHomeCalendar();
  if (typeof renderHomeEvents === "function") renderHomeEvents();
  if (typeof renderSmartHome === "function") renderSmartHome();
  if (typeof renderRoutine === "function") renderRoutine();
  if (typeof renderFocus === "function") renderFocus();
  if (typeof renderNotesPage === "function") renderNotesPage();
  if (typeof setupCategoryPage === "function") setupCategoryPage();
  if (typeof renderCategoryBlocks === "function") renderCategoryBlocks();
  if (typeof bindAttachmentInputs === "function") bindAttachmentInputs();
  if (typeof renderNoteAttachments === "function") renderNoteAttachments();
  if (typeof bindCategoryCards === "function") bindCategoryCards();
  if (typeof bindSearch === "function") bindSearch();
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
    swRegistration = await navigator.serviceWorker.register("../sw.js");

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
        <a href="../categories/categories.html"><i data-lucide="layout-grid"></i> Open Categories</a>
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

function categoryEditorHasActiveInput() {
  const active = document.activeElement;
  if (!active) return false;
  return !!(
    active.closest?.(".category-block") ||
    active.classList?.contains("category-block-input") ||
    active.classList?.contains("category-column-editor") ||
    active.classList?.contains("category-section-title-input") ||
    active.classList?.contains("category-media-caption") ||
    active.classList?.contains("category-block-link-url")
  );
}

function activeCategoryEditorBlockId() {
  return document.activeElement?.closest?.("[data-block-id]")?.dataset?.blockId||null;
}

let deferredRealtimeRefresh=false;

function requestGeneralRealtimeRefresh() {
  if(categoryEditorHasActiveInput()){
    deferredRealtimeRefresh=true;
    return;
  }
  loadAll();
}

document.addEventListener("focusout",()=>{
  setTimeout(()=>{
    if(!deferredRealtimeRefresh || categoryEditorHasActiveInput())return;
    deferredRealtimeRefresh=false;
    loadAll();
  },60);
});

function handleCategoryBlockRealtime(payload) {
  const next = payload?.new && Object.keys(payload.new).length ? payload.new : null;
  const previous = payload?.old && Object.keys(payload.old).length ? payload.old : null;
  const row = next || previous;
  if (!row || (row.user_id && currentUser && row.user_id !== currentUser.id)) return;

  if (payload.eventType === "DELETE") {
    state.categoryBlocks = (state.categoryBlocks || []).filter(x => x.id !== previous?.id);
  } else if (next) {
    const index = (state.categoryBlocks || []).findIndex(x => x.id === next.id);
    const local=index>=0?state.categoryBlocks[index]:null;
    const locallySaving=
      typeof categoryBlockHasPendingSave==="function" &&
      categoryBlockHasPendingSave(next.id);
    const activelyEditing=activeCategoryEditorBlockId()===next.id;
    const localTime=Date.parse(local?.updated_at||0)||0;
    const remoteTime=Date.parse(next.updated_at||0)||0;

    // Never let an older realtime echo replace text that is still being
    // typed/saved locally. Newer remote changes can reconcile once idle.
    if(!locallySaving && !activelyEditing && remoteTime>=localTime){
      if(index>=0)state.categoryBlocks[index]={...local,...next};
      else state.categoryBlocks.push(next);
    }else if(index<0 && !locallySaving){
      state.categoryBlocks.push(next);
    }
  }

  saveOfflineCache();

  const isCurrentCategory =
    document.body.dataset.page === "category" &&
    typeof activeCategory !== "undefined" &&
    activeCategory === row.category;

  // Do not rebuild a contenteditable block while the user is typing.
  if (isCurrentCategory && !categoryEditorHasActiveInput()) {
    renderCategoryBlocks();
  }
  if (isCurrentCategory) updateCategoryDocumentMeta();
}

function startRealtime() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  realtimeChannel = db.channel("k22-sync")
    .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"calendar_events"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"notes"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"category_items"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"category_notes"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"category_pages"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"category_blocks"},handleCategoryBlockRealtime)
    .on("postgres_changes",{event:"*",schema:"public",table:"routine_items"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"attachments"},requestGeneralRealtimeRefresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"user_settings"},requestGeneralRealtimeRefresh)
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
  if(e.key==="Escape"){
    if(typeof closeCategory==="function")closeCategory();
    if(typeof closeEventModal==="function")closeEventModal();
    if(typeof closeRoutineModal==="function")closeRoutineModal();
    if(typeof closeTaskModal==="function")closeTaskModal();
    closeBackupManager();
    document.getElementById("accountSecurityBackdrop")?.remove();
    document.body.classList.remove("modal-open");
    document.getElementById("profilePopover")?.remove();
  }
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

async function initK22(){
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
}


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
    if(typeof renderHomeCalendar==="function")renderHomeCalendar();
    if(typeof renderHomeEvents==="function")renderHomeEvents();
    if(typeof renderSmartHome==="function")renderSmartHome();
    if (document.querySelector(".full-calendar-grid") && typeof renderCalendar==="function") {
      const d = localDateObject();
      if (typeof selectedDate!=="undefined" && selectedDate === todayISO() && typeof calendarCursor!=="undefined") {
        calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      renderCalendar();
    }
  }
});

setInterval(() => {
  updateDynamicDateUI();
  if(typeof renderHomeEvents==="function")renderHomeEvents();
  if(typeof renderSmartHome==="function")renderSmartHome();
}, 60000);

(async function bootK22App() {
  try {
    await initK22();
  } catch (error) {
    console.error("K22 startup failed:", error);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div style="position:fixed;inset:20px;z-index:99999;background:#fff;padding:20px;border-radius:14px;box-shadow:0 10px 40px #0002;font:14px sans-serif">K22 could not finish loading. Refresh the page and check the console if this continues.</div>'
    );
  }
})();
