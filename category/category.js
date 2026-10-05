// K22 — Individual category page / Craft-style editor

let activeCategoryPageId=null;

function categoryPageRecord(id) {
  return (state.categoryPages||[]).find(page=>page.id===id)||null;
}

function categoryPageChildren(parentId=activeCategoryPageId) {
  return (state.categoryPages||[])
    .filter(page=>
      page.category===activeCategory &&
      (page.parent_id||null)===(parentId||null)
    )
    .sort((a,b)=>(a.position||0)-(b.position||0) || String(a.created_at||"").localeCompare(String(b.created_at||"")));
}

function categoryPageAncestors(pageId=activeCategoryPageId) {
  const path=[];
  const seen=new Set();
  let current=categoryPageRecord(pageId);
  while(current && !seen.has(current.id)){
    seen.add(current.id);
    path.unshift(current);
    current=current.parent_id?categoryPageRecord(current.parent_id):null;
  }
  return path;
}

function categoryPageDescendantIds(pageId) {
  const ids=new Set([pageId]);
  let changed=true;
  while(changed){
    changed=false;
    (state.categoryPages||[]).forEach(page=>{
      if(page.parent_id && ids.has(page.parent_id) && !ids.has(page.id)){
        ids.add(page.id);
        changed=true;
      }
    });
  }
  return ids;
}

function currentCategoryPage() {
  return activeCategoryPageId?categoryPageRecord(activeCategoryPageId):null;
}

function setupCategoryPage() {
  if(document.body.dataset.page!=="category")return;
  const params=new URLSearchParams(location.search);
  const requested=params.get("name");
  const requestedPage=params.get("page");
  if(!requested || !CATEGORY_PAGE_META[requested]){
    location.replace("../categories/categories.html");
    return;
  }

  const page=requestedPage?categoryPageRecord(requestedPage):null;
  const validPage=page && page.category===requested ? page.id : null;
  openCategory(requested,{replaceUrl:true,pageId:validPage});
}

function searchSafeCategoryPathLabel(page) {
  if(!page)return activeCategory;
  return [activeCategory,...categoryPageAncestors(page.id).map(item=>item.title)].join(" › ");
}

function updateCategoryDocumentMeta() {
  if(document.body.dataset.page!=="category" || !activeCategory)return;
  const title=document.getElementById("categoryPageTitle");
  const description=document.getElementById("categoryPageDescription");
  const icon=document.getElementById("categoryPageIcon");
  const cover=document.getElementById("categoryCover");
  const edited=document.getElementById("categoryLastEdited");
  const meta=CATEGORY_PAGE_META[activeCategory] || {icon:"folder-open",tone:"blue",description:"Your space for everything that belongs here."};
  const activePage=currentCategoryPage();

  if(title)title.textContent=activePage?.title||activeCategory;
  if(description)description.textContent=activePage
    ? "A page inside "+searchSafeCategoryPathLabel(activePage)
    : meta.description;

  const documentHeading=document.querySelector(".category-editor-title h2");
  if(documentHeading)documentHeading.textContent=activePage ? activePage.title : "Your Page";
  if(icon)icon.innerHTML='<i data-lucide="'+meta.icon+'"></i>';
  if(cover){
    cover.className="category-cover tone-"+meta.tone;
    cover.setAttribute("aria-label",activeCategory+" cover");
  }
  document.title=(activePage?.title||activeCategory)+" — K22";

  const timestamps=[
    ...(activeCategoryPageId
      ? []
      : state.categoryItems.filter(x=>x.category===activeCategory).map(x=>x.updated_at||x.created_at)),
    ...(state.categoryBlocks||[])
      .filter(x=>x.category===activeCategory && (x.page_id||null)===(activeCategoryPageId||null))
      .map(x=>x.updated_at||x.created_at),
    ...(activeCategoryPageId
      ? [activePage?.updated_at||activePage?.created_at]
      : state.categoryNotes.filter(x=>x.category===activeCategory).map(x=>x.updated_at||x.created_at)),
    ...(activeCategoryPageId
      ? []
      : state.attachments.filter(x=>x.owner_type==="category"&&x.owner_key===activeCategory).map(x=>x.created_at))
  ].filter(Boolean).sort().reverse();

  if(edited){
    edited.textContent=timestamps[0]
      ? "Edited "+new Date(timestamps[0]).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
      : "New page";
  }
  icons();
}


