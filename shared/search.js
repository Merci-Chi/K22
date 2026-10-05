// K22 — Universal search

function searchTaskView(task) {
  if(typeof taskView==="function") return taskView(task);
  if(task.done) return "completed";
  return task.bucket || task.scope || "task";
}

function searchTaskDueLabel(task) {
  if(typeof taskDueLabel==="function") return taskDueLabel(task);
  return task.due_date || "";
}

function searchEventTimeLabel(ev) {
  if(typeof eventTimeLabel==="function") return eventTimeLabel(ev);
  return ev.event_time || ev.start_time || "";
}

function searchEventDateLabel(ev) {
  if(typeof formatEventDateLabel==="function") return formatEventDateLabel(ev);
  return ev.event_date || "";
}

function searchRoutineRepeatLabel(item) {
  if(typeof routineRepeatLabel==="function") return routineRepeatLabel(item);
  return Array.isArray(item.repeat_days) ? item.repeat_days.join(",") : "";
}

function searchNormalizeBlockContent(block) {
  if(typeof normalizeBlockContent==="function") return normalizeBlockContent(block);
  const content=block?.content;
  if(content && typeof content==="object" && !Array.isArray(content))return content;
  if(typeof content==="string")return {text:content};
  return {};
}

function searchAttachmentById(id) {
  if(typeof attachmentById==="function") return attachmentById(id);
  return (state.attachments||[]).find(x=>x.id===id)||null;
}

function searchAttachmentIcon(mime) {
  if(typeof attachmentIcon==="function") return attachmentIcon(mime);
  if(String(mime||"").startsWith("image/")) return "image";
  if(String(mime||"").includes("pdf")) return "file-text";
  return "file";
}

function searchCategoryTypeMeta(type) {
  if(typeof CATEGORY_BLOCK_TYPES!=="undefined" && CATEGORY_BLOCK_TYPES[type]) return CATEGORY_BLOCK_TYPES[type];
  return {icon:"blocks",label:"Block"};
}

function searchPageUrl(page) {
  const routes={
    "home.html":"../home/home.html",
    "calendar.html":"../calendar/calendar.html",
    "today.html":"../today/today.html",
    "notes.html":"../notes/notes.html",
    "categories.html":"../categories/categories.html",
    "category.html":"../category/category.html"
  };
  return new URL(routes[page]||page,location.href).href;
}

function searchCategoryPageUrl(category,pageId=null) {
  if(typeof categoryPageUrl==="function") return categoryPageUrl(category,pageId);
  const url=new URL("../category/category.html",location.href);
  url.searchParams.set("name",category);
  if(pageId)url.searchParams.set("page",pageId);
  return url.href;
}

function searchCategoryPageById(id) {
  return (state.categoryPages||[]).find(page=>page.id===id)||null;
}

function searchCategoryPagePath(pageId) {
  if(!pageId)return [];
  const path=[];
  const seen=new Set();
  let current=searchCategoryPageById(pageId);
  while(current && !seen.has(current.id)){
    seen.add(current.id);
    path.unshift(current.title);
    current=current.parent_id?searchCategoryPageById(current.parent_id):null;
  }
  return path;
}

