
/* Editor Mappe Concettuali — libero
   - Nodi testo + nodi immagine
   - Spazio virtualmente infinito (pan + zoom)
   - Collegamenti tra nodi (freccia + etichetta)
   - Selezione, trascinamento, delete
   - Inspector proprietà
   - Salva/Carica LocalStorage + JSON import/export
*/

const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const uid = ()=>Math.random().toString(16).slice(2)+Date.now().toString(16);

const stage = $("#stage");
const viewport = $("#viewport");
const nodesEl = $("#nodes");
const edgesSvg = $("#edges");
const zoomVal = $("#zoomVal");
const toastEl = $("#toast");

const toolSelect = $("#toolSelect");
const toolPan = $("#toolPan");
const toolLink = $("#toolLink");

const btnAddText = $("#btnAddText");
const fileAddImage = $("#fileAddImage");
const btnDelete = $("#btnDelete");

const btnSave = $("#btnSave");
const btnLoad = $("#btnLoad");
const btnExport = $("#btnExport");
const fileImport = $("#fileImport");

const btnZoomIn = $("#btnZoomIn");
const btnZoomOut = $("#btnZoomOut");
const btnResetView = $("#btnResetView");

const inspSub = $("#inspSub");
const inspBody = $("#inspBody");

const LS_KEY = "concept_map_free_v1";

let state = loadLocal() ?? defaultState();

function defaultState(){
  return {
    version: 1,
    view: { tx: 0, ty: 0, zoom: 1 },
    nodes: [
      makeTextNode("CONCETTO PRINCIPALE", 0, 0, {fill:"#f3e79b", stroke:"#e8d36c", text:"#1f232e"})
    ],
    edges: [],
    ui: {
      tool: "select",
      selected: null, // {type:"node", id} or {type:"edge", id}
      linkFrom: null,
      spacePan: false
    }
  };
}

function makeTextNode(text, x, y, colors){
  return {
    id: uid(),
    type: "text",
    x, y,
    w: 220,
    text: text ?? "Concetto",
    colors: colors ?? {fill:"rgba(255,255,255,.06)", stroke:"rgba(255,255,255,.18)", text:"#e7e9ee"}
  };
}
function makeImageNode(dataUrl, x, y){
  return {
    id: uid(),
    type: "image",
    x, y,
    w: 260,
    caption: "Didascalia (opzionale)",
    dataUrl
  };
}

function makeEdge(from, to){
  return { id: uid(), from, to, label: "relazione" };
}

/* ---------- View transform ---------- */
function applyView(){
  const {tx, ty, zoom} = state.view;
  const transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
  nodesEl.style.transform = transform;
  edgesSvg.style.transform = transform;
  zoomVal.textContent = `${Math.round(zoom*100)}%`;
}

/* ---------- Coordinate transforms ---------- */
function screenToWorld(clientX, clientY){
  const rect = viewport.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const {tx, ty, zoom} = state.view;
  return { x: (x - tx) / zoom, y: (y - ty) / zoom };
}
function worldToScreen(x, y){
  const rect = viewport.getBoundingClientRect();
  const {tx, ty, zoom} = state.view;
  return { x: rect.left + (x*zoom + tx), y: rect.top + (y*zoom + ty) };
}

/* ---------- Rendering ---------- */
function render(){
  applyView();
  renderNodes();
  renderEdges();
  renderInspector();
}

function renderNodes(){
  nodesEl.innerHTML = "";
  for (const n of state.nodes){
    const el = document.createElement("div");
    el.className = "node" + (n.type==="image" ? " image":"");
    el.dataset.id = n.id;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.width = `${n.w}px`;

    if (n.type === "text"){
      el.style.background = n.colors.fill;
      el.style.borderColor = n.colors.stroke;
      el.style.color = n.colors.text;

      el.innerHTML = `
        <div class="title"></div>
        <div class="badge">testo</div>
      `;
      el.querySelector(".title").textContent = n.text ?? "";
    } else {
      el.innerHTML = `
        <img alt="" />
        <div class="caption"></div>
        <div class="badge">immagine</div>
      `;
      el.querySelector("img").src = n.dataUrl;
      el.querySelector(".caption").textContent = n.caption ?? "";
    }

    if (state.ui.selected?.type === "node" && state.ui.selected.id === n.id){
      el.classList.add("selected");
    }

    el.addEventListener("pointerdown", onNodePointerDown);
    el.addEventListener("dblclick", () => {
      selectNode(n.id);
      if (n.type==="text"){
        const next = prompt("Testo del nodo:", n.text ?? "");
        if (next === null) return;
        n.text = next.trim() || n.text;
      } else {
        const next = prompt("Didascalia (opzionale):", n.caption ?? "");
        if (next === null) return;
        n.caption = next;
      }
      saveLocal();
      render();
    });

    el.addEventListener("click", (e)=>{
      e.stopPropagation();
      if (effectiveTool() === "link"){
        handleLinkClick(n.id);
      } else {
        selectNode(n.id);
      }
    });

    nodesEl.appendChild(el);
  }
}