const CATEGORY_STARTER_TEMPLATES = {
  "Love": [
    ["section","People & Relationships",{style:"card"}],
    ["paragraph","Important people, memories, dates, and things worth remembering."],
    ["section","Plans & Ideas",{}],
    ["bullet","Date ideas"],
    ["bullet","Things to do together"],
    ["section","Memories",{}],
    ["paragraph","Favorite moments and notes."]
  ],
  "Medical": [
    ["section","Doctors & Providers",{style:"card"}],
    ["bullet","Primary care"],
    ["bullet","Dental"],
    ["bullet","Vision"],
    ["section","Appointments",{}],
    ["checklist","Upcoming appointment"],
    ["section","Medications & Health Notes",{}],
    ["paragraph","Keep medication, symptom, and health notes here."],
    ["section","Documents",{}],
    ["callout","Add important medical records and files below."]
  ],
  "Goals": [
    ["section","Main Goals",{style:"card"}],
    ["checklist","Goal 1"],
    ["checklist","Goal 2"],
    ["section","Why It Matters",{}],
    ["paragraph","Write what you are working toward and why."],
    ["section","Next Steps",{}],
    ["bullet","Small next action"],
    ["section","Progress Notes",{}],
    ["paragraph","Track wins, changes, and lessons."]
  ],
  "Routine": [
    ["section","Morning",{style:"card"}],
    ["checklist","Morning routine item"],
    ["section","Afternoon",{}],
    ["checklist","Afternoon routine item"],
    ["section","Evening",{}],
    ["checklist","Evening routine item"],
    ["section","Notes",{}],
    ["paragraph","What is working and what you want to change."]
  ],
  "Education": [
    ["section","Current Learning",{style:"card"}],
    ["bullet","Course, class, or topic"],
    ["section","Notes",{}],
    ["paragraph","Key ideas and things to remember."],
    ["section","Resources",{}],
    ["link","Useful resource"],
    ["section","Next Steps",{}],
    ["checklist","Study or learning task"]
  ],
  "Trackers": [
    ["section","What I'm Tracking",{style:"card"}],
    ["paragraph","Add the thing you want to measure or notice."],
    ["section","Current Status",{}],
    ["callout","Latest update"],
    ["section","Log",{}],
    ["bullet","New entry"]
  ],
  "Cooking": [
    ["section","Favorite Recipes",{style:"card"}],
    ["heading2","Recipe name"],
    ["bullet","Ingredient"],
    ["numbered","Step 1"],
    ["section","Meal Ideas",{}],
    ["bullet","Meal idea"],
    ["section","Kitchen Notes",{}],
    ["paragraph","Substitutions, favorites, and things to try."]
  ],
  "My Food Order": [
    ["section","Go-To Orders",{style:"card"}],
    ["heading2","Restaurant"],
    ["bullet","My usual order"],
    ["bullet","Customizations"],
    ["section","Favorites",{}],
    ["bullet","Favorite drink"],
    ["bullet","Favorite side"],
    ["section","Try Next",{}],
    ["checklist","Something new to order"]
  ],
  "Lifestyle Notes": [
    ["section","Quick Reference",{style:"card"}],
    ["paragraph","Sizes, preferences, routines, and useful details."],
    ["section","Things I Like",{}],
    ["bullet","Favorite"],
    ["section","Things to Remember",{}],
    ["callout","Important lifestyle note"]
  ],
  "Fashion": [
    ["section","Style Notes",{style:"card"}],
    ["paragraph","Colors, fits, brands, and styles you like."],
    ["section","Outfit Ideas",{}],
    ["bullet","Outfit idea"],
    ["section","Sizing",{}],
    ["columns",""],
    ["section","Wishlist",{}],
    ["checklist","Clothing item"]
  ],
  "Parties": [
    ["section","Party Overview",{style:"card"}],
    ["columns",""],
    ["section","Guest List",{}],
    ["checklist","Guest"],
    ["section","Decor & Theme",{}],
    ["bullet","Decor idea"],
    ["section","Food & Drinks",{}],
    ["bullet","Food or drink"],
    ["section","To Do",{}],
    ["checklist","Party task"]
  ],
  "Wishlist": [
    ["section","Top Wants",{style:"card"}],
    ["checklist","Wishlist item"],
    ["section","Compare Later",{}],
    ["bullet","Item to research"],
    ["section","Ideas",{}],
    ["paragraph","Things you might want later."]
  ],
  "Business": [
    ["section","Current Focus",{style:"card"}],
    ["callout","Main business priority"],
    ["section","Projects",{}],
    ["checklist","Active project"],
    ["section","Clients",{}],
    ["bullet","Client / lead"],
    ["section","Deadlines",{}],
    ["checklist","Upcoming deadline"],
    ["section","Operations & Notes",{}],
    ["paragraph","Processes, decisions, and business notes."],
    ["section","Important Links",{}],
    ["link","Business link"]
  ],
  "Websites": [
    ["section","Active Websites",{style:"card"}],
    ["heading2","Website name"],
    ["link","Website URL"],
    ["checklist","Next website task"],
    ["section","Domains & Renewals",{}],
    ["bullet","Domain / renewal date"],
    ["section","Ideas & Changes",{}],
    ["bullet","Website improvement"],
    ["section","Reference",{}],
    ["paragraph","Hosting, design, and project notes."]
  ],
  "Investments": [
    ["section","Watchlist",{style:"card"}],
    ["bullet","Investment to watch"],
    ["section","Research",{}],
    ["heading2","Investment / company"],
    ["paragraph","Why it interests me."],
    ["section","Notes & Decisions",{}],
    ["callout","Important investment note"]
  ],
  "Networking": [
    ["section","People to Follow Up With",{style:"card"}],
    ["checklist","Name / follow-up"],
    ["section","Connections",{}],
    ["bullet","Person — how we connected"],
    ["section","Opportunities",{}],
    ["bullet","Opportunity"],
    ["section","Conversation Notes",{}],
    ["paragraph","Useful details to remember."]
  ],
  "Legal": [
    ["section","Important Matters",{style:"card"}],
    ["callout","Current legal priority"],
    ["section","Deadlines",{}],
    ["checklist","Deadline / filing"],
    ["section","Documents",{}],
    ["paragraph","Keep related files below."],
    ["section","Notes",{}],
    ["paragraph","Legal references and notes."]
  ],
  "Nellis Auction": [
    ["section","Watching",{style:"card"}],
    ["checklist","Auction lot"],
    ["section","Bid Limits",{}],
    ["bullet","Item — max price"],
    ["section","Won / Pickup",{}],
    ["checklist","Pickup item"],
    ["section","Notes",{}],
    ["paragraph","Condition, value, pickup, and purchase notes."]
  ],
  "Ideas": [
    ["section","Inbox",{style:"card"}],
    ["bullet","New idea"],
    ["section","Worth Exploring",{}],
    ["heading2","Idea"],
    ["paragraph","Why it could be useful."],
    ["section","Someday",{}],
    ["bullet","Future idea"]
  ],
  "Gifts": [
    ["section","People",{style:"card"}],
    ["heading2","Person"],
    ["bullet","Gift idea"],
    ["section","Need to Buy",{}],
    ["checklist","Gift"],
    ["section","Bought / Ready",{}],
    ["checklist","Purchased gift"],
    ["section","Notes",{}],
    ["paragraph","Sizes, preferences, and reminders."]
  ],
  "Wedding": [
    ["section","Wedding Overview",{style:"card"}],
    ["columns",""],
    ["section","To Do",{}],
    ["checklist","Wedding task"],
    ["section","Vendors",{}],
    ["bullet","Vendor"],
    ["section","Budget",{}],
    ["bullet","Budget item"],
    ["section","Guest Ideas",{}],
    ["bullet","Guest / group"],
    ["section","Inspiration",{}],
    ["paragraph","Add photos, ideas, colors, and inspiration below."]
  ],
  "Kids": [
    ["section","Ideas for the Future",{style:"card"}],
    ["bullet","Idea"],
    ["section","Names & Favorites",{}],
    ["bullet","Name or favorite"],
    ["section","Things to Remember",{}],
    ["paragraph","Notes, plans, and memories you want to keep."]
  ],
  "Home": [
    ["section","Current Home Projects",{style:"card"}],
    ["checklist","Home project"],
    ["section","Rooms & Ideas",{}],
    ["heading2","Room"],
    ["bullet","Idea"],
    ["section","Maintenance",{}],
    ["checklist","Maintenance task"],
    ["section","Things to Buy",{}],
    ["checklist","Home item"]
  ],
  "Car": [
    ["section","Car Overview",{style:"card"}],
    ["columns",""],
    ["section","Maintenance",{}],
    ["checklist","Maintenance item"],
    ["section","Registration & Insurance",{}],
    ["checklist","Renewal / document"],
    ["section","Repairs",{}],
    ["bullet","Repair note"],
    ["section","Receipts & Documents",{}],
    ["paragraph","Add related files below."]
  ]
};

