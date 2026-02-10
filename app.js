
/* iPad-first concept map editor
   Key goals:
   - Create is EASY: tap "+Testo" then tap canvas where to place; same for image (after choosing file)
   - Pan is EASY: two-finger drag ALWAYS pans; pinch zoom ALWAYS zooms
   - One-finger: drag node in "Sposta" tool, or pan background in "Pan" tool
   - Link is EASY: tap node A then node B; label editable via inspector or tap edge label
*/

const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const uid = ()=>Math.random().toString(16).slice(2)+Date.now().toString(16);

const viewport = $("#viewport");
const nodesEl = $("#nodes");
const edgesSvg = $("#edges");

const toolSelect = $("#toolSelect");
const toolLink = $("#toolLink");
const toolPan = $("#toolPan");

const btnAddText = $("#btnAddText");
const fileAddImage = $("#fileAddImage");
const btnDelete = $("#btnDelete");
const btnCenter = $("#btnCenter");

const btnSave = $("#btnSave");
const btnLoad = $("#btnLoad");
const btnExport = $("#btnExport");
const fileImport = $("#fileImport");

const chipZoom = $("#chipZoom");
const chipHint = $("#chipHint");
const toastEl = $("#toast");

const inspSub = $("#inspSub");
const inspBody = $("#inspBody");

const LS_KEY = "concept_map_ipad_v1";

let state = loadLocal() ?? defaultState();

function defaultState(){
  return {
    version: 1,
    view: { tx: 0, ty: 0, zoom: 1 },
    nodes: [
      makeTextNode("CONCETTO PRINCIPALE", -120, -40, {fill:"#f3e79b", stroke:"#e8d36c", text:"#1f232e"})
    ],
    edges: [],
    ui: {
      tool: "select",
      selected: null,   // {type:"node"|"edge", id}
      linkFrom: null,   // node id
      createMode: null, // "text" | "image"
      pendingImageDataUrl: null
    }
  };
}

function makeTextNode(text, x, y, colors){
  return {
    id: uid(),
    type: "text",
    x, y,
    w: 240,
    text: text ?? "Concetto",
    colors: colors ?? {fill:"rgba(255,255,255,.06)", stroke:"rgba(255,255,255,.18)", text:"#e7e9ee"}
  };
}
function makeImageNode(dataUrl, x, y){
  return {
    id: uid(),
    type: "image",
    x, y,
    w: 280,
    caption: "Didascalia (opzionale)",
    dataUrl
  };
}
function makeEdge(from,to){
  return { id: uid(), from, to, label: "relazione" };
}

/* ---------- View ---------- */
function initView(){
  state.view.tx = viewport.clientWidth/2;
  state.view.ty = viewport.clientHeight/2;
  state.view.zoom = state.view.zoom || 1;
}
function applyView(){
  const {tx, ty, zoom} = state.view;
  const t = `translate(${tx}px, ${ty}px) scale(${zoom})`;
  nodesEl.style.transform = t;
  edgesSvg.style.transform = t;
  chipZoom.textContent = `${Math.round(zoom*100)}%`;
}

function screenToWorld(clientX, clientY){
  const rect = viewport.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const {tx, ty, zoom} = state.view;
  return { x: (x - tx) / zoom, y: (y - ty) / zoom };
}

/* ---------- Render ---------- */
function render(){
  applyView();
  renderNodes();
  renderEdges();
  renderInspector();
  renderHint();
}

function renderHint(){
  if (state.ui.createMode === "text"){
    chipHint.textContent = "Tocca lo sfondo nel punto dove vuoi inserire il nodo di testo";
  } else if (state.ui.createMode === "image"){
    chipHint.textContent = "Tocca lo sfondo nel punto dove vuoi inserire l’immagine";
  } else if (state.ui.tool === "link"){
    chipHint.textContent = state.ui.linkFrom ? "Ora tocca il secondo nodo per creare la freccia" : "Tocca un nodo, poi un altro, per creare una freccia";
  } else if (state.ui.tool === "pan"){
    chipHint.textContent = "Trascina lo sfondo per spostarti. Pinch per zoom";
  } else {
    chipHint.textContent = "Trascina i nodi. Due dita per pan, pinch per zoom";
  }
}

