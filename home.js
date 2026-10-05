// K22 — Home page
// Home calendar, smart summary, quick capture, and focus.

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