function starterTemplateRows(category,startPosition=0){
  const template=CATEGORY_STARTER_TEMPLATES[category]||[];
  return template.map((entry,index)=>{
    const [type,value,settings={}] = entry;
    let content={text:value||""};
    if(type==="checklist")content={text:value||"",checked:false};
    if(type==="link")content={text:value||"",url:""};
    if(type==="columns")content={text:"",left:"",right:""};
    return {
      id:crypto.randomUUID(),
      user_id:currentUser.id,
      category,
      page_id:activeCategoryPageId||null,
      type,
      content,
      settings,
      position:startPosition+index,
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
  });
}

async function applyCategoryStarterTemplate(){
  if(!currentUser||!activeCategory||!categoryBlocksAvailable)return;
  const template=CATEGORY_STARTER_TEMPLATES[activeCategory];
  if(!template?.length)return toast("No starter template is available for this category yet",true);

  const existing=blocksForActiveCategory();
  if(existing.length){
    const ok=confirm("This will add the "+activeCategory+" starter template below your existing page. Nothing you already wrote will be deleted. Continue?");
    if(!ok)return;
  }

  const rows=starterTemplateRows(activeCategory,existing.length);
  state.categoryBlocks.push(...rows);
  saveOfflineCache();
  renderCategoryBlocks();

  const result=await commitMutation({
    table:"category_blocks",
    action:"insert",
    payload:rows
  },rows);

  if(result.error){
    const ids=new Set(rows.map(x=>x.id));
    state.categoryBlocks=state.categoryBlocks.filter(x=>!ids.has(x.id));
    saveOfflineCache();
    renderCategoryBlocks();
    return toast(result.error.message,true);
  }

  if(Array.isArray(result.data)&&result.data.length){
    const byId=new Map(result.data.map(x=>[x.id,x]));
    state.categoryBlocks=state.categoryBlocks.map(x=>byId.get(x.id)||x);
  }

  renderCategoryBlocks();
  updateCategoryDocumentMeta();
  toast(activeCategory+" starter template added");
  setTimeout(()=>document.querySelector('[data-block-id="'+rows[0].id+'"]')?.scrollIntoView({behavior:"smooth",block:"center"}),80);
}

function bindCategoryStarterTemplate(){
  const btn=document.getElementById("applyCategoryTemplate");
  if(!btn||btn.dataset.bound)return;
  btn.dataset.bound="1";
  btn.addEventListener("click",applyCategoryStarterTemplate);
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
  section:{label:"Section",icon:"panel-top",placeholder:"Section title"},
  columns:{label:"Columns",icon:"columns-2"},
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
    .filter(block=>
      block.category===activeCategory &&
      (block.page_id||null)===(activeCategoryPageId||null)
    )
    .sort((a,b)=>(a.position||0)-(b.position||0));
}

function normalizeBlockContent(block) {
  const content=block?.content;
  if(content && typeof content==="object" && !Array.isArray(content))return content;
  if(typeof content==="string")return {text:content};
  return {};
}

async function migrateCategoryLegacyToBlocks(category) {
  if(activeCategoryPageId)return;
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

const categoryBlockSaveChains=new Map();
const categoryBlockPendingCounts=new Map();

function categoryBlockHasPendingSave(id) {
  return (categoryBlockPendingCounts.get(id)||0)>0;
}

function markCategoryBlockSavePending(id,delta) {
  const next=Math.max(0,(categoryBlockPendingCounts.get(id)||0)+delta);
  if(next)categoryBlockPendingCounts.set(id,next);
  else categoryBlockPendingCounts.delete(id);
}

function waitForCategoryBlockSave(id) {
  return categoryBlockSaveChains.get(id)||Promise.resolve();
}

async function waitForCategoryBlockSaves(ids) {
  await Promise.all([...new Set(ids)].map(waitForCategoryBlockSave));
}

function queueCategoryBlockSave(block,payload) {
  const id=block.id;
  const previous=categoryBlockSaveChains.get(id)||Promise.resolve();
  markCategoryBlockSavePending(id,1);

  const task=previous
    .catch(()=>{})
    .then(()=>commitMutation({
      table:"category_blocks",
      action:"update",
      payload,
      match:{id}
    },[block]))
    .then(result=>{
      if(result.error)toast(result.error.message,true);
      return result;
    })
    .finally(()=>{
      markCategoryBlockSavePending(id,-1);
      if(categoryBlockSaveChains.get(id)===task)categoryBlockSaveChains.delete(id);
    });

  categoryBlockSaveChains.set(id,task);
  return task;
}

async function createCategoryBlock(type="paragraph", afterId=null, initialContent=null) {
  if(!categoryBlocksAvailable){
    toast("Run the Batch 2 category_blocks SQL first",true);
    return null;
  }
  if(!activeCategory || !CATEGORY_BLOCK_TYPES[type])return null;

  const rows=blocksForActiveCategory();
  let position=rows.length;
  if(afterId){
    const index=rows.findIndex(x=>x.id===afterId);
    if(index>=0)position=index+1;
  }

  // Finish the source row's autosave before changing surrounding positions.
  if(afterId)await waitForCategoryBlockSave(afterId);

  const later=rows.filter(x=>(x.position||0)>=position);
  later.forEach(row=>{
    row.position=(row.position||0)+1;
    row.updated_at=new Date().toISOString();
  });

  const content=initialContent
    ? {...initialContent}
    : type==="checklist"
      ? {text:"",checked:false}
      : type==="link"
        ? {text:"",url:""}
        : type==="columns"
          ? {text:"",left:"",right:""}
          : {text:""};

  const local={
    id:crypto.randomUUID(),user_id:currentUser.id,category:activeCategory,page_id:activeCategoryPageId||null,type,
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
    later.forEach(row=>row.position=Math.max(0,(row.position||1)-1));
    saveOfflineCache();
    return toast(result.error.message,true);
  }
  if(result.data?.[0])Object.assign(local,result.data[0]);

  // Shift existing rows only after the insert exists remotely. These updates
  // are serialized with any pending text autosaves for those blocks.
  if(later.length){
    await waitForCategoryBlockSaves(later.map(row=>row.id));
    await Promise.all(later.map(row=>
      queueCategoryBlockSave(row,{
        position:row.position,
        updated_at:row.updated_at
      })
    ));
  }

  renderCategoryBlocks();
  updateCategoryDocumentMeta();
  setTimeout(()=>{
    const field=document.querySelector('[data-block-id="'+local.id+'"] .category-block-input');
    field?.focus();
    placeCaretAtEnd(field);
  },30);

  return local;
}

async function updateCategoryBlock(block, patch) {
  const updated_at=new Date().toISOString();
  Object.assign(block,patch,{updated_at});
  saveOfflineCache();

  const payload={updated_at};
  if(patch.content!==undefined)payload.content=patch.content;
  if(patch.settings!==undefined)payload.settings=patch.settings;
  if(patch.type!==undefined)payload.type=patch.type;
  if(patch.position!==undefined)payload.position=patch.position;

  const result=await queueCategoryBlockSave(block,payload);
  updateCategoryDocumentMeta();
  return result;
}

async function deleteCategoryBlock(block) {
  const rows=blocksForActiveCategory();
  const index=rows.findIndex(x=>x.id===block.id);
  const focusId=rows[index+1]?.id||rows[index-1]?.id||null;

  await waitForCategoryBlockSave(block.id);

  state.categoryBlocks=state.categoryBlocks.filter(x=>x.id!==block.id);
  saveOfflineCache();
  renderCategoryBlocks();

  if(focusId){
    setTimeout(()=>{
      const field=document.querySelector('[data-block-id="'+focusId+'"] .category-block-input');
      field?.focus();
      placeCaretAtEnd(field);
    },30);
  }

  const result=await commitMutation({
    table:"category_blocks",action:"delete",match:{id:block.id}
  });
  if(result.error)return toast(result.error.message,true);
  updateCategoryDocumentMeta();
}

function categoryNumberForBlock(block) {
  const rows=blocksForActiveCategory();
  const index=rows.findIndex(x=>x.id===block.id);
  if(index<0)return 1;

  // Craft-style numbering only continues through one uninterrupted
  // numbered-list run. A paragraph, heading, checklist, etc. resets to 1.
  let number=1;
  for(let i=index-1;i>=0;i--){
    if(rows[i].type!=="numbered")break;
    number++;
  }
  return number;
}

function categoryListFieldIsEmpty(field) {
  return !blockPlainText(field)
    .replace(/\u200B/g,"")
    .replace(/\u00A0/g," ")
    .trim();
}

function placeCaretAtEnd(field) {
  if(!field)return;
  const range=document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  const selection=window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
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
    id:crypto.randomUUID(),user_id:currentUser.id,category:activeCategory,page_id:activeCategoryPageId||null,type:kind,
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


function sectionBlockField(block,content){
  const wrap=document.createElement("div");
  const collapsed=!!block.settings?.collapsed;
  const style=block.settings?.style||"plain";
  wrap.className="category-section-block style-"+style+(collapsed?" collapsed":"");

  wrap.innerHTML=`
    <div class="category-section-block-head">
      <button type="button" class="category-section-collapse" aria-label="${collapsed?"Expand":"Collapse"} section">
        <i data-lucide="${collapsed?"chevron-right":"chevron-down"}"></i>
      </button>
      <input class="category-section-title-input" type="text" placeholder="Section title" value="${esc(content.text||"")}">
      <div class="category-section-style">
        <button type="button" data-section-style="plain" class="${style==="plain"?"active":""}">Plain</button>
        <button type="button" data-section-style="card" class="${style==="card"?"active":""}">Card</button>
      </div>
    </div>
    <div class="category-section-hint">${collapsed?"Section collapsed":"Blocks below belong to this section until the next section."}</div>
  `;

  let timer;
  const title=wrap.querySelector(".category-section-title-input");
  title.addEventListener("input",()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      content={...content,text:title.value};
      updateCategoryBlock(block,{content});
      renderCategoryOutline();
    },350);
  });

  wrap.querySelector(".category-section-collapse").addEventListener("click",async()=>{
    block.settings={...(block.settings||{}),collapsed:!collapsed};
    await updateCategoryBlock(block,{settings:block.settings});
    renderCategoryBlocks();
  });

  wrap.querySelectorAll("[data-section-style]").forEach(btn=>btn.addEventListener("click",async()=>{
    block.settings={...(block.settings||{}),style:btn.dataset.sectionStyle};
    await updateCategoryBlock(block,{settings:block.settings});
    renderCategoryBlocks();
  }));

  return wrap;
}