function renderEdges(){
  edgesSvg.innerHTML = "";
  edgesSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // defs arrow
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

    const pathD = edgePath(a, b);
    const path = svgEl("path");
    path.setAttribute("d", pathD);
    path.setAttribute("class", "edge-path");

    const hit = svgEl("path");
    hit.setAttribute("d", pathD);
    hit.setAttribute("class", "edge-hit");
    hit.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      selectEdge(e.id);
    });

    const mid = edgeMid(a,b);
    const label = svgEl("text");
    label.setAttribute("x", mid.x);
    label.setAttribute("y", mid.y - 8);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "edge-label");
    label.textContent = e.label ?? "";
    label.addEventListener("click", (ev)=>{
      ev.stopPropagation();
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

function edgePath(a,b){
  // anchor points: bottom center of a -> top center of b (world coords are node top-left)
  const ax = a.x + (a.w/2);
  const ay = a.y + nodeH(a);
  const bx = b.x + (b.w/2);
  const by = b.y;

  // nice curve
  const dx = bx - ax;
  const dy = by - ay;
  const c1x = ax + dx*0.25;
  const c1y = ay + dy*0.15;
  const c2x = ax + dx*0.75;
  const c2y = ay + dy*0.85;

  return `M ${ax} ${ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`;
}

function edgeMid(a,b){
  const ax = a.x + (a.w/2);
  const ay = a.y + nodeH(a);
  const bx = b.x + (b.w/2);
  const by = b.y;
  return { x:(ax+bx)/2, y:(ay+by)/2 };
}

function nodeH(n){
  // approximate: depends on type
  return (n.type === "image") ? 220 : 70;
}

function svgEl(tag){
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

/* ---------- Tools ---------- */
function setTool(name){
  state.ui.tool = name;
  state.ui.linkFrom = null;

  [toolSelect, toolPan, toolLink].forEach(b=>b.classList.remove("active"));
  if (name==="select") toolSelect.classList.add("active");
  if (name==="pan") toolPan.classList.add("active");
  if (name==="link") toolLink.classList.add("active");

  viewport.style.cursor = (effectiveTool()==="pan") ? "grab" : "default";
  renderInspector();
}

function effectiveTool(){
  return state.ui.spacePan ? "pan" : state.ui.tool;
}

toolSelect.addEventListener("click", ()=>setTool("select"));
toolPan.addEventListener("click", ()=>setTool("pan"));
toolLink.addEventListener("click", ()=>setTool("link"));

/* Spacebar temporary pan */
window.addEventListener("keydown", (e)=>{
  if (e.code === "Space"){
    if (!state.ui.spacePan){
      state.ui.spacePan = true;
      viewport.style.cursor = "grab";
    }
  }
  if (e.code === "Delete"){
    deleteSelected();
  }
});
window.addEventListener("keyup", (e)=>{
  if (e.code === "Space"){
    state.ui.spacePan = false;
    viewport.style.cursor = (effectiveTool()==="pan") ? "grab" : "default";
  }
});

/* ---------- Selection ---------- */
function selectNode(id){
  state.ui.selected = {type:"node", id};
  state.ui.linkFrom = null;
  render();
}
function selectEdge(id){
  state.ui.selected = {type:"edge", id};
  state.ui.linkFrom = null;
  render();
}
function clearSelection(){
  state.ui.selected = null;
  state.ui.linkFrom = null;
  render();
}
viewport.addEventListener("click", ()=>clearSelection());

function getNode(id){ return state.nodes.find(n=>n.id===id); }
function getEdge(id){ return state.edges.find(e=>e.id===id); }

/* ---------- Linking ---------- */
function handleLinkClick(nodeId){
  if (!state.ui.linkFrom){
    state.ui.linkFrom = nodeId;
    toast("Seleziona il secondo nodo per creare la freccia.");
    return;
  }
  if (state.ui.linkFrom === nodeId) return;
  // avoid duplicates
  const exists = state.edges.some(e => e.from===state.ui.linkFrom && e.to===nodeId);
  if (!exists){
    const e = makeEdge(state.ui.linkFrom, nodeId);
    state.edges.push(e);
    selectEdge(e.id);
    saveLocal();
    toast("Collegamento creato. Clic sull’etichetta per cambiarla.");
  }
  state.ui.linkFrom = null;
  render();
}

/* ---------- Add nodes ---------- */
btnAddText.addEventListener("click", ()=>{
  const center = screenToWorld(viewport.getBoundingClientRect().left + viewport.clientWidth/2,
                               viewport.getBoundingClientRect().top + viewport.clientHeight/2);
  const n = makeTextNode("Nuovo concetto", center.x - 110, center.y - 35);
  state.nodes.push(n);
  selectNode(n.id);
  saveLocal();
  render();
});

fileAddImage.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  const dataUrl = await fileToDataURL(file);
  const center = screenToWorld(viewport.getBoundingClientRect().left + viewport.clientWidth/2,
                               viewport.getBoundingClientRect().top + viewport.clientHeight/2);
  const n = makeImageNode(dataUrl, center.x - 130, center.y - 110);
  state.nodes.push(n);
  selectNode(n.id);
  saveLocal();
  render();
  e.target.value = "";
});

function fileToDataURL(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
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

/* ---------- Drag nodes and pan background ---------- */
let drag = { active:false, kind:null, id:null, startX:0, startY:0, origX:0, origY:0 };

function onNodePointerDown(e){
  e.stopPropagation();

  const id = e.currentTarget.dataset.id;
  if (effectiveTool() === "pan") return; // pan ignores node drag
  if (effectiveTool() === "link") return; // linking handled by click

  selectNode(id);

  drag.active = true;
  drag.kind = "node";
  drag.id = id;

  const pt = screenToWorld(e.clientX, e.clientY);
  const n = getNode(id);
  drag.startX = pt.x; drag.startY = pt.y;
  drag.origX = n.x; drag.origY = n.y;

  e.currentTarget.setPointerCapture?.(e.pointerId);
}

viewport.addEventListener("pointerdown", (e)=>{
  if (effectiveTool() !== "pan") return;
  drag.active = true;
  drag.kind = "pan";
  drag.startX = e.clientX;
  drag.startY = e.clientY;
  drag.origX = state.view.tx;
  drag.origY = state.view.ty;
  viewport.style.cursor = "grabbing";
  viewport.setPointerCapture?.(e.pointerId);
});

viewport.addEventListener("pointermove", (e)=>{
  if (!drag.active) return;

  if (drag.kind === "node"){
    const pt = screenToWorld(e.clientX, e.clientY);
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    const n = getNode(drag.id);
    if (!n) return;
    n.x = drag.origX + dx;
    n.y = drag.origY + dy;
    render();
  } else if (drag.kind === "pan"){
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    state.view.tx = drag.origX + dx;
    state.view.ty = drag.origY + dy;
    applyView();
  }
});

viewport.addEventListener("pointerup", ()=>{
  if (!drag.active) return;
  drag.active = false;
  if (drag.kind === "pan") viewport.style.cursor = "grab";
  drag.kind = null;
  saveLocal();
  render();
});
viewport.addEventListener("pointercancel", ()=>{
  drag.active = false;
  drag.kind = null;
  viewport.style.cursor = (effectiveTool()==="pan") ? "grab" : "default";
});

/* ---------- Zoom ---------- */
viewport.addEventListener("wheel", (e)=>{
  e.preventDefault();
  const zoomFactor = (e.deltaY < 0) ? 1.07 : 0.93;

  const oldZoom = state.view.zoom;
  const newZoom = clamp(oldZoom * zoomFactor, 0.25, 2.5);

  // zoom around mouse position
  const rect = viewport.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  state.view.tx = mx - (mx - state.view.tx) * (newZoom/oldZoom);
  state.view.ty = my - (my - state.view.ty) * (newZoom/oldZoom);
  state.view.zoom = newZoom;

  applyView();
  saveLocal();
}, {passive:false});

btnZoomIn.addEventListener("click", ()=>setZoom(state.view.zoom * 1.1));
btnZoomOut.addEventListener("click", ()=>setZoom(state.view.zoom * 0.9));
btnResetView.addEventListener("click", ()=>{
  state.view = {tx: viewport.clientWidth/2, ty: viewport.clientHeight/2, zoom: 1};
  saveLocal();
  render();
});

function setZoom(z){
  const oldZoom = state.view.zoom;
  const newZoom = clamp(z, 0.25, 2.5);
  // zoom centered
  const mx = viewport.clientWidth/2;
  const my = viewport.clientHeight/2;
  state.view.tx = mx - (mx - state.view.tx) * (newZoom/oldZoom);
  state.view.ty = my - (my - state.view.ty) * (newZoom/oldZoom);
  state.view.zoom = newZoom;
  saveLocal();
  render();
}

/* ---------- Inspector ---------- */
function renderInspector(){
  const sel = state.ui.selected;
  if (!sel){
    inspSub.textContent = "Nessuna selezione";
    inspBody.innerHTML = `<div class="empty">Seleziona un nodo o una freccia per modificare testo, colori, etichette, immagini.</div>`;
    return;
  }

  if (sel.type === "node"){
    const n = getNode(sel.id);
    if (!n) return;

    inspSub.textContent = `Nodo • ${n.type === "text" ? "testo" : "immagine"}`;
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
          <label>Larghezza nodo</label>
          <input type="range" id="fWidth" min="140" max="420" />
          <div class="chip" id="fWidthVal"></div>
        </div>
      `;
      $("#fText").value = n.text ?? "";
      $("#fFill").value = toHex(n.colors.fill, "#ffffff");
      $("#fStroke").value = toHex(n.colors.stroke, "#ffffff");
      $("#fTextColor").value = toHex(n.colors.text, "#ffffff");
      $("#fWidth").value = String(n.w ?? 220);
      $("#fWidthVal").textContent = `${n.w}px`;

      $("#fText").addEventListener("input", (e)=>{ n.text = e.target.value; render(); saveLocal(); });
      $("#fFill").addEventListener("input", (e)=>{ n.colors.fill = e.target.value; render(); saveLocal(); });
      $("#fStroke").addEventListener("input", (e)=>{ n.colors.stroke = e.target.value; render(); saveLocal(); });
      $("#fTextColor").addEventListener("input", (e)=>{ n.colors.text = e.target.value; render(); saveLocal(); });
      $("#fWidth").addEventListener("input", (e)=>{ n.w = Number(e.target.value); $("#fWidthVal").textContent = `${n.w}px`; render(); saveLocal(); });
    } else {
      inspBody.innerHTML = `
        <div class="field">
          <label>Didascalia</label>
          <textarea id="fCaption"></textarea>
        </div>
        <div class="field">
          <label>Larghezza immagine</label>
          <input type="range" id="fWidth" min="160" max="520" />
          <div class="chip" id="fWidthVal"></div>
        </div>
        <div class="field">
          <label>Sostituisci immagine</label>
          <input type="file" id="fImg" accept="image/*" />
        </div>
      `;
      $("#fCaption").value = n.caption ?? "";
      $("#fWidth").value = String(n.w ?? 260);
      $("#fWidthVal").textContent = `${n.w}px`;

      $("#fCaption").addEventListener("input", (e)=>{ n.caption = e.target.value; render(); saveLocal(); });
      $("#fWidth").addEventListener("input", (e)=>{ n.w = Number(e.target.value); $("#fWidthVal").textContent = `${n.w}px`; render(); saveLocal(); });
      $("#fImg").addEventListener("change", async (e)=>{
        const file = e.target.files?.[0];
        if (!file) return;
        n.dataUrl = await fileToDataURL(file);
        saveLocal();
        render();
        e.target.value = "";
      });
    }
  } else {
    const ed = getEdge(sel.id);
    if (!ed) return;

    inspSub.textContent = "Freccia";
    inspBody.innerHTML = `
      <div class="field">
        <label>Etichetta</label>
        <input type="text" id="fLabel" />
      </div>
      <div class="field">
        <label>Da</label>
        <div class="chip" id="fFrom"></div>
      </div>
      <div class="field">
        <label>A</label>
        <div class="chip" id="fTo"></div>
      </div>
      <div class="row">
        <button class="btn" id="btnReverse">Inverti</button>
      </div>
    `;
    $("#fLabel").value = ed.label ?? "";
    $("#fFrom").textContent = nodeTitle(ed.from);
    $("#fTo").textContent = nodeTitle(ed.to);

    $("#fLabel").addEventListener("input", (e)=>{ ed.label = e.target.value; render(); saveLocal(); });
    $("#btnReverse").addEventListener("click", ()=>{
      const tmp = ed.from; ed.from = ed.to; ed.to = tmp;
      saveLocal(); render();
    });
  }
}

function nodeTitle(id){
  const n = getNode(id);
  if (!n) return "(mancante)";
  return n.type==="text" ? (n.text ?? "Nodo") : (n.caption ?? "Immagine");
}

/* Convert CSS rgba/hex to #RRGGBB best effort */
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

/* ---------- Save/Load/Export ---------- */
btnSave.addEventListener("click", ()=>{ saveLocal(); toast("Salvato nel browser."); });
btnLoad.addEventListener("click", ()=>{
  const loaded = loadLocal();
  if (!loaded) return toast("Nessun salvataggio trovato.");
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
  downloadBlob(blob, "mappa-libera.json");
}
function importJSON(e){
  const file = e.target.files?.[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      const obj = JSON.parse(fr.result);
      state = obj;
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

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toastEl.classList.remove("show"), 1600);
}

/* ---------- Init view ---------- */
function initView(){
  // center origin in middle of viewport
  state.view.tx = viewport.clientWidth/2;
  state.view.ty = viewport.clientHeight/2;
  state.view.zoom = state.view.zoom || 1;
}
window.addEventListener("resize", ()=>{
  // keep view; just re-render
  render();
});

initView();
setTool(state.ui.tool || "select");
render();
saveLocal();
