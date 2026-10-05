// K22 — Shared attachments for Notes + Category pages

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