function columnsBlockField(block,content){
  const wrap=document.createElement("div");
  wrap.className="category-columns-block";

  const left=content.left||"";
  const right=content.right||"";

  wrap.innerHTML=`
    <div class="category-column-panel">
      <div class="category-column-label">Left column</div>
      <div class="category-column-editor" contenteditable="true" data-column="left" data-placeholder="Write in the left column..."></div>
    </div>
    <div class="category-column-panel">
      <div class="category-column-label">Right column</div>
      <div class="category-column-editor" contenteditable="true" data-column="right" data-placeholder="Write in the right column..."></div>
    </div>
  `;

  wrap.querySelector('[data-column="left"]').innerHTML=sanitizeRichBlockHtml(left);
  wrap.querySelector('[data-column="right"]').innerHTML=sanitizeRichBlockHtml(right);

  let timer;
  wrap.querySelectorAll(".category-column-editor").forEach(field=>{
    field.addEventListener("paste",e=>{
      e.preventDefault();
      document.execCommand("insertText",false,e.clipboardData?.getData("text/plain")||"");
    });
    field.addEventListener("input",()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        content={
          ...content,
          left:sanitizeRichBlockHtml(wrap.querySelector('[data-column="left"]').innerHTML),
          right:sanitizeRichBlockHtml(wrap.querySelector('[data-column="right"]').innerHTML),
          text:[
            wrap.querySelector('[data-column="left"]').innerText,
            wrap.querySelector('[data-column="right"]').innerText
          ].filter(Boolean).join(" ")
        };
        updateCategoryBlock(block,{content});
      },350);
    });
  });

  return wrap;
}

