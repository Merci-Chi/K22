const SUPABASE_URL = "https://gifizpabjfrymfobqore.supabase.co";
const SUPABASE_KEY = "sb_publishable_xlUJnJCGhWi6s1zaF-gY2w_9gEeLZm3";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let currentUser = null;
let realtimeChannel = null;
let state = {
  tasks: [],
  events: [],
  notes: [],
  categoryItems: [],
  categoryNotes: [],
  routine: [],
  settings: null
};

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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
    setSyncStatus("Synced");
  } catch (error) {
    console.error(error);
    setSyncStatus("Sync error", true);
    toast(error.message || "Could not sync", true);
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
  if (state.routine.length || !document.querySelector(".routine-list")) return;
  const labels = [...document.querySelectorAll(".routine-list label span")].map(x => x.textContent.trim());
  if (!labels.length) return;
  const rows = labels.map((label, i) => ({ user_id: currentUser.id, label, done: false, position: i }));
  const { error } = await db.from("routine_items").insert(rows);
  if (!error) state.routine = await safe(db.from("routine_items").select("*").order("position"));
}

function renderEverything() {
  renderTaskSection("homeTodoList","homeTodoForm","homeTodoInput","clearCompleted","home");
  renderTaskSection("todayPageTasks","todayTaskForm","todayTaskInput","todayClearDone","today");
  renderCalendar();
  renderAgenda();
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
      const { error } = await db.from("tasks").update({ done: task.done }).eq("id", task.id);
      if (error) toast(error.message, true);
    });
    row.querySelector(".task-delete").addEventListener("click", async () => {
      const { error } = await db.from("tasks").delete().eq("id", task.id);
      if (error) return toast(error.message, true);
      state.tasks = state.tasks.filter(x => x.id !== task.id);
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
      const { data, error } = await db.from("tasks").insert({
        user_id: currentUser.id, scope, text, done: false, position
      }).select().single();
      if (error) return toast(error.message, true);
      state.tasks.push(data);
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
      const { error } = await db.from("tasks").delete().in("id", ids);
      if (error) return toast(error.message, true);
      state.tasks = state.tasks.filter(x => !ids.includes(x.id));
      renderTaskSection(listId, formId, inputId, clearId, scope);
      toast("Completed tasks cleared");
    });
  }
  icons();
}

let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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
    btn.addEventListener("dblclick", () => addEvent(ds));
    grid.appendChild(btn);
  }

  const buttons = [...document.querySelectorAll(".calendar-toolbar .soft-btn")];
  if (buttons.length === 3 && !buttons[0].dataset.bound) {
    buttons.forEach(x => x.dataset.bound = "1");
    buttons[0].addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth()-1); renderCalendar(); });
    buttons[1].addEventListener("click", () => { const n=new Date(); calendarCursor=new Date(n.getFullYear(),n.getMonth(),1); selectedDate=todayISO(); renderCalendar(); });
    buttons[2].addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth()+1); renderCalendar(); });
  }

  const add = document.getElementById("addEventBtn");
  if (add && !add.dataset.bound) {
    add.dataset.bound = "1";
    add.addEventListener("click", () => addEvent(selectedDate));
  }
}

async function addEvent(date) {
  const title = prompt("Event name:");
  if (!title) return;
  const timeInput = prompt("Time (optional):", "3:00 PM") || "";
  const event_time = normalizeTime(timeInput);
  const { data, error } = await db.from("calendar_events").insert({
    user_id: currentUser.id,
    title: title.trim(),
    event_date: date || todayISO(),
    event_time
  }).select().single();
  if (error) return toast(error.message, true);
  state.events.push(data);
  renderCalendar(); renderAgenda(); renderHomeEvents();
  toast("Event added");
}

function renderAgenda() {
  const list = document.getElementById("eventsList");
  if (!list) return;
  list.innerHTML = "";
  const sorted = [...state.events].sort((a,b) => (a.event_date+(a.event_time||"")).localeCompare(b.event_date+(b.event_time||"")));
  if (!sorted.length) {
    list.innerHTML = '<div class="empty-inline">No events yet.</div>';
    return;
  }
  sorted.forEach(ev => {
    const item = document.createElement("div");
    item.className = "agenda-item blue";
    item.innerHTML = `
      <span class="agenda-dot"></span>
      <div class="agenda-copy"><b>${esc(ev.title)}</b><small>${esc(ev.event_date)}${ev.event_time ? " · "+esc(displayTime(ev.event_time)) : ""}</small></div>
      <button class="agenda-delete" aria-label="Delete event"><i data-lucide="trash-2"></i></button>`;
    item.querySelector(".agenda-delete").addEventListener("click", async () => {
      const { error } = await db.from("calendar_events").delete().eq("id", ev.id);
      if (error) return toast(error.message, true);
      state.events = state.events.filter(x => x.id !== ev.id);
      renderAgenda(); renderCalendar(); renderHomeEvents();
    });
    list.appendChild(item);
  });
  icons();
}

function renderHomeCalendar() {
  const panel = document.querySelector(".dashboard-calendar-panel");
  if (!panel) return;
  const now = new Date();
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
    div.innerHTML = `<span>${esc(e.title)}</span><b>${esc(displayTime(e.event_time))}</b>`;
    holder.appendChild(div);
  });
}

