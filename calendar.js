// K22 — Calendar page
// Page-specific calendar UI. Shared date/event helpers live in js.js.

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

