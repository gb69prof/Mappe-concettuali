
/* Costruttore Mappe Concettuali — Libera edition
   - Wizard in 3 step
   - Rendering in SVG
   - Drag nodes, rename on dblclick
   - Click edge label to edit
   - Export SVG/PNG + JSON save/load
*/

const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

const elCanvas = $("#canvas");
const elPill = $("#pillMode");

const steps = $$("#steps .step");
function showStep(n){
  steps.forEach(s => s.classList.toggle("active", Number(s.dataset.step) === n));
  state.ui.step = n;
  render();
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

const palette = {
  yellow: { fill:"#f3e79b", stroke:"#e8d36c", text:"#1f232e" },
  blue:   { fill:"#b9d2ff", stroke:"#89b2ff", text:"#141a26" },
  green:  { fill:"#b9f2d8", stroke:"#6ce5bd", text:"#10201b" },
  gray:   { fill:"#d6d9e3", stroke:"#aeb6c9", text:"#141a26" },
  pink:   { fill:"#ffd0e6", stroke:"#ff90c4", text:"#24111c" },
};

const edgeColors = ["#4aa3ff", "#51e0c3", "#ffb84d", "#ff6b6b", "#b27cff"];

function defaultModel(){
  return {
    version: 1,
    root: {
      id: uid(),
      text: "CONCETTO PRINCIPALE",
      color: "yellow",
      x: 520, y: 110,
      w: 260, h: 64
    },
    rootRelation: "formato da",
    branches: [
      makeBranch("CONCETTO 1", "blue", 330, 240),
      makeBranch("CONCETTO 2", "green", 710, 240)
    ],
    ui: {
      step: 1,
      activeBranch: 0,
      curves: false,
      grid: true,
      drag: true
    }
  };
}

function makeBranch(text, color, x, y){
  return {
    id: uid(),
    text,
    color,
    x, y,
    w: 190, h: 54,
    relation: "composto da",
    subs: [
      makeSub("A", x - 70, y + 120),
      makeSub("B", x + 70, y + 120)
    ]
  };
}
function makeSub(text, x, y){
  return { id: uid(), text, x, y, w: 64, h: 44 };
}

let state = loadFromLocal() ?? defaultModel();

function syncUIFromState(){
  $("#rootText").value = state.root.text;
  $("#rootColor").value = state.root.color;

  $("#branchCount").value = String(state.branches.length);
  // set preset or custom
  const preset = ["formato da","composto da","si divide in","dipende da"];
  if (preset.includes(state.rootRelation)){
    $("#rootRelationPreset").value = state.rootRelation;
    $("#rootRelationCustomWrap").style.display = "none";
  } else {
    $("#rootRelationPreset").value = "custom";
    $("#rootRelationCustomWrap").style.display = "block";
    $("#rootRelationCustom").value = state.rootRelation;
  }

  $("#toggleGrid").checked = !!state.ui.grid;
  $("#toggleCurves").checked = !!state.ui.curves;
  $("#toggleDrag").checked = !!state.ui.drag;

  showStep(state.ui.step);
  buildBranchEditor();
}

function setBranchCount(n){
  n = clamp(n, 1, 3);
  const current = state.branches.length;
  if (n === current) return;

  if (n > current){
    for (let i=current; i<n; i++){
      const x = 520 + (i - (n-1)/2) * 300;
      const y = 240;
      const color = (i % 2 === 0) ? "blue" : "green";
      state.branches.push(makeBranch(`CONCETTO ${i+1}`, color, x, y));
    }
  } else {
    state.branches = state.branches.slice(0, n);
    state.ui.activeBranch = clamp(state.ui.activeBranch, 0, n-1);
  }
  autoLayout();
  buildBranchEditor();
  render();
}

function autoLayout(){
  // place root centered based on canvas size
  const rect = elCanvas.getBoundingClientRect();
  const W = rect.width || 1100;
  const H = rect.height || 700;
  state.root.x = W/2;
  state.root.y = 110;

  const n = state.branches.length;
  const spread = Math.min(320, (W-240) / Math.max(1,n-1));
  const startX = (W/2) - spread*(n-1)/2;
  for (let i=0; i<n; i++){
    const b = state.branches[i];
    b.x = startX + spread*i;
    b.y = 260;
    // subs under each branch
    const m = b.subs.length;
    const subSpread = Math.min(120, (W/n) / Math.max(1,m-1));
    const sStart = b.x - subSpread*(m-1)/2;
    for (let j=0; j<m; j++){
      b.subs[j].x = sStart + subSpread*j;
      b.subs[j].y = b.y + 140;
    }
  }
}

function buildBranchEditor(){
  const tabs = $("#branchTabs");
  const editor = $("#branchEditor");
  tabs.innerHTML = "";
  editor.innerHTML = "";

  const n = state.branches.length;
  for (let i=0;i<n;i++){
    const t = document.createElement("button");
    t.className = "tab" + (i===state.ui.activeBranch ? " active":"");
    t.textContent = `Ramo ${i+1}`;
    t.addEventListener("click", () => {
      state.ui.activeBranch = i;
      buildBranchEditor();
      render();
    });
    tabs.appendChild(t);
  }

  const b = state.branches[state.ui.activeBranch] ?? state.branches[0];
  if (!b) return;

  editor.appendChild(branchBlock(b));
}

function branchBlock(b){
  const wrap = document.createElement("div");
  wrap.className = "block";

  const f1 = fieldInput("Concetto (testo)", b.text, v => { b.text=v; render(); });
  const f2 = fieldSelect("Colore", b.color, [
    ["blue","Blu"],["green","Verde"],["yellow","Giallo"],["gray","Grigio"],["pink","Rosa"]
  ], v => { b.color=v; render(); });

  const f3 = fieldSelect("Relazione verso sotto-concetti", b.relation, [
    ["composto da","composto da"],
    ["si divide in","si divide in"],
    ["contiene","contiene"],
    ["porta a","porta a"],
    ["custom","personalizzata…"]
  ], v => {
    if (v==="custom"){
      b.relation = (b.relation && b.relation!=="custom") ? b.relation : "relazione";
    } else {
      b.relation = v;
    }
    buildBranchEditor();
    render();
  });

  const isCustom = !["composto da","si divide in","contiene","porta a"].includes(b.relation);
  const f4 = fieldInput("Relazione personalizzata", b.relation, v => { b.relation=v; render(); });
  f4.classList.add("wide");
  f4.style.display = isCustom ? "flex" : "none";

  const f5 = fieldTextarea("Sotto-concetti (uno per riga)", b.subs.map(s=>s.text).join("\n"), v => {
    const lines = v.split("\n").map(s=>s.trim()).filter(Boolean);
    if (lines.length === 0) lines.push("A");
    // keep positions if possible
    const old = b.subs;
    b.subs = lines.map((txt, idx) => {
      const prev = old[idx];
      return prev ? ({...prev, text: txt}) : makeSub(txt, b.x + idx*70, b.y + 140);
    });
    autoLayout();
    render();
  });
  f5.classList.add("wide");

  wrap.append(f1,f2,f3,f4,f5);
  return wrap;
}

function fieldInput(label, value, onInput){
  const l = document.createElement("label");
  l.className = "field";
  const s = document.createElement("span"); s.textContent = label;
  const i = document.createElement("input");
  i.type = "text";
  i.value = value ?? "";
  i.addEventListener("input", () => onInput(i.value));
  l.append(s,i);
  return l;
}
function fieldTextarea(label, value, onInput){
  const l = document.createElement("label");
  l.className = "field";
  const s = document.createElement("span"); s.textContent = label;
  const t = document.createElement("textarea");
  t.value = value ?? "";
  t.addEventListener("input", () => onInput(t.value));
  l.append(s,t);
  return l;
}
function fieldSelect(label, value, options, onChange){
  const l = document.createElement("label");
  l.className = "field";
  const s = document.createElement("span"); s.textContent = label;
  const sel = document.createElement("select");
  for (const [v, txt] of options){
    const o = document.createElement("option");
    o.value = v; o.textContent = txt;
    sel.appendChild(o);
  }
  sel.value = value;
  sel.addEventListener("change", () => onChange(sel.value));
  l.append(s,sel);
  return l;
}

/* Wizard bindings */
$("#rootText").addEventListener("input", e => { state.root.text = e.target.value || "CONCETTO PRINCIPALE"; render(); });
$("#rootColor").addEventListener("change", e => { state.root.color = e.target.value; render(); });

$("#branchCount").addEventListener("change", e => setBranchCount(Number(e.target.value)));

$("#rootRelationPreset").addEventListener("change", e => {
  const v = e.target.value;
  if (v === "custom"){
    $("#rootRelationCustomWrap").style.display = "block";
    state.rootRelation = $("#rootRelationCustom").value || "relazione";
  } else {
    $("#rootRelationCustomWrap").style.display = "none";
    state.rootRelation = v;
  }
  render();
});
$("#rootRelationCustom").addEventListener("input", e => { state.rootRelation = e.target.value || "relazione"; render(); });

$$("#steps [data-next]").forEach(b => b.addEventListener("click", () => showStep(clamp(state.ui.step+1,1,3))));
$$("#steps [data-prev]").forEach(b => b.addEventListener("click", () => showStep(clamp(state.ui.step-1,1,3))));
$("#btnFinish").addEventListener("click", () => {
  // switch to "editor mode" but keep step 3; just label
  elPill.textContent = "Editor libero";
  elPill.style.color = "var(--text)";
  render();
});

/* Canvas toggles */
$("#toggleGrid").addEventListener("change", e => { state.ui.grid = e.target.checked; render(); });
$("#toggleCurves").addEventListener("change", e => { state.ui.curves = e.target.checked; render(); });
$("#toggleDrag").addEventListener("change", e => { state.ui.drag = e.target.checked; render(); });

/* Top actions */
$("#btnNew").addEventListener("click", () => {
  state = defaultModel();
  autoLayout();
  syncUIFromState();
  render();
});
$("#btnSave").addEventListener("click", () => { saveToLocal(); toast("Salvato nel browser."); });
$("#btnLoad").addEventListener("click", () => {
  const loaded = loadFromLocal();
  if (!loaded) return toast("Nessun salvataggio trovato.", true);
  state = loaded;
  syncUIFromState();
  render();
  toast("Caricato.");
});

$("#btnExportSVG").addEventListener("click", exportSVG);
$("#btnExportPNG").addEventListener("click", exportPNG);
$("#btnExportJSON").addEventListener("click", exportJSON);
$("#fileImport").addEventListener("change", importJSON);

/* Rendering */
let drag = { active:false, node:null, dx:0, dy:0 };

function render(){
  elCanvas.classList.toggle("show-grid", !!state.ui.grid);

  const rect = elCanvas.getBoundingClientRect();
  const W = rect.width || 1100;
  const H = rect.height || 700;

  // If first render, ensure layout fits current size
  if (!state._laidOut){
    autoLayout();
    state._laidOut = true;
  }

  const svg = buildSVG(W, H);
  elCanvas.innerHTML = "";
  elCanvas.appendChild(svg);

  // mode pill
  elPill.textContent = (state.ui.step < 3) ? "Wizard" : "Wizard / editor";
}

function buildSVG(W, H){
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);

  // defs: arrow marker
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(231,233,238,.75)"></path>
    </marker>
  `;
  svg.appendChild(defs);

  // background vignette overlay
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", 0); bg.setAttribute("y", 0);
  bg.setAttribute("width", W); bg.setAttribute("height", H);
  bg.setAttribute("fill", "transparent");
  svg.appendChild(bg);

  // edges
  // root -> branches
  state.branches.forEach((b, i) => {
    const col = edgeColors[i % edgeColors.length];
    const p = edgePath(state.root, b, !!state.ui.curves);
    svg.appendChild(edgeGroup(p, midPoint(state.root, b), state.rootRelation, col, () => editRootRelation()));
  });

  // branch -> subs
  state.branches.forEach((b, i) => {
    const col = edgeColors[(i+1) % edgeColors.length];
    b.subs.forEach((s, j) => {
      const p = edgePath(b, s, !!state.ui.curves);
      svg.appendChild(edgeGroup(p, midPoint(b, s), b.relation, col, () => editBranchRelation(i)));
    });
  });

  // nodes
  svg.appendChild(nodeRect(state.root, "root"));

  state.branches.forEach((b, i) => {
    svg.appendChild(nodeRect(b, `branch:${i}`));
    b.subs.forEach((s, j) => svg.appendChild(subRect(s, `sub:${i}:${j}`, b.color)));
  });

  // handlers for drag on SVG
  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);

  return svg;
}

function edgePath(a, b, curved){
  const ax = a.x, ay = a.y + a.h/2;
  const bx = b.x, by = b.y - b.h/2;
  const dx = bx - ax;
  const dy = by - ay;

  if (!curved){
    return `M ${ax} ${ay} L ${bx} ${by}`;
  }
  const c1x = ax + dx*0.25;
  const c1y = ay + dy*0.20;
  const c2x = ax + dx*0.75;
  const c2y = ay + dy*0.80;
  return `M ${ax} ${ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`;
}

function midPoint(a,b){
  const x = (a.x + b.x)/2;
  const y = (a.y + b.y)/2;
  return {x,y};
}

function edgeGroup(d, mid, label, color, onEdit){
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  path.setAttribute("class", "edge");
  path.setAttribute("stroke", color);
  path.setAttribute("marker-end", "url(#arrow)");

  const hit = document.createElementNS(ns, "path");
  hit.setAttribute("d", d);
  hit.setAttribute("class", "edge hit");
  hit.addEventListener("click", (e) => {
    e.stopPropagation();
    onEdit();
  });

  const t = document.createElementNS(ns, "text");
  t.setAttribute("x", mid.x);
  t.setAttribute("y", mid.y - 10);
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("class", "edge-label");
  t.textContent = label || "";
  t.style.cursor = "pointer";
  t.addEventListener("click", (e)=>{ e.stopPropagation(); onEdit(); });

  g.append(path, hit, t);
  return g;
}

function nodeRect(n, key){
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");
  const c = palette[n.color] ?? palette.yellow;

  const r = document.createElementNS(ns, "rect");
  r.setAttribute("x", n.x - n.w/2);
  r.setAttribute("y", n.y - n.h/2);
  r.setAttribute("width", n.w);
  r.setAttribute("height", n.h);
  r.setAttribute("rx", 18);
  r.setAttribute("fill", c.fill);
  r.setAttribute("stroke", c.stroke);
  r.setAttribute("stroke-width", 2.5);
  r.setAttribute("class", "node-rect");

  const text = document.createElementNS(ns, "text");
  text.setAttribute("x", n.x);
  text.setAttribute("y", n.y + 6);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("class", "node-text");
  text.setAttribute("fill", c.text);
  text.textContent = n.text || "";

  const hit = document.createElementNS(ns, "rect");
  hit.setAttribute("x", n.x - n.w/2);
  hit.setAttribute("y", n.y - n.h/2);
  hit.setAttribute("width", n.w);
  hit.setAttribute("height", n.h);
  hit.setAttribute("rx", 18);
  hit.setAttribute("class", "node-hit");
  hit.dataset.key = key;

  hit.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    renameNode(key);
  });

  g.append(r, text, hit);
  return g;
}

function subRect(s, key, parentColor){
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");

  // subtle fill matching parent color, but lighter
  const pc = palette[parentColor] ?? palette.blue;
  const fill = mix(pc.fill, "#ffffff", 0.35);
  const stroke = mix(pc.stroke, "#ffffff", 0.15);

  const r = document.createElementNS(ns, "rect");
  r.setAttribute("x", s.x - s.w/2);
  r.setAttribute("y", s.y - s.h/2);
  r.setAttribute("width", s.w);
  r.setAttribute("height", s.h);
  r.setAttribute("rx", 12);
  r.setAttribute("fill", fill);
  r.setAttribute("stroke", stroke);
  r.setAttribute("stroke-width", 2.2);
  r.setAttribute("class", "node-rect");

  const text = document.createElementNS(ns, "text");
  text.setAttribute("x", s.x);
  text.setAttribute("y", s.y + 6);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("class", "sub-text");
  text.setAttribute("fill", "#1b2333");
  text.textContent = s.text || "";

  const hit = document.createElementNS(ns, "rect");
  hit.setAttribute("x", s.x - s.w/2);
  hit.setAttribute("y", s.y - s.h/2);
  hit.setAttribute("width", s.w);
  hit.setAttribute("height", s.h);
  hit.setAttribute("rx", 12);
  hit.setAttribute("class", "node-hit");
  hit.dataset.key = key;
  hit.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    renameNode(key);
  });

  g.append(r, text, hit);
  return g;
}

function mix(hex1, hex2, t){
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  const c = {
    r: Math.round(a.r*(1-t) + b.r*t),
    g: Math.round(a.g*(1-t) + b.g*t),
    b: Math.round(a.b*(1-t) + b.b*t),
  };
  return rgbToHex(c);
}
function hexToRgb(hex){
  const h = hex.replace("#","").trim();
  const v = h.length===3 ? h.split("").map(x=>x+x).join("") : h;
  const n = parseInt(v, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgbToHex({r,g,b}){
  const f = (x)=>x.toString(16).padStart(2,"0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

/* Node editing */
function renameNode(key){
  const node = getNodeByKey(key);
  if (!node) return;
  const current = node.text ?? "";
  const next = prompt("Nuovo testo:", current);
  if (next === null) return;
  node.text = next.trim() || current;
  // sync to sidebar if needed
  syncUIFromState();
  render();
}

function editRootRelation(){
  const next = prompt("Etichetta della relazione (principale → rami):", state.rootRelation || "");
  if (next === null) return;
  state.rootRelation = next.trim() || state.rootRelation;
  syncUIFromState();
  render();
}
function editBranchRelation(i){
  const b = state.branches[i];
  const next = prompt(`Etichetta della relazione (ramo ${i+1} → sotto-concetti):`, b.relation || "");
  if (next === null) return;
  b.relation = next.trim() || b.relation;
  syncUIFromState();
  render();
}

function getNodeByKey(key){
  if (key === "root") return state.root;
  if (key.startsWith("branch:")){
    const i = Number(key.split(":")[1]);
    return state.branches[i];
  }
  if (key.startsWith("sub:")){
    const [, bi, si] = key.split(":");
    const b = state.branches[Number(bi)];
    return b?.subs?.[Number(si)];
  }
  return null;
}

/* Dragging */
function onPointerDown(e){
  if (!state.ui.drag) return;
  const hit = e.target.closest?.(".node-hit");
  if (!hit) return;
  const key = hit.dataset.key;
  const node = getNodeByKey(key);
  if (!node) return;

  drag.active = true;
  drag.node = node;
  hit.classList.add("dragging");

  // pointer pos in SVG coords
  const pt = svgPoint(e);
  drag.dx = node.x - pt.x;
  drag.dy = node.y - pt.y;

  e.target.setPointerCapture?.(e.pointerId);
}
function onPointerMove(e){
  if (!drag.active || !drag.node) return;
  const pt = svgPoint(e);
  drag.node.x = pt.x + drag.dx;
  drag.node.y = pt.y + drag.dy;
  render();
}
function onPointerUp(e){
  if (!drag.active) return;
  drag.active = false;
  drag.node = null;
  $$(".node-hit").forEach(n => n.classList.remove("dragging"));
  saveToLocal(); // keep positions
}

function svgPoint(e){
  const svg = elCanvas.querySelector("svg");
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const ctm = svg.getScreenCTM().inverse();
  const p = pt.matrixTransform(ctm);
  return {x:p.x, y:p.y};
}

/* Save/Load */
const LS_KEY = "concept_map_builder_v1";

function saveToLocal(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    return true;
  }catch(err){
    console.warn(err);
    return false;
  }
}
function loadFromLocal(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj;
  }catch(err){
    console.warn(err);
    return null;
  }
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  downloadBlob(blob, "mappa-concettuale.json");
}

function importJSON(e){
  const file = e.target.files?.[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try{
      const obj = JSON.parse(fr.result);
      state = obj;
      state.ui = state.ui || defaultModel().ui;
      state._laidOut = true;
      syncUIFromState();
      render();
      toast("Import riuscito.");
    }catch(err){
      toast("JSON non valido.", true);
    }
  };
  fr.readAsText(file);
  e.target.value = "";
}

function exportSVG(){
  const svg = elCanvas.querySelector("svg");
  const serialized = serializeSVG(svg);
  const blob = new Blob([serialized], {type:"image/svg+xml"});
  downloadBlob(blob, "mappa-concettuale.svg");
}

function exportPNG(){
  const svg = elCanvas.querySelector("svg");
  const serialized = serializeSVG(svg);
  const svgBlob = new Blob([serialized], {type:"image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const rect = elCanvas.getBoundingClientRect();
    const W = Math.max(1200, Math.round(rect.width));
    const H = Math.max(700, Math.round(rect.height));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    // background
    ctx.fillStyle = "#0b0c10";
    ctx.fillRect(0,0,W,H);
    // draw image
    ctx.drawImage(img, 0, 0, W, H);
    canvas.toBlob((blob)=>{
      downloadBlob(blob, "mappa-concettuale.png");
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.onerror = () => {
    toast("Errore export PNG.", true);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function serializeSVG(svg){
  // inline a few style attributes for better exports
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // ensure text rendering
  const style = document.createElementNS("http://www.w3.org/2000/svg","style");
  style.textContent = `
    .node-rect{ filter: drop-shadow(0 10px 14px rgba(0,0,0,.28)); }
    .node-text{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-weight:800; letter-spacing:.2px; }
    .sub-text{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-weight:800; }
    .edge-label{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-weight:750; fill: rgba(231,233,238,.78); }
    .edge{ stroke-width:3; fill:none; stroke-linecap:round; }
  `;
  clone.insertBefore(style, clone.firstChild);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
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

/* Toast */
let toastTimer = null;
function toast(msg, danger=false){
  let t = $("#_toast");
  if (!t){
    t = document.createElement("div");
    t.id = "_toast";
    t.style.position = "fixed";
    t.style.left = "50%";
    t.style.bottom = "18px";
    t.style.transform = "translateX(-50%)";
    t.style.padding = "10px 12px";
    t.style.borderRadius = "999px";
    t.style.border = "1px solid rgba(255,255,255,.14)";
    t.style.background = "rgba(0,0,0,.55)";
    t.style.color = "white";
    t.style.fontWeight = "750";
    t.style.fontSize = "13px";
    t.style.boxShadow = "0 12px 30px rgba(0,0,0,.35)";
    t.style.zIndex = "999";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.borderColor = danger ? "rgba(255,107,107,.55)" : "rgba(255,255,255,.14)";
  t.style.background = danger ? "rgba(80,0,0,.45)" : "rgba(0,0,0,.55)";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.remove(); }, 1800);
}

/* Init */
window.addEventListener("resize", () => {
  // keep relative positions; only re-render
  state._laidOut = true;
  render();
});

autoLayout();
syncUIFromState();
render();
saveToLocal();