function renderRoutine() {
  const boxes = [...document.querySelectorAll(".routine-list input[type=checkbox]")];
  if (!boxes.length) return;
  boxes.forEach((box,i) => {
    const row = state.routine.find(x => x.position === i) || state.routine[i];
    if (!row) return;
    box.checked = !!row.done;
    if (!box.dataset.bound) {
      box.dataset.bound = "1";
      box.addEventListener("change", async () => {
        row.done = box.checked;
        const { error } = await db.from("routine_items").update({ done: row.done }).eq("id", row.id);
        if (error) toast(error.message, true);
      });
    }
  });
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
  const { data, error } = await db.from("user_settings").upsert(row).select().single();
  if (error) return toast(error.message, true);
  state.settings = data;
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
      const { data, error } = await db.from("notes").insert({
        user_id: currentUser.id, title:"Untitled note", body:""
      }).select().single();
      if (error) return toast(error.message, true);
      state.notes.unshift(data);
      activeNoteId = data.id;
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
    const { data, error } = await db.from("notes").update({ title:note.title, body:note.body }).eq("id",note.id).select().single();
    if (error) return toast(error.message, true);
    Object.assign(note, data);
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
      const { error } = await db.from("notes").delete().eq("id",activeNoteId);
      if (error) return toast(error.message,true);
      state.notes = state.notes.filter(x => x.id !== activeNoteId);
      activeNoteId = state.notes[0]?.id || null;
      renderNotesPage();
      toast("Note deleted");
    });
  }
}

let activeCategory = "";
function bindCategoryCards() {
  document.querySelectorAll("[data-card]").forEach(card => {
    if (card.dataset.bound) return;
    card.dataset.bound="1";
    card.addEventListener("click",()=>openCategory(card.dataset.card));
  });
}

function openCategory(category) {
  activeCategory = category;
  const backdrop = document.getElementById("modalBackdrop");
  const title = document.getElementById("modalTitle");
  const notes = document.getElementById("modalNotes");
  if (!backdrop || !title || !notes) return;
  title.textContent = category;
  notes.value = state.categoryNotes.find(x => x.category === category)?.notes || "";
  backdrop.classList.remove("hidden");
  document.body.classList.add("modal-open");
  renderCategoryItems();

  if (!document.getElementById("closeModal").dataset.bound) {
    document.getElementById("closeModal").dataset.bound="1";
    document.getElementById("closeModal").addEventListener("click",closeCategory);
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
      const position=state.categoryItems.filter(x=>x.category===activeCategory).length;
      const {data,error}=await db.from("category_items").insert({
        user_id:currentUser.id,category:activeCategory,text,done:false,position
      }).select().single();
      if(error)return toast(error.message,true);
      state.categoryItems.push(data);
      input.value="";
      renderCategoryItems();
    });
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
    row.className="category-item"+(item.done?" done":"");
    row.innerHTML=`
      <label><input type="checkbox" ${item.done?"checked":""}><span>${esc(item.text)}</span></label>
      <div class="category-item-actions">
        <button class="category-item-edit" aria-label="Edit"><i data-lucide="pencil"></i></button>
        <button class="category-item-delete" aria-label="Delete"><i data-lucide="trash-2"></i></button>
      </div>`;
    row.querySelector("input").addEventListener("change",async e=>{
      item.done=e.target.checked;
      row.classList.toggle("done",item.done);
      const {error}=await db.from("category_items").update({done:item.done}).eq("id",item.id);
      if(error)toast(error.message,true);
    });
    row.querySelector(".category-item-edit").addEventListener("click",async()=>{
      const next=prompt("Edit item:",item.text);
      if(next===null||!next.trim())return;
      const {data,error}=await db.from("category_items").update({text:next.trim()}).eq("id",item.id).select().single();
      if(error)return toast(error.message,true);
      Object.assign(item,data);renderCategoryItems();
    });
    row.querySelector(".category-item-delete").addEventListener("click",async()=>{
      const {error}=await db.from("category_items").delete().eq("id",item.id);
      if(error)return toast(error.message,true);
      state.categoryItems=state.categoryItems.filter(x=>x.id!==item.id);
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
  const {data,error}=await db.from("category_notes").upsert(row,{onConflict:"user_id,category"}).select().single();
  if(error)return toast(error.message,true);
  const idx=state.categoryNotes.findIndex(x=>x.category===activeCategory);
  if(idx>=0)state.categoryNotes[idx]=data;else state.categoryNotes.push(data);
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
        <button class="signout-btn" id="signOutBtn"><i data-lucide="log-out"></i> Sign Out</button>`;
      document.body.appendChild(p);
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
  await loadAll();
  startRealtime();
}

document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){closeCategory();document.getElementById("profilePopover")?.remove();}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="s"&&document.getElementById("saveNoteBtn")){
    e.preventDefault();document.getElementById("saveNoteBtn").click();
  }
});

window.addEventListener("online",()=>{setSyncStatus("Back online");loadAll();});
window.addEventListener("offline",()=>setSyncStatus("Offline",true));

(async function init(){
  document.querySelector(".app-shell")?.classList.add("auth-hidden");
  makeAuthGate();
  const { data:{ session } } = await db.auth.getSession();
  await handleSession(session);
  db.auth.onAuthStateChange(async (_event, nextSession) => {
    await handleSession(nextSession);
  });
  icons();
})();