function sectionForPosition(rows,index){
  for(let i=index-1;i>=0;i--){
    if(rows[i].type==="section")return rows[i];
  }
  return null;
}

function isBlockHiddenByCollapsedSection(rows,index){
  const section=sectionForPosition(rows,index);
  if(!section)return false;
  const sectionIndex=rows.findIndex(x=>x.id===section.id);
  for(let i=sectionIndex+1;i<index;i++){
    if(rows[i].type==="section")return false;
  }
  return !!section.settings?.collapsed;
}

function renderCategoryOutline(){
  const holder=document.getElementById("categoryOutlineItems");
  if(!holder||!activeCategory)return;
  holder.innerHTML="";

  const rows=blocksForActiveCategory();
  const outlineRows=rows.filter(block=>["section","heading1","heading2","heading3"].includes(block.type));

  if(!outlineRows.length){
    holder.innerHTML='<div class="category-outline-empty">Add a section or heading to build your outline.</div>';
    return;
  }

  outlineRows.forEach(block=>{
    const content=normalizeBlockContent(block);
    const button=document.createElement("button");
    button.type="button";
    button.className="category-outline-item outline-"+block.type;
    button.innerHTML='<i data-lucide="'+(CATEGORY_BLOCK_TYPES[block.type]?.icon||"heading")+'"></i><span>'+esc(content.text||CATEGORY_BLOCK_TYPES[block.type]?.label||"Untitled")+'</span>';
    button.addEventListener("click",()=>{
      document.querySelector('[data-block-id="'+block.id+'"]')?.scrollIntoView({behavior:"smooth",block:"center"});
      if(window.matchMedia("(max-width: 650px)").matches)document.getElementById("categoryOutline")?.classList.add("hidden");
    });
    holder.appendChild(button);
  });
  icons();
}

function bindCategoryOutline(){
  const outline=document.getElementById("categoryOutline");
  const toggle=document.getElementById("toggleCategoryOutline");
  const close=document.getElementById("closeCategoryOutline");
  if(!outline||!toggle)return;

  if(!toggle.dataset.bound){
    toggle.dataset.bound="1";
    toggle.addEventListener("click",()=>{
      outline.classList.toggle("hidden");
      if(!outline.classList.contains("hidden"))renderCategoryOutline();
    });
  }
  if(close&&!close.dataset.bound){
    close.dataset.bound="1";
    close.addEventListener("click",()=>outline.classList.add("hidden"));
  }
}

function categoryRichContentAtCaret(field) {
  const selection=window.getSelection();
  if(!selection?.rangeCount)return null;

  const caret=selection.getRangeAt(0);
  if(!caret.collapsed || !field.contains(caret.startContainer))return null;

  const before=document.createRange();
  before.selectNodeContents(field);
  before.setEnd(caret.startContainer,caret.startOffset);

  const after=document.createRange();
  after.selectNodeContents(field);
  after.setStart(caret.startContainer,caret.startOffset);

  const htmlFromFragment=fragment=>{
    const holder=document.createElement("div");
    holder.appendChild(fragment);
    return sanitizeRichBlockHtml(holder.innerHTML);
  };

  const beforeHtml=htmlFromFragment(before.cloneContents());
  const afterHtml=htmlFromFragment(after.cloneContents());

  const textFromHtml=html=>{
    const holder=document.createElement("div");
    holder.innerHTML=html;
    return (holder.innerText||holder.textContent||"")
      .replace(/\u00a0/g," ")
      .trimEnd();
  };

  return {
    before:{text:textFromHtml(beforeHtml),html:beforeHtml},
    after:{text:textFromHtml(afterHtml),html:afterHtml}
  };
}

