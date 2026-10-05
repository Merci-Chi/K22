// K22 — Notes page

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