function renderNodes(){
  nodesEl.innerHTML = "";
  for (const n of state.nodes){
    const el = document.createElement("div");
    el.className = `node ${n.type}`;
    el.dataset.id = n.id;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.width = `${n.w}px`;

    if (n.type === "text"){
      el.style.background = n.colors.fill;
      el.style.borderColor = n.colors.stroke;
      el.style.color = n.colors.text;
      el.innerHTML = `<div class="title"></div><div class="badge">testo</div>`;
      el.querySelector(".title").textContent = n.text ?? "";
    } else {
      el.innerHTML = `<img alt="" /><div class="caption"></div><div class="badge">immagine</div>`;
      el.querySelector("img").src = n.dataUrl;
      el.querySelector(".caption").textContent = n.caption ?? "";
    }

    if (state.ui.selected?.type === "node" && state.ui.selected.id === n.id){
      el.classList.add("selected");
    }
    if (state.ui.tool === "link" && state.ui.linkFrom === n.id){
      el.style.outline = "3px solid rgba(72,209,181,.70)";
      el.style.outlineOffset = "2px";
    }

    el.addEventListener("pointerdown", onNodePointerDown);
    el.addEventListener("click", (e)=>{
      e.stopPropagation();
      if (state.ui.tool === "link"){
        handleLinkTap(n.id);
      } else {
        selectNode(n.id);
      }
    });

    // iPad-friendly: double tap is awkward; use "tap-hold" (700ms) to edit
    attachLongPress(el, () => {
      selectNode(n.id);
      if (n.type==="text"){
        const next = prompt("Testo del nodo:", n.text ?? "");
        if (next === null) return;
        n.text = next.trim() || n.text;
      } else {
        const next = prompt("Didascalia:", n.caption ?? "");
        if (next === null) return;
        n.caption = next;
      }
      saveLocal();
      render();
    });

    nodesEl.appendChild(el);
  }
}

function renderEdges(){
  edgesSvg.innerHTML = "";
  const defs = svgEl("defs");
  defs.innerHTML = `
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(231,233,238,.75)"></path>
    </marker>
  `;
  edgesSvg.appendChild(defs);

  for (const e of state.edges){
    const a = getNode(e.from);
    const b = getNode(e.to);
    if (!a || !b) continue;

    const g = svgEl("g");
    g.dataset.id = e.id;
    const d = edgePath(a,b);

    const path = svgEl("path");
    path.setAttribute("d", d);
    path.setAttribute("class", "edge-path");

    const hit = svgEl("path");
    hit.setAttribute("d", d);
    hit.setAttribute("class", "edge-hit");
    hit.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      selectEdge(e.id);
    });

    const m = edgeMid(a,b);
    const label = svgEl("text");
    label.setAttribute("x", m.x);
    label.setAttribute("y", m.y - 8);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "edge-label");
    label.textContent = e.label ?? "";
    label.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      selectEdge(e.id);
    });

    // long-press to edit label (iPad)
    attachLongPress(label, () => {
      selectEdge(e.id);
      const next = prompt("Etichetta della relazione:", e.label ?? "");
      if (next === null) return;
      e.label = next.trim() || e.label;
      saveLocal();
      render();
    });

    if (state.ui.selected?.type === "edge" && state.ui.selected.id === e.id){
      g.classList.add("edge-selected");
    }

    g.append(path, hit, label);
    edgesSvg.appendChild(g);
  }
}

function svgEl(tag){ return document.createElementNS("http://www.w3.org/2000/svg", tag); }

function edgePath(a,b){
  const ax = a.x + (a.w/2);
  const ay = a.y + nodeH(a);
  const bx = b.x + (b.w/2);
  const by = b.y;

  const dx = bx - ax;
  const dy = by - ay;
  const c1x = ax + dx*0.25;
  const c1y = ay + dy*0.12;
  const c2x = ax + dx*0.75;
  const c2y = ay + dy*0.88;

  return `M ${ax} ${ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`;
}
function edgeMid(a,b){
  const ax = a.x + (a.w/2);
  const ay = a.y + nodeH(a);
  const bx = b.x + (b.w/2);
  const by = b.y;
  return { x:(ax+bx)/2, y:(ay+by)/2 };
}
function nodeH(n){ return (n.type==="image") ? 240 : 76; }