function categoryBlockField(block, content) {
  if(block.type==="section")return sectionBlockField(block,content);
  if(block.type==="columns")return columnsBlockField(block,content);

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

  field.addEventListener("keydown",async e=>{
    if(e.isComposing)return;

    const isListRow=["bullet","numbered","checklist"].includes(block.type);
    if(!isListRow){
      // Enter creates a brand-new Text block underneath.
      if(
        e.key==="Enter" &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ){
        e.preventDefault();
        if(e.repeat || field.dataset.blockActionBusy==="1")return;
        field.dataset.blockActionBusy="1";
        clearTimeout(timer);

        try{
          const split=categoryRichContentAtCaret(field);
          const currentHtml=split?.before?.html ?? sanitizeRichBlockHtml(field.innerHTML);
          const currentText=split?.before?.text ?? blockPlainText(field);
          const trailing=split?.after ?? {text:"",html:""};

          content={...content,text:currentText,html:currentHtml};
          await updateCategoryBlock(block,{content});

          await createCategoryBlock("paragraph",block.id,{
            text:trailing.text||"",
            html:trailing.html||""
          });
        } finally {
          field.dataset.blockActionBusy="0";
        }
        return;
      }

      // Shift+Enter is a soft line break inside this SAME block.
      if(e.key==="Enter" && e.shiftKey)return;

      if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){
        e.preventDefault();
        await createCategoryBlock("paragraph",block.id);
      }
      return;
    }

    // Shift+Enter stays inside this row as a soft line break.
    if(e.key==="Enter" && e.shiftKey)return;

    // Enter on a list row behaves like Craft.
    if(e.key==="Enter" && !e.metaKey && !e.ctrlKey && !e.altKey){
      e.preventDefault();
      if(e.repeat || field.dataset.listActionBusy==="1")return;
      field.dataset.listActionBusy="1";
      clearTimeout(timer);

      try{
        if(categoryListFieldIsEmpty(field)){
          // Empty list row exits the list without creating another empty row.
          const nextContent={...content,text:"",html:""};
          if(block.type==="checklist")delete nextContent.checked;
          block.type="paragraph";
          block.content=nextContent;
          await updateCategoryBlock(block,{type:"paragraph",content:nextContent});
          renderCategoryBlocks();
          setTimeout(()=>{
            const next=document.querySelector('[data-block-id="'+block.id+'"] .category-block-input');
            next?.focus();
            placeCaretAtEnd(next);
          },30);
          return;
        }

        // Save exactly what is visible before creating the next row.
        const html=sanitizeRichBlockHtml(field.innerHTML);
        content={...content,text:blockPlainText(field),html};
        await updateCategoryBlock(block,{content});

        // Checklist rows always continue unchecked. Bullet and numbered rows
        // continue with the same type directly underneath.
        await createCategoryBlock(block.type,block.id);
      } finally {
        field.dataset.listActionBusy="0";
      }
      return;
    }

    // Backspace on a completely empty list row exits the list too.
    if(e.key==="Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey && categoryListFieldIsEmpty(field)){
      e.preventDefault();
      if(field.dataset.listActionBusy==="1")return;
      field.dataset.listActionBusy="1";
      clearTimeout(timer);

      try{
        const nextContent={...content,text:"",html:""};
        if(block.type==="checklist")delete nextContent.checked;
        block.type="paragraph";
        block.content=nextContent;
        await updateCategoryBlock(block,{type:"paragraph",content:nextContent});
        renderCategoryBlocks();
        setTimeout(()=>{
          const next=document.querySelector('[data-block-id="'+block.id+'"] .category-block-input');
          next?.focus();
          placeCaretAtEnd(next);
        },30);
      } finally {
        field.dataset.listActionBusy="0";
      }
      return;
    }

    if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){
      e.preventDefault();
      await createCategoryBlock("paragraph",block.id);
    }
  });

  return wrap;
}


function isConvertibleCategoryBlock(type) {
  return ["paragraph","heading1","heading2","heading3","bullet","numbered","checklist","quote","callout","link","code"].includes(type);
}

async function persistCategoryBlockOrder(rows) {
  rows.forEach((row,index)=>{
    row.position=index;
    row.updated_at=new Date().toISOString();
  });
  saveOfflineCache();

  // Finish any text autosave for these blocks before writing their new order.
  await waitForCategoryBlockSaves(rows.map(row=>row.id));

  const results=await Promise.all(rows.map(row=>
    queueCategoryBlockSave(row,{
      position:row.position,
      updated_at:row.updated_at
    })
  ));

  const failed=results.find(result=>result?.error);
  if(failed?.error)toast(failed.error.message,true);
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
  setTimeout(()=>{
    const row=document.querySelector('[data-block-id="'+block.id+'"]');
    row?.scrollIntoView({block:"nearest"});
    const field=row?.querySelector(".category-block-input");
    field?.focus();
    placeCaretAtEnd(field);
  },30);
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
  setTimeout(()=>{
    const row=document.querySelector('[data-block-id="'+block.id+'"]');
    const field=row?.querySelector(".category-block-input");
    field?.focus();
    placeCaretAtEnd(field);
  },30);
}