function searchCategoryLocationLabel(category,pageId) {
  const path=searchCategoryPagePath(pageId);
  return [category,...path].filter(Boolean).join(" › ");
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
        detail:[searchTaskView(task),task.category,searchTaskDueLabel(task)].filter(Boolean).join(" · "),
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
    const hay=[ev.title,ev.event_date,ev.location,ev.notes,searchEventTimeLabel(ev)].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:"Calendar",icon:"calendar-days",title:ev.title,
        detail:[searchEventDateLabel(ev),searchEventTimeLabel(ev),ev.location].filter(Boolean).join(" · "),
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
        detail:"Legacy category item",page:"category.html",action:"category",id:item.id,category:item.category
      });
    }
  });

  (state.categoryPages||[]).forEach(page=>{
    const path=searchCategoryPagePath(page.id);
    const hay=[page.category,page.title,...path].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:"Subpage",
        icon:"file-text",
        title:page.title,
        detail:searchCategoryLocationLabel(page.category,page.parent_id),
        page:"category.html",
        action:"category-page",
        category:page.category,
        pageId:page.id
      });
    }
  });

  (state.categoryBlocks||[]).forEach(block=>{
    const content=searchNormalizeBlockContent(block);
    const mediaNames=[
      content.attachment_id ? searchAttachmentById(content.attachment_id)?.file_name : "",
      ...(Array.isArray(content.attachment_ids)?content.attachment_ids.map(id=>searchAttachmentById(id)?.file_name||"") : [])
    ];
    const pagePath=searchCategoryPagePath(block.page_id);
    const hay=[block.category,...pagePath,content.text,content.url,content.caption,...mediaNames].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q) && (content.text||content.url||content.caption||mediaNames.some(Boolean))){
      results.push({
        type:block.page_id ? "Subpage" : block.category,
        icon:searchCategoryTypeMeta(block.type).icon||"blocks",
        title:content.text||content.caption||mediaNames.filter(Boolean).join(", ")||content.url||searchCategoryTypeMeta(block.type).label||"Block",
        detail:(searchCategoryTypeMeta(block.type).label||"Block")+" · "+searchCategoryLocationLabel(block.category,block.page_id),
        page:"category.html",
        action:"category-block",
        id:block.id,
        category:block.category,
        pageId:block.page_id||null
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
    const hay=[item.label,item.time_of_day,searchRoutineRepeatLabel(item)].filter(Boolean).join(" ").toLowerCase();
    if(hay.includes(q)){
      results.push({
        type:"Routine",icon:"repeat-2",title:item.label,
        detail:[item.time_of_day,searchRoutineRepeatLabel(item)].filter(Boolean).join(" · "),
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
        type:"File",icon:searchAttachmentIcon(file.mime_type),title:file.file_name,
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
    ...state.categoryNotes.map(x=>x.category),
    ...(state.categoryPages||[]).map(x=>x.category),
    ...(state.categoryBlocks||[]).map(x=>x.category)
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
      const target=(result.page==="category.html"&&result.category)
        ? searchCategoryPageUrl(result.category,result.pageId||null)
        : searchPageUrl(result.page);
      const here=new URL(location.href);
      const there=new URL(target,location.href);

      if(here.pathname===there.pathname){
        handleSearchJump(result);
        panel.classList.add("hidden");
        input.value="";
      }else{
        location.href=target;
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
    if(typeof activeNoteId!=="undefined")activeNoteId=result.id;
    if(typeof renderNotesPage==="function")renderNotesPage();
    setTimeout(()=>document.getElementById("noteTitle")?.focus(),80);
  }

  if(result.action==="event"){
    const ev=state.events.find(x=>x.id===result.id);
    if(ev){
      selectedDate=ev.event_date;
      const d=new Date(ev.event_date+"T12:00:00");
      calendarCursor=new Date(d.getFullYear(),d.getMonth(),1);
      renderCalendar();
      if(typeof openEventModal==="function")openEventModal(ev,ev.event_date);
    }
  }

  if(result.action==="task"){
    const task=state.tasks.find(x=>x.id===result.id);
    if(task){
      todoView=searchTaskView(task);
      document.querySelectorAll(".todo-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.todoView===todoView));
      renderTodoHub();
      if(typeof openTaskModal==="function")openTaskModal(task);
    }
  }

  if(result.action==="routine"){
    const item=state.routine.find(x=>x.id===result.id);
    if(item)openRoutineModal(item);
  }

  if(
    result.action==="category" ||
    result.action==="category-page" ||
    result.action==="category-block"
  ){
    if(typeof openCategory==="function"){
      openCategory(result.category,{
        pageId:result.pageId||null,
        replaceUrl:true
      });
    }

    if(result.action==="category-page"){
      setTimeout(()=>{
        document.getElementById("categoryPageTitle")?.scrollIntoView({behavior:"smooth",block:"start"});
      },80);
    }

    if(result.action==="category-block"&&result.id){
      const jumpToBlock=()=>{
        if(typeof revealCategoryBlockForSearch==="function"){
          revealCategoryBlockForSearch(result.id);
        }
        const el=document.querySelector('[data-block-id="'+result.id+'"]');
        if(!el)return false;
        el.scrollIntoView({behavior:"smooth",block:"center"});
        el.classList.add("search-jump-highlight");
        setTimeout(()=>el.classList.remove("search-jump-highlight"),1800);
        const field=el.querySelector(".category-block-input");
        field?.focus();
        if(field && typeof placeCaretAtEnd==="function")placeCaretAtEnd(field);
        return true;
      };

      setTimeout(()=>{
        if(!jumpToBlock()){
          setTimeout(jumpToBlock,180);
        }
      },120);
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