/* ---------- Selection ---------- */
function selectNode(id){
  state.ui.selected = {type:"node", id};
  state.ui.linkFrom = null;
  saveLocal();
  render();
}
function selectEdge(id){
  state.ui.selected = {type:"edge", id};
  state.ui.linkFrom = null;
  saveLocal();
  render();
}
function clearSelection(){
  state.ui.selected = null;
  state.ui.linkFrom = null;
  saveLocal();
  render();
}
function getNode(id){ return state.nodes.find(n=>n.id===id); }
function getEdge(id){ return state.edges.find(e=>e.id===id); }

/* ---------- Tools ---------- */
function setTool(name){
  state.ui.tool = name;
  state.ui.linkFrom = null;
  state.ui.createMode = null;
  state.ui.pendingImageDataUrl = null;

  [toolSelect, toolLink, toolPan].forEach(b=>b.classList.remove("active"));
  if (name==="select") toolSelect.classList.add("active");
  if (name==="link") toolLink.classList.add("active");
  if (name==="pan") toolPan.classList.add("active");

  saveLocal();
  render();
}

toolSelect.addEventListener("click", ()=>setTool("select"));
toolLink.addEventListener("click", ()=>setTool("link"));
toolPan.addEventListener("click", ()=>setTool("pan"));

/* ---------- Creation flow (tap-to-place) ---------- */
btnAddText.addEventListener("click", ()=>{
  state.ui.createMode = "text";
  state.ui.pendingImageDataUrl = null;
  toast("Ora tocca lo sfondo dove vuoi inserire il testo.");
  render();
});

fileAddImage.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  const dataUrl = await fileToDataURL(file);
  state.ui.createMode = "image";
  state.ui.pendingImageDataUrl = dataUrl;
  toast("Ora tocca lo sfondo dove vuoi inserire l’immagine.");
  render();
  e.target.value = "";
});

viewport.addEventListener("click", (e)=>{
  // if tap on empty background, handle create or clear selection
  const targetIsNode = e.target.closest?.(".node");
  const targetIsEdgeLabel = e.target.closest?.(".edge-label");
  if (targetIsNode || targetIsEdgeLabel) return;

  if (state.ui.createMode === "text"){
    const p = screenToWorld(e.clientX, e.clientY);
    const n = makeTextNode("Nuovo concetto", p.x - 120, p.y - 38);
    state.nodes.push(n);
    state.ui.createMode = null;
    selectNode(n.id);
    toast("Nodo creato. Tieni premuto sul nodo per modificarlo.");
    return;
  }
  if (state.ui.createMode === "image" && state.ui.pendingImageDataUrl){
    const p = screenToWorld(e.clientX, e.clientY);
    const n = makeImageNode(state.ui.pendingImageDataUrl, p.x - 140, p.y - 120);
    state.nodes.push(n);
    state.ui.createMode = null;
    state.ui.pendingImageDataUrl = null;
    selectNode(n.id);
    toast("Immagine inserita. Tieni premuto per cambiare didascalia.");
    return;
  }

  clearSelection();
});

/* ---------- Linking flow ---------- */
function handleLinkTap(nodeId){
  if (!state.ui.linkFrom){
    state.ui.linkFrom = nodeId;
    toast("Ora tocca il secondo nodo.");
    render();
    return;
  }
  if (state.ui.linkFrom === nodeId) return;
  const exists = state.edges.some(e => e.from===state.ui.linkFrom && e.to===nodeId);
  if (!exists){
    const ed = makeEdge(state.ui.linkFrom, nodeId);
    state.edges.push(ed);
    selectEdge(ed.id);
    toast("Freccia creata. Selezionala per cambiare etichetta.");
  }
  state.ui.linkFrom = null;
  saveLocal();
  render();
}