async function duplicateCategoryBlock(block) {
  const rows=blocksForActiveCategory();
  const index=rows.findIndex(x=>x.id===block.id);
  if(index<0)return;

  const clone={
    id:crypto.randomUUID(),
    user_id:currentUser.id,
    category:activeCategory,
    page_id:block.page_id||activeCategoryPageId||null,
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
  setTimeout(()=>{
    const field=document.querySelector('[data-block-id="'+clone.id+'"] .category-block-input');
    field?.focus();
    placeCaretAtEnd(field);
  },30);
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
  setTimeout(()=>{
    const field=document.querySelector('[data-block-id="'+block.id+'"] .category-block-input');
    field?.focus();
    placeCaretAtEnd(field);
  },30);
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


function revealCategoryBlockForSearch(blockId) {
  const rows=blocksForActiveCategory();
  const index=rows.findIndex(row=>row.id===blockId);
  if(index<0)return false;

  // Walk backward to the nearest section. If that section is collapsed,
  // expand it so the matching block can actually be rendered and focused.
  for(let i=index-1;i>=0;i--){
    const row=rows[i];
    if(row.type!=="section")continue;
    if(row.settings?.collapsed){
      row.settings={...(row.settings||{}),collapsed:false};
      saveOfflineCache();
      queueCategoryBlockSave(row,{
        settings:row.settings,
        updated_at:new Date().toISOString()
      });
      renderCategoryBlocks();
    }
    break;
  }
  return true;
}

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
  if(!rows.length && empty){
    const pageName=currentCategoryPage()?.title||activeCategory;
    empty.innerHTML='<div class="category-block-empty-icon"><i data-lucide="wand-sparkles"></i></div><b>Build your '+esc(pageName)+' page</b><span>Start from scratch with Add block, or use the starter template above.</span>';
  }
  if(count)count.textContent=rows.length+" "+(rows.length===1?"block":"blocks");

  rows.forEach((block,index)=>{
    const hiddenBySection=isBlockHiddenByCollapsedSection(rows,index);
    if(hiddenBySection)return;
    const type=CATEGORY_BLOCK_TYPES[block.type]||CATEGORY_BLOCK_TYPES.paragraph;
    const content=normalizeBlockContent(block);
    const row=document.createElement("div");
    const parentSection=block.type==="section"?null:sectionForPosition(rows,index);
    const sectionStyle=parentSection?.settings?.style||"plain";
    row.className="category-block category-block-"+block.type+(content.checked?" checked":"")+(parentSection?" in-section section-style-"+sectionStyle:"");
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
  bindCategoryOutline();
  bindCategoryStarterTemplate();
  renderCategoryOutline();
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

function categorySubpageUrl(category,pageId=null) {
  return categoryPageUrl(category,pageId);
}

function renderCategoryBreadcrumb() {
  const holder=document.getElementById("categoryBreadcrumb");
  if(!holder)return;

  const parts=[
    {title:activeCategory,pageId:null},
    ...categoryPageAncestors().map(page=>({title:page.title,pageId:page.id}))
  ];

  holder.innerHTML=parts.map((part,index)=>{
    const last=index===parts.length-1;
    return (index?'<i data-lucide="chevron-right"></i>':'')+
      (last
        ? '<span class="current">'+esc(part.title)+'</span>'
        : '<button type="button" data-page-id="'+esc(part.pageId||"")+'">'+esc(part.title)+'</button>');
  }).join("");

  holder.querySelectorAll("[data-page-id]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      openCategory(activeCategory,{pageId:btn.dataset.pageId||null});
    });
  });
  icons();
}

async function createCategorySubpage() {
  if(!currentUser||!activeCategory)return;
  const title=prompt("Subpage name");
  if(!title?.trim())return;

  const siblings=categoryPageChildren();
  const row={
    id:crypto.randomUUID(),
    user_id:currentUser.id,
    category:activeCategory,
    title:title.trim(),
    parent_id:activeCategoryPageId||null,
    position:siblings.length,
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };

  state.categoryPages.push(row);
  saveOfflineCache();
  renderCategorySubpages();

  const result=await commitMutation({
    table:"category_pages",action:"insert",payload:row
  },[row]);

  if(result.error){
    state.categoryPages=state.categoryPages.filter(x=>x.id!==row.id);
    saveOfflineCache();
    renderCategorySubpages();
    return toast(result.error.message,true);
  }
  if(result.data?.[0])Object.assign(row,result.data[0]);

  renderCategorySubpages();
  toast("Subpage created");
}

async function renameCategorySubpage(page) {
  const title=prompt("Rename subpage",page.title||"");
  if(!title?.trim() || title.trim()===page.title)return;

  const previous=page.title;
  page.title=title.trim();
  page.updated_at=new Date().toISOString();
  saveOfflineCache();
  renderCategorySubpages();
  if(activeCategoryPageId===page.id)updateCategoryDocumentMeta();

  const result=await commitMutation({
    table:"category_pages",
    action:"update",
    payload:{title:page.title,updated_at:page.updated_at},
    match:{id:page.id}
  },[page]);

  if(result.error){
    page.title=previous;
    saveOfflineCache();
    renderCategorySubpages();
    updateCategoryDocumentMeta();
    return toast(result.error.message,true);
  }
  toast("Subpage renamed");
}

async function deleteCategorySubpage(page) {
  const descendants=categoryPageDescendantIds(page.id);
  const childCount=descendants.size-1;
  const message=childCount
    ? 'Delete "'+page.title+'" and its '+childCount+' nested subpage'+(childCount===1?"":"s")+'? All blocks inside them will also be deleted.'
    : 'Delete "'+page.title+'"? All blocks inside it will also be deleted.';
  if(!confirm(message))return;

  const pagesBefore=[...(state.categoryPages||[])];
  const blocksBefore=[...(state.categoryBlocks||[])];

  state.categoryPages=(state.categoryPages||[]).filter(x=>!descendants.has(x.id));
  state.categoryBlocks=(state.categoryBlocks||[]).filter(x=>!x.page_id || !descendants.has(x.page_id));
  saveOfflineCache();
  renderCategorySubpages();
  renderCategoryBlocks();

  const result=await commitMutation({
    table:"category_pages",action:"delete",match:{id:page.id}
  });

  if(result.error){
    state.categoryPages=pagesBefore;
    state.categoryBlocks=blocksBefore;
    saveOfflineCache();
    renderCategorySubpages();
    renderCategoryBlocks();
    return toast(result.error.message,true);
  }

  if(descendants.has(activeCategoryPageId)){
    const parentId=page.parent_id||null;
    openCategory(activeCategory,{pageId:parentId,replaceUrl:true});
  }else{
    renderCategorySubpages();
  }
  toast("Subpage deleted");
}

function renderCategorySubpages() {
  const holder=document.getElementById("categorySubpages");
  const empty=document.getElementById("categorySubpagesEmpty");
  const add=document.getElementById("addCategorySubpage");
  const title=document.getElementById("categorySubpagesTitle");
  const files=document.querySelector(".category-page-files");
  if(!holder)return;

  const current=currentCategoryPage();
  const children=categoryPageChildren();
  if(title)title.textContent=current ? "Subpages in "+current.title : "Subpages";
  if(files)files.classList.toggle("hidden",!!activeCategoryPageId);

  holder.innerHTML="";
  children.forEach(page=>{
    const card=document.createElement("article");
    card.className="category-subpage-card";
    const childCount=categoryPageChildren(page.id).length;
    card.innerHTML=
      '<button type="button" class="category-subpage-open">'+
        '<span class="category-subpage-icon"><i data-lucide="file-text"></i></span>'+
        '<span class="category-subpage-copy"><b>'+esc(page.title)+'</b><small>'+(childCount?childCount+' subpage'+(childCount===1?"":"s"):'Open page')+'</small></span>'+
        '<i data-lucide="chevron-right"></i>'+
      '</button>'+
      '<div class="category-subpage-actions">'+
        '<button type="button" data-action="rename" aria-label="Rename"><i data-lucide="pencil"></i></button>'+
        '<button type="button" data-action="delete" aria-label="Delete"><i data-lucide="trash-2"></i></button>'+
      '</div>';

    card.querySelector(".category-subpage-open").addEventListener("click",()=>{
      openCategory(activeCategory,{pageId:page.id});
    });
    card.querySelector('[data-action="rename"]').addEventListener("click",()=>renameCategorySubpage(page));
    card.querySelector('[data-action="delete"]').addEventListener("click",()=>deleteCategorySubpage(page));
    holder.appendChild(card);
  });

  if(empty){
    empty.textContent=current
      ? "No subpages inside "+current.title+" yet."
      : "No subpages here yet.";
    empty.classList.toggle("hidden",children.length>0);
  }

  if(add&&!add.dataset.bound){
    add.dataset.bound="1";
    add.addEventListener("click",createCategorySubpage);
  }

  renderCategoryBreadcrumb();
  icons();
}

function bindCategoryPageBackButton() {
  const back=document.querySelector(".category-back-btn");
  if(!back||back.dataset.bound)return;
  back.dataset.bound="1";
  back.addEventListener("click",e=>{
    if(!activeCategoryPageId)return;
    e.preventDefault();
    const current=currentCategoryPage();
    openCategory(activeCategory,{pageId:current?.parent_id||null});
  });
}

function closeCategoryEditorOverlays() {
  closeCategoryBlockMenus();
  document.getElementById("categoryBlockMenu")?.classList.add("hidden");
  document.getElementById("categoryOutline")?.classList.add("hidden");
  document.getElementById("categoryRichToolbar")?.classList.add("hidden");
}

function openCategory(category, options={}) {
  if(!CATEGORY_PAGE_META[category])return;

  if(document.body.dataset.page!=="category"){
    location.href=categoryPageUrl(category,options.pageId||null);
    return;
  }

  activeCategory=category;

  const requestedPage=options.pageId||null;
  const page=requestedPage?categoryPageRecord(requestedPage):null;
  activeCategoryPageId=page && page.category===category ? page.id : null;

  const wantedUrl=categoryPageUrl(category,activeCategoryPageId);
  const currentUrl=new URL(location.href);
  const targetUrl=new URL(wantedUrl);
  if(!options.replaceUrl && currentUrl.href!==targetUrl.href){
    history.pushState({category,pageId:activeCategoryPageId},"",wantedUrl);
  }else if(options.replaceUrl){
    history.replaceState({category,pageId:activeCategoryPageId},"",wantedUrl);
  }

  updateCategoryDocumentMeta();
  bindCategoryPageBackButton();
  renderCategorySubpages();
  renderCategoryAttachments();

  migrateCategoryLegacyToBlocks(category).then(()=>{
    renderCategoryBlocks();
    updateCategoryDocumentMeta();
  });

  renderCategoryBlocks();
}

window.addEventListener("popstate",()=>{
  if(document.body.dataset.page!=="category")return;
  const params=new URLSearchParams(location.search);
  const category=params.get("name");
  const pageId=params.get("page");
  if(category&&CATEGORY_PAGE_META[category]){
    openCategory(category,{replaceUrl:true,pageId});
  }
});






let categoryEscapePolishBound=false;
function bindCategoryEscapePolish(){
  if(categoryEscapePolishBound)return;
  categoryEscapePolishBound=true;
  document.addEventListener("keydown",e=>{
    if(document.body.dataset.page!=="category"||e.key!=="Escape")return;
    closeCategoryEditorOverlays();
  });
}
bindCategoryEscapePolish();
