// K22 — Today page
// Tasks, todo hub, and routines.

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