/* ---------- Delete ---------- */
btnDelete.addEventListener("click", deleteSelected);

function deleteSelected(){
  const sel = state.ui.selected;
  if (!sel) return toast("Niente da eliminare.");
  if (sel.type === "node"){
    const id = sel.id;
    state.nodes = state.nodes.filter(n=>n.id!==id);
    state.edges = state.edges.filter(e=>e.from!==id && e.to!==id);
    toast("Nodo eliminato.");
  } else {
    state.edges = state.edges.filter(e=>e.id!==sel.id);
    toast("Freccia eliminata.");
  }
  state.ui.selected = null;
  saveLocal();
  render();
}

/* ---------- Drag node (one finger) ---------- */
let drag = { active:false, nodeId:null, start:{x:0,y:0}, orig:{x:0,y:0}, pointerId:null };

function onNodePointerDown(e){
  // only in select tool
  if (state.ui.tool !== "select") return;
  e.stopPropagation();

  const el = e.currentTarget;
  const id = el.dataset.id;
  selectNode(id);

  drag.active = true;
  drag.nodeId = id;
  drag.pointerId = e.pointerId;

  const p = screenToWorld(e.clientX, e.clientY);
  const n = getNode(id);
  drag.start = {x:p.x, y:p.y};
  drag.orig = {x:n.x, y:n.y};

  el.setPointerCapture?.(e.pointerId);
}

viewport.addEventListener("pointermove", (e)=>{
  if (!drag.active || drag.pointerId !== e.pointerId) return;
  const n = getNode(drag.nodeId);
  if (!n) return;
  const p = screenToWorld(e.clientX, e.clientY);
  const dx = p.x - drag.start.x;
  const dy = p.y - drag.start.y;
  n.x = drag.orig.x + dx;
  n.y = drag.orig.y + dy;
  render(); // keep it responsive
});
viewport.addEventListener("pointerup", (e)=>{
  if (drag.active && drag.pointerId === e.pointerId){
    drag.active = false;
    drag.nodeId = null;
    drag.pointerId = null;
    saveLocal();
    render();
  }
});
viewport.addEventListener("pointercancel", ()=>{
  drag.active = false;
  drag.nodeId = null;
  drag.pointerId = null;
});

/* ---------- Two-finger pan + pinch zoom (always) ---------- */
const pointers = new Map();
let gesture = null; // {type:"panpinch", startDist, startZoom, startTx, startTy, startMidX, startMidY}

viewport.addEventListener("pointerdown", (e)=>{
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  viewport.setPointerCapture?.(e.pointerId);

  if (pointers.size === 2){
    // start pan/pinch
    const pts = Array.from(pointers.values());
    const dist = distance(pts[0], pts[1]);
    const mid = midpoint(pts[0], pts[1]);
    gesture = {
      startDist: dist,
      startZoom: state.view.zoom,
      startTx: state.view.tx,
      startTy: state.view.ty,
      startMid: mid
    };
  }
});

viewport.addEventListener("pointermove", (e)=>{
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

  // If two pointers: pinch zoom + pan
  if (pointers.size === 2 && gesture){
    const pts = Array.from(pointers.values());
    const dist = distance(pts[0], pts[1]);
    const mid = midpoint(pts[0], pts[1]);

    const scale = dist / gesture.startDist;
    const newZoom = clamp(gesture.startZoom * scale, 0.25, 2.8);

    // Keep zoom anchored at current midpoint
    const rect = viewport.getBoundingClientRect();
    const mx = mid.x - rect.left;
    const my = mid.y - rect.top;

    const oldZoom = state.view.zoom;
    // update zoom first
    state.view.zoom = newZoom;
    // adjust translation so that point under midpoint stays under midpoint
    state.view.tx = mx - (mx - gesture.startTx) * (newZoom / gesture.startZoom);
    state.view.ty = my - (my - gesture.startTy) * (newZoom / gesture.startZoom);

    // also allow two-finger pan by movement of midpoint
    const dx = (mid.x - gesture.startMid.x);
    const dy = (mid.y - gesture.startMid.y);
    state.view.tx += dx;
    state.view.ty += dy;

    applyView();
    renderEdges(); // cheaper update; nodes move by transform
    chipZoom.textContent = `${Math.round(state.view.zoom*100)}%`;
  }
});

viewport.addEventListener("pointerup", (e)=>{
  pointers.delete(e.pointerId);
  if (pointers.size < 2){
    gesture = null;
  }
  saveLocal();
});
viewport.addEventListener("pointercancel", (e)=>{
  pointers.delete(e.pointerId);
  if (pointers.size < 2) gesture = null;
});

/* Pan tool one-finger pan on background */
let panDrag = {active:false, startX:0, startY:0, startTx:0, startTy:0, pid:null};

viewport.addEventListener("pointerdown", (e)=>{
  // start one-finger pan ONLY when:
  // - tool is pan
  // - pointer count is 1
  // - not on node
  if (state.ui.tool !== "pan") return;
  if (pointers.size !== 1) return;
  if (e.target.closest?.(".node")) return;

  panDrag.active = true;
  panDrag.pid = e.pointerId;
  panDrag.startX = e.clientX;
  panDrag.startY = e.clientY;
  panDrag.startTx = state.view.tx;
  panDrag.startTy = state.view.ty;
});

viewport.addEventListener("pointermove", (e)=>{
  if (!panDrag.active || panDrag.pid !== e.pointerId) return;
  // if second finger appears, ignore (handled by pinch)
  if (pointers.size >= 2) return;
  const dx = e.clientX - panDrag.startX;
  const dy = e.clientY - panDrag.startY;
  state.view.tx = panDrag.startTx + dx;
  state.view.ty = panDrag.startTy + dy;
  applyView();
  renderEdges();
});
viewport.addEventListener("pointerup", (e)=>{
  if (panDrag.active && panDrag.pid === e.pointerId){
    panDrag.active = false;
    panDrag.pid = null;
    saveLocal();
    render();
  }
});

/* ---------- Center view ---------- */
btnCenter.addEventListener("click", ()=>{
  state.view.tx = viewport.clientWidth/2;
  state.view.ty = viewport.clientHeight/2;
  state.view.zoom = 1;
  saveLocal();
  render();
});

/* ---------- Inspector ---------- */
function renderInspector(){
  const sel = state.ui.selected;
  if (!sel){
    inspSub.textContent = "Nessuna selezione";
    inspBody.innerHTML = `<div class="empty">Seleziona un nodo o una freccia per modificarla.</div>`;
    return;
  }

  if (sel.type === "node"){
    const n = getNode(sel.id);
    if (!n) return;

    inspSub.textContent = `Nodo • ${n.type==="text" ? "testo":"immagine"}`;
    if (n.type === "text"){
      inspBody.innerHTML = `
        <div class="field">
          <label>Testo</label>
          <textarea id="fText"></textarea>
        </div>
        <div class="field">
          <label>Colore riempimento</label>
          <input type="color" id="fFill" />
        </div>
        <div class="field">
          <label>Colore bordo</label>
          <input type="color" id="fStroke" />
        </div>
        <div class="field">
          <label>Colore testo</label>
          <input type="color" id="fTextColor" />
        </div>
        <div class="field">
          <label>Larghezza</label>
          <input type="range" id="fWidth" min="160" max="520" />
        </div>
      `;
      $("#fText").value = n.text ?? "";
      $("#fFill").value = toHex(n.colors.fill, "#ffffff");
      $("#fStroke").value = toHex(n.colors.stroke, "#ffffff");
      $("#fTextColor").value = toHex(n.colors.text, "#ffffff");
      $("#fWidth").value = String(n.w ?? 240);

      $("#fText").addEventListener("input", (e)=>{ n.text = e.target.value; saveLocal(); render(); });
      $("#fFill").addEventListener("input", (e)=>{ n.colors.fill = e.target.value; saveLocal(); render(); });
      $("#fStroke").addEventListener("input", (e)=>{ n.colors.stroke = e.target.value; saveLocal(); render(); });
      $("#fTextColor").addEventListener("input", (e)=>{ n.colors.text = e.target.value; saveLocal(); render(); });
      $("#fWidth").addEventListener("input", (e)=>{ n.w = Number(e.target.value); saveLocal(); render(); });
    } else {
      inspBody.innerHTML = `
        <div class="field">
          <label>Didascalia</label>
          <textarea id="fCap"></textarea>
        </div>
        <div class="field">
          <label>Larghezza</label>
          <input type="range" id="fWidth" min="180" max="720" />
        </div>
        <div class="field">
          <label>Sostituisci immagine</label>
          <input type="file" id="fImg" accept="image/*" />
        </div>
      `;
      $("#fCap").value = n.caption ?? "";
      $("#fWidth").value = String(n.w ?? 280);

      $("#fCap").addEventListener("input", (e)=>{ n.caption = e.target.value; saveLocal(); render(); });
      $("#fWidth").addEventListener("input", (e)=>{ n.w = Number(e.target.value); saveLocal(); render(); });
      $("#fImg").addEventListener("change", async (e)=>{
        const f = e.target.files?.[0];
        if (!f) return;
        n.dataUrl = await fileToDataURL(f);
        saveLocal();
        render();
        e.target.value = "";
      });
    }
    return;
  }

  if (sel.type === "edge"){
    const ed = getEdge(sel.id);
    if (!ed) return;
    inspSub.textContent = "Freccia";
    inspBody.innerHTML = `
      <div class="field">
        <label>Etichetta</label>
        <input type="text" id="fLabel" />
      </div>
      <div class="field">
        <label>Inverti direzione</label>
        <button id="btnReverse" style="padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);color:var(--text);font-weight:950;">Inverti</button>
      </div>
    `;
    $("#fLabel").value = ed.label ?? "";
    $("#fLabel").addEventListener("input", (e)=>{ ed.label = e.target.value; saveLocal(); render(); });
    $("#btnReverse").addEventListener("click", ()=>{
      const t = ed.from; ed.from = ed.to; ed.to = t;
      saveLocal(); render();
    });
  }
}

/* ---------- Save/Load ---------- */
btnSave.addEventListener("click", ()=>{ saveLocal(); toast("Salvato."); });
btnLoad.addEventListener("click", ()=>{
  const loaded = loadLocal();
  if (!loaded) return toast("Nessun salvataggio.");
  state = loaded;
  toast("Caricato.");
  render();
});
btnExport.addEventListener("click", exportJSON);
fileImport.addEventListener("change", importJSON);

function saveLocal(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){}
}
function loadLocal(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  downloadBlob(blob, "mappa-ipad.json");
}
function importJSON(e){
  const file = e.target.files?.[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      state = JSON.parse(fr.result);
      state.ui = state.ui || defaultState().ui;
      toast("Import riuscito.");
      saveLocal();
      render();
    }catch(err){
      toast("JSON non valido.");
    }
  };
  fr.readAsText(file);
  e.target.value = "";
}
function downloadBlob(blob, filename){
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1200);
}

/* ---------- Helpers ---------- */
function fileToDataURL(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
function toHex(v, fallback){
  if (!v) return fallback;
  if (v.startsWith("#")) return v;
  const m = v.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return fallback;
  const r = Number(m[1]).toString(16).padStart(2,"0");
  const g = Number(m[2]).toString(16).padStart(2,"0");
  const b = Number(m[3]).toString(16).padStart(2,"0");
  return `#${r}${g}${b}`;
}
function distance(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function midpoint(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }

/* Long press helper */
function attachLongPress(el, cb){
  let timer = null;
  const start = (e)=>{
    // ignore if multitouch gesture
    if (pointers.size >= 2) return;
    timer = setTimeout(()=>cb(e), 650);
  };
  const cancel = ()=>{ if (timer){ clearTimeout(timer); timer = null; } };

  el.addEventListener("pointerdown", start);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointermove", cancel);
}

/* ---------- Init ---------- */
initView();
setTool(state.ui.tool || "select");
render();
saveLocal();

