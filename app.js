
const fmt = (n, currency="FCFA") => new Intl.NumberFormat('fr-FR').format(n) + " " + currency;

// === Backend API (v3 + backend) ===
// Par défaut, le site essaie d’utiliser le backend sur le même domaine.
// Vous pouvez forcer une URL en ajoutant ?api=http://IP:PORT
function getApiBase(){
  try{
    const u = new URL(location.href);
    const api = u.searchParams.get("api");
    if(api) return api.replace(/\/$/,'');
  }catch(e){}
  return ""; // same origin
}
async function apiGet(path){
  const base = getApiBase();
  const url = (base?base:"") + path;
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error("API error");
  return await r.json();
}
async function apiAdmin(path, method, body, pin){
  const base = getApiBase();
  const url = (base?base:"") + path;
  const r = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-pin": pin
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if(!r.ok) throw new Error("API admin error");
  return await r.json();
}

const store = {

  keyProducts: "bdc_products_v3",
  keyCart: "bdc_cart_v3",
  keyAdmin: "bdc_admin_v3",
  async loadJSON(path){
    const r = await fetch(path, {cache:"no-store"});
    if(!r.ok) throw new Error("Impossible de charger "+path);
    return await r.json();
  },
  async getTaxonomy(){ return await this.loadJSON("data/taxonomy.json"); },
  async getProducts(){
    const local = localStorage.getItem(this.keyProducts);
    if(local){
      try { return JSON.parse(local); } catch(e){ /* ignore */ }
    }
    return await this.loadJSON("data/products.json");
  },
  saveProducts(products){ localStorage.setItem(this.keyProducts, JSON.stringify(products)); },
  getCart(){
    const raw = localStorage.getItem(this.keyCart);
    if(!raw) return {};
    try { return JSON.parse(raw) || {}; } catch(e){ return {}; }
  },
  saveCart(cart){ localStorage.setItem(this.keyCart, JSON.stringify(cart)); },
  getAdmin(){
    const raw = localStorage.getItem(this.keyAdmin);
    if(!raw) return {pin:null};
    try { return JSON.parse(raw) || {pin:null}; } catch(e){ return {pin:null}; }
  },
  saveAdmin(v){ localStorage.setItem(this.keyAdmin, JSON.stringify(v)); }
};

const ui = {
  toastTimer: null,
  toast(msg){
    const t = document.getElementById("toast");
    if(!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(()=> t.style.display="none", 2400);
  },
  setCartBadge(count){
    const b = document.getElementById("cartBadge");
    if(b) b.textContent = String(count);
  },
  openModal(id){ document.getElementById(id).style.display = "flex"; },
  closeModal(id){ document.getElementById(id).style.display = "none"; }
};

function cartCount(cart){ return Object.values(cart).reduce((a,b)=>a + (b?.qty||0), 0); }

function normalize(s){
  return (s||"").toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function productMatches(p, q){
  if(!q) return true;
  const needle = normalize(q);
  const hay = normalize([p.name,p.brand,p.description,p.rubrique,p.sous_rubrique,p.categorie].join(" "));
  return hay.includes(needle);
}
function escapeHtml(str){
  return (str||"").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function uniqueBrands(products){
  const set = new Set();
  products.forEach(p=> (p.brand||"").trim() && set.add(p.brand.trim()));
  return Array.from(set).sort((a,b)=>a.localeCompare(b, 'fr'));
}

function setLocked(locked){
  // When editing an existing product, default lock = true: only price/image/description.
  const ids = ["pBrand","pName","pRub","pSous","pCat"];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.disabled = locked;
    el.style.opacity = locked ? "0.7" : "1";
  });
  const note = document.getElementById("lockNote");
  if(note) note.style.display = locked ? "block" : "none";
  const tog = document.getElementById("unlockToggle");
  if(tog) tog.checked = !locked;
}

let TAX = null;
let PRODUCTS = [];
let DETAILS_ID = null;

function buildPills(taxonomy){
  const pills = document.getElementById("pills");
  pills.innerHTML = "";
  const all = document.createElement("button");
  all.className = "pill active";
  all.textContent = "Tout";
  all.dataset.rubrique = "";
  pills.appendChild(all);
  Object.keys(taxonomy).forEach(r=>{
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = r;
    b.dataset.rubrique = r;
    pills.appendChild(b);
  });
}
function setActivePill(rubrique){
  document.querySelectorAll(".pill").forEach(p=>{
    p.classList.toggle("active", (p.dataset.rubrique||"") === (rubrique||""));
  });
}
function buildFacetSelects(taxonomy){
  const rSel = document.getElementById("rubriqueSel");
  const sSel = document.getElementById("sousSel");
  const cSel = document.getElementById("catSel");

  rSel.innerHTML = `<option value="">Toutes les rubriques</option>`;
  Object.keys(taxonomy).forEach(r=>{
    rSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`);
  });

  const fillSous = (rubrique)=>{
    sSel.innerHTML = `<option value="">Toutes les sous-rubriques</option>`;
    cSel.innerHTML = `<option value="">Toutes les catégories</option>`;
    if(!rubrique) return;
    Object.keys(taxonomy[rubrique]||{}).forEach(s=>{
      sSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`);
    });
  };
  const fillCats = (rubrique, sous)=>{
    cSel.innerHTML = `<option value="">Toutes les catégories</option>`;
    if(!rubrique || !sous) return;
    (taxonomy[rubrique]?.[sous] || []).forEach(c=>{
      cSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
    });
  };

  rSel.addEventListener("change", ()=>{
    fillSous(rSel.value);
    setActivePill(rSel.value || "");
    render();
  });
  sSel.addEventListener("change", ()=>{
    fillCats(rSel.value, sSel.value);
    render();
  });
  cSel.addEventListener("change", render);

  fillSous("");
}

function productCard(p){
  const img = (p.images && p.images[0]) ? p.images[0] : "assets/p1.svg";
  return `
  <div class="card product">
    <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}">
    <div class="body">
      <div class="meta">
        <div class="cat">${escapeHtml(p.brand || "—")}</div>
        <div class="price">${fmt(p.price, p.currency || "FCFA")}</div>
      </div>
      <h4 class="name">${escapeHtml(p.name)}</h4>
      <div class="small">${escapeHtml(p.rubrique)} · ${escapeHtml(p.sous_rubrique)} · ${escapeHtml(p.categorie)}</div>
      <p class="desc">${escapeHtml(p.description || "")}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" data-action="details" data-id="${escapeHtml(p.id)}">Détails</button>
        <button class="btn primary" data-action="add" data-id="${escapeHtml(p.id)}">Ajouter au panier</button>
      </div>
    </div>
  </div>`;
}

function renderProducts(products){
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  grid.innerHTML = "";
  const list = products.filter(p=>p.active !== false);
  if(list.length === 0){
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  grid.innerHTML = list.map(productCard).join("");
}

function currentFilters(){
  return {
    q: document.getElementById("q").value || "",
    rubrique: document.getElementById("rubriqueSel").value || "",
    sous: document.getElementById("sousSel").value || "",
    cat: document.getElementById("catSel").value || "",
    brand: document.getElementById("brandSel").value || ""
  };
}

function applyFilters(){
  const f = currentFilters();
  let res = PRODUCTS.slice();

  res = res.filter(p=>productMatches(p, f.q));
  if(f.rubrique) res = res.filter(p=>p.rubrique === f.rubrique);
  if(f.sous) res = res.filter(p=>p.sous_rubrique === f.sous);
  if(f.cat) res = res.filter(p=>p.categorie === f.cat);
  if(f.brand) res = res.filter(p=>p.brand === f.brand);

  res.sort((a,b)=>
    (a.rubrique||"").localeCompare(b.rubrique||"", 'fr') ||
    (a.brand||"").localeCompare(b.brand||"", 'fr') ||
    (a.name||"").localeCompare(b.name||"", 'fr')
  );
  return res;
}

function render(){
  const list = applyFilters();
  renderProducts(list);
  const countEl = document.getElementById("count");
  if(countEl) countEl.textContent = `${list.length} produit(s)`;
}

function bindPills(){
  const pills = document.getElementById("pills");
  pills.addEventListener("click", (e)=>{
    const b = e.target.closest(".pill");
    if(!b) return;
    const r = b.dataset.rubrique || "";
    const rSel = document.getElementById("rubriqueSel");
    rSel.value = r;
    document.getElementById("sousSel").value = "";
    document.getElementById("catSel").value = "";
    buildFacetSelects(TAX);
    rSel.value = r;
    rSel.dispatchEvent(new Event("change"));
    setActivePill(r);
    render();
  });
}

function buildBrandSelect(products){
  const sel = document.getElementById("brandSel");
  if(!sel) return;
  const brands = uniqueBrands(products);
  sel.innerHTML = `<option value="">Toutes les marques</option>` + brands.map(b=>`<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  sel.addEventListener("change", render);
}

function buildBrandsPage(products){
  const wrap = document.getElementById("brandsList");
  if(!wrap) return;
  const brands = uniqueBrands(products);
  wrap.innerHTML = brands.map(b=>`
    <div class="card panel" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div>
        <div style="font-weight:950">${escapeHtml(b)}</div>
        <div class="small">Voir les produits de cette marque</div>
      </div>
      <button class="btn" data-brand="${escapeHtml(b)}">Explorer</button>
    </div>
  `).join("");
  wrap.addEventListener("click", (e)=>{
    const btn = e.target.closest("button[data-brand]");
    if(!btn) return;
    const b = btn.dataset.brand;
    location.href = `index.html#brand=${encodeURIComponent(b)}`;
  });
}

function syncFromHash(){
  const hash = location.hash || "";
  const m = hash.match(/brand=([^&]+)/);
  if(m){
    const brand = decodeURIComponent(m[1]);
    const sel = document.getElementById("brandSel");
    if(sel) sel.value = brand;
  }
}

function updateCartUI(){
  const cart = store.getCart();
  ui.setCartBadge(cartCount(cart));
  const lines = document.getElementById("cartLines");
  const subtotalEl = document.getElementById("subtotal");
  const totalEl = document.getElementById("total");

  const items = Object.values(cart);
  if(items.length === 0){
    lines.innerHTML = `<div class="notice">Votre panier est vide. Ajoutez un produit pour commencer.</div>`;
    subtotalEl.textContent = fmt(0);
    totalEl.textContent = fmt(0);
    return;
  }

  let subtotal = 0;
  lines.innerHTML = items.map(it=>{
    const p = PRODUCTS.find(x=>x.id===it.id);
    if(!p) return "";
    const img = (p.images && p.images[0]) ? p.images[0] : "assets/p1.svg";
    const lineTotal = (p.price||0) * (it.qty||1);
    subtotal += lineTotal;
    return `
      <div class="line">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}">
        <div>
          <div class="t">${escapeHtml(p.name)}</div>
          <div class="s">${escapeHtml(p.brand||"")} · ${fmt(p.price, p.currency||"FCFA")}</div>
          <div class="s">${escapeHtml(p.rubrique)} · ${escapeHtml(p.sous_rubrique)} · ${escapeHtml(p.categorie)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <div class="qty">
            <button data-cart="dec" data-id="${escapeHtml(p.id)}">−</button>
            <input value="${it.qty}" readonly>
            <button data-cart="inc" data-id="${escapeHtml(p.id)}">+</button>
          </div>
          <div style="font-weight:950">${fmt(lineTotal, p.currency||"FCFA")}</div>
          <button class="btn danger" data-cart="rm" data-id="${escapeHtml(p.id)}">Retirer</button>
        </div>
      </div>
    `;
  }).join("");

  subtotalEl.textContent = fmt(subtotal);
  totalEl.textContent = fmt(subtotal);
}

function addToCart(id){
  const p = PRODUCTS.find(x=>x.id===id);
  if(!p) return;
  const cart = store.getCart();
  if(!cart[id]) cart[id] = {id, qty:0};
  cart[id].qty += 1;
  store.saveCart(cart);
  updateCartUI();
  ui.toast("Ajouté au panier");
}

function openDetails(id){
  const p = PRODUCTS.find(x=>x.id===id);
  if(!p) return;
  DETAILS_ID = id;
  const body = document.getElementById("detailsBody");
  const img = (p.images && p.images[0]) ? p.images[0] : "assets/p1.svg";
  body.innerHTML = `
    <div class="grid2">
      <div class="card" style="overflow:hidden">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" style="width:100%;height:320px;object-fit:cover;background:#fff">
      </div>
      <div class="card panel">
        <div class="small">${escapeHtml(p.brand||"")}</div>
        <h2 style="margin:6px 0 10px">${escapeHtml(p.name)}</h2>
        <div style="font-weight:950;font-size:18px">${fmt(p.price, p.currency||"FCFA")}</div>
        <div class="small" style="margin-top:8px">${escapeHtml(p.rubrique)} · ${escapeHtml(p.sous_rubrique)} · ${escapeHtml(p.categorie)}</div>
        <div class="hr"></div>
        <div class="p" style="color:var(--muted)">${escapeHtml(p.description||"")}</div>
        <div class="hr"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn primary" id="detailsAdd">Ajouter au panier</button>
          <button class="btn" id="detailsClose">Fermer</button>
        </div>
      </div>
    </div>
  `;
  body.querySelector("#detailsAdd").addEventListener("click", ()=> addToCart(id));
  body.querySelector("#detailsClose").addEventListener("click", ()=> ui.closeModal("detailsModal"));
  ui.openModal("detailsModal");
}

function initCartModal(){
  document.getElementById("cartBtn").addEventListener("click", ()=>{
    updateCartUI();
    ui.openModal("cartModal");
  });
  document.getElementById("cartClose").addEventListener("click", ()=> ui.closeModal("cartModal"));
  document.getElementById("cartModal").addEventListener("click", (e)=>{
    if(e.target.id === "cartModal") ui.closeModal("cartModal");
  });

  document.getElementById("cartLines").addEventListener("click", (e)=>{
    const t = e.target;
    const id = t.dataset.id;
    if(!id) return;
    const cart = store.getCart();
    if(t.dataset.cart === "inc"){
      cart[id].qty += 1;
    } else if(t.dataset.cart === "dec"){
      cart[id].qty = Math.max(1, cart[id].qty - 1);
    } else if(t.dataset.cart === "rm"){
      delete cart[id];
    }
    store.saveCart(cart);
    updateCartUI();
  });

  document.getElementById("clearCart").addEventListener("click", ()=>{
    store.saveCart({});
    updateCartUI();
    ui.toast("Panier vidé");
  });

  document.getElementById("checkoutBtn").addEventListener("click", ()=>{
    const cart = store.getCart();
    const items = Object.values(cart);
    if(items.length === 0){
      ui.toast("Panier vide");
      return;
    }
    const phone = document.getElementById("shopPhone").dataset.phone;
    let msg = `Bonjour BELLE DAME COSMETIQUE, je souhaite commander :%0A`;
    let total = 0;
    items.forEach(it=>{
      const p = PRODUCTS.find(x=>x.id===it.id);
      if(!p) return;
      const line = (p.price||0) * (it.qty||1);
      total += line;
      msg += `- ${it.qty} x ${p.name} (${p.brand||""}) : ${fmt(line, p.currency||"FCFA")}%0A`;
    });
    msg += `%0ATotal: ${fmt(total)}%0A%0ANom: %0ATéléphone: %0AAdresse/Livraison: %0A`;
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  });
}

function initDetailsModal(){
  document.getElementById("detailsModal").addEventListener("click", (e)=>{
    if(e.target.id === "detailsModal") ui.closeModal("detailsModal");
  });
  document.getElementById("detailsCloseTop").addEventListener("click", ()=> ui.closeModal("detailsModal"));
}

function initProductGridActions(){
  document.getElementById("grid").addEventListener("click", (e)=>{
    const btn = e.target.closest("button[data-action]");
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.dataset.action === "add") addToCart(id);
    if(btn.dataset.action === "details") openDetails(id);
  });
}

function initSearch(){ document.getElementById("q").addEventListener("input", render); }

function fillSousCatsAdmin(){
  const r = document.getElementById("pRub").value;
  const sSel = document.getElementById("pSous");
  const cSel = document.getElementById("pCat");
  sSel.innerHTML = `<option value="">Sous-rubrique</option>`;
  cSel.innerHTML = `<option value="">Catégorie</option>`;
  if(!r) return;
  Object.keys(TAX[r]||{}).forEach(s=>{
    sSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`);
  });
}
function fillCatsAdmin(){
  const r = document.getElementById("pRub").value;
  const s = document.getElementById("pSous").value;
  const cSel = document.getElementById("pCat");
  cSel.innerHTML = `<option value="">Catégorie</option>`;
  if(!r || !s) return;
  (TAX[r]?.[s] || []).forEach(c=>{
    cSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
  });
}

function readProductForm(){
  const id = document.getElementById("pId").value.trim() || ("BD-" + Math.random().toString(16).slice(2,8).toUpperCase());
  const name = document.getElementById("pName").value.trim();
  const brand = document.getElementById("pBrand").value.trim();
  const price = parseInt(document.getElementById("pPrice").value, 10) || 0;
  const desc = document.getElementById("pDesc").value.trim();
  const rubrique = document.getElementById("pRub").value;
  const sous = document.getElementById("pSous").value;
  const cat = document.getElementById("pCat").value;
  const img = document.getElementById("pImg").value.trim() || "assets/p1.svg";
  const active = document.getElementById("pActive").checked;

  return {id, name, brand, price, currency:"FCFA", rubrique, sous_rubrique:sous, categorie:cat, description:desc, images:[img], active};
}

function resetProductForm(){
  document.getElementById("pId").value = "";
  document.getElementById("pName").value = "";
  document.getElementById("pBrand").value = "";
  document.getElementById("pPrice").value = "";
  document.getElementById("pDesc").value = "";
  document.getElementById("pImg").value = "";
  document.getElementById("pRub").value = "";
  document.getElementById("pSous").value = "";
  document.getElementById("pCat").value = "";
  document.getElementById("pActive").checked = true;
  fillSousCatsAdmin();
  setLocked(false);
  // clear file input
  const fi = document.getElementById("pFile");
  if(fi) fi.value = "";
  const prev = document.getElementById("imgPreview");
  if(prev) prev.src = "";
}

function refreshAdminTable(){
  const tbody = document.getElementById("adminTbody");
  tbody.innerHTML = PRODUCTS.slice().sort((a,b)=> (a.name||"").localeCompare(b.name||"", 'fr')).map(p=>`
    <tr>
      <td>${escapeHtml(p.id)}</td>
      <td><b>${escapeHtml(p.name)}</b><div class="small">${escapeHtml(p.brand||"")}</div></td>
      <td>${fmt(p.price, p.currency||"FCFA")}</td>
      <td class="small">${escapeHtml(p.rubrique)}<br>${escapeHtml(p.sous_rubrique)}<br>${escapeHtml(p.categorie)}</td>
      <td>${p.active !== false ? "✅" : "⛔"}</td>
      <td style="white-space:nowrap">
        <button class="btn" data-admin="edit" data-id="${escapeHtml(p.id)}">Modifier</button>
        <button class="btn danger" data-admin="del" data-id="${escapeHtml(p.id)}">Supprimer</button>
      </td>
    </tr>
  `).join("");

  tbody.onclick = (e)=>{
    const btn = e.target.closest("button[data-admin]");
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.dataset.admin === "edit"){
      const p = PRODUCTS.find(x=>x.id===id);
      if(!p) return;
      document.getElementById("pId").value = p.id;
      document.getElementById("pName").value = p.name||"";
      document.getElementById("pBrand").value = p.brand||"";
      document.getElementById("pPrice").value = p.price||0;
      document.getElementById("pDesc").value = p.description||"";
      document.getElementById("pImg").value = (p.images && p.images[0]) ? p.images[0] : "";
      document.getElementById("pRub").value = p.rubrique||"";
      fillSousCatsAdmin();
      document.getElementById("pSous").value = p.sous_rubrique||"";
      fillCatsAdmin();
      document.getElementById("pCat").value = p.categorie||"";
      document.getElementById("pActive").checked = p.active !== false;

      // preview image if possible
      const prev = document.getElementById("imgPreview");
      if(prev) prev.src = (p.images && p.images[0]) ? p.images[0] : "";

      // Lock to "price/image/description" by default
      setLocked(true);
      ui.toast("Produit chargé (édition rapide : prix, image, description)");
    }
    if(btn.dataset.admin === "del"){
      if(!confirm("Supprimer ce produit ?")) return;
      PRODUCTS = PRODUCTS.filter(x=>x.id!==id);
      store.saveProducts(PRODUCTS);
    
// sync backend (optional): soft delete
try{
  const pin=(document.getElementById('adminPin')?.value||'').trim();
  if(pin){ apiAdmin(`/api/admin/products/${id}`,'DELETE', null, pin).catch(()=>{}); }
}catch(e){}
      refreshAdminTable();
      render();
      buildBrandSelect(PRODUCTS);
      ui.toast("Produit supprimé");
    }
  };
}

function initAdmin(){
  const adminBtn = document.getElementById("adminBtn");
  if(!adminBtn) return;

  const openAdmin = ()=>{
    ui.openModal("adminModal");
    refreshAdminTable();
  };

  adminBtn.addEventListener("click", ()=>{
    const admin = store.getAdmin();
    ui.openModal("pinModal");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinSave").onclick = ()=>{
      const pin = document.getElementById("pinInput").value.trim();
      if(!admin.pin){
        if(pin.length < 4){ ui.toast("PIN trop court (min 4)"); return; }
        store.saveAdmin({pin});
        ui.closeModal("pinModal");
        ui.toast("PIN défini");
        openAdmin();
      } else {
        if(pin !== admin.pin){ ui.toast("PIN incorrect"); return; }
        ui.closeModal("pinModal");
        openAdmin();
      }
    };
  });

  document.getElementById("pinClose").addEventListener("click", ()=> ui.closeModal("pinModal"));
  document.getElementById("adminClose").addEventListener("click", ()=> ui.closeModal("adminModal"));
  document.getElementById("adminModal").addEventListener("click", (e)=>{ if(e.target.id==="adminModal") ui.closeModal("adminModal"); });
  document.getElementById("pinModal").addEventListener("click", (e)=>{ if(e.target.id==="pinModal") ui.closeModal("pinModal"); });

  document.getElementById("pRub").addEventListener("change", fillSousCatsAdmin);
  document.getElementById("pSous").addEventListener("change", fillCatsAdmin);

  document.getElementById("unlockToggle").addEventListener("change", (e)=>{ setLocked(!e.target.checked); });

  // Image: via URL input (pImg) OR file picker (pFile)
  document.getElementById("pFile").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    if(!file.type.startsWith("image/")){
      ui.toast("Fichier non-image");
      e.target.value = "";
      return;
    }
    // Convert to DataURL for immediate preview & saving in localStorage
    const dataUrl = await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = ()=> reject(new Error("read"));
      reader.readAsDataURL(file);
    });
    document.getElementById("pImg").value = dataUrl;
    const prev = document.getElementById("imgPreview");
    if(prev) prev.src = dataUrl;
    ui.toast("Image chargée depuis le disque");
  });

  document.getElementById("pImg").addEventListener("input", ()=>{
    const prev = document.getElementById("imgPreview");
    if(prev) prev.src = document.getElementById("pImg").value.trim();
  });

  document.getElementById("saveProduct").addEventListener("click", async ()=>{
    const p = readProductForm();
    if(!p.name || !p.brand || !p.price){
      ui.toast("Nom, marque et prix sont obligatoires");
      return;
    }
    if(!p.rubrique || !p.sous_rubrique || !p.categorie){
      ui.toast("Rubrique, sous-rubrique, catégorie obligatoires");
      return;
    }
    const idx = PRODUCTS.findIndex(x=>x.id === p.id);
    if(idx >= 0){
      PRODUCTS[idx] = p;
      ui.toast("Produit mis à jour");
    } else {
      PRODUCTS.push(p);
      ui.toast("Produit ajouté");
    }
    store.saveProducts(PRODUCTS);
    // sync backend (optional)
    try{
      const pin=(document.getElementById('adminPin')?.value||'').trim();
      if(pin){ await apiAdmin('/api/admin/products','POST', p, pin); }
    }catch(e){}
    refreshAdminTable();
    render();
    buildBrandSelect(PRODUCTS);
    resetProductForm();
  });

  document.getElementById("newProduct").addEventListener("click", ()=>{
    resetProductForm();
    ui.toast("Nouveau produit");
  });

  document.getElementById("exportJSON").addEventListener("click", ()=>{
    const data = JSON.stringify(PRODUCTS, null, 2);
    const blob = new Blob([data], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("importJSON").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const text = await file.text();
      const arr = JSON.parse(text);
      if(!Array.isArray(arr)) throw new Error("format");
      PRODUCTS = arr;
      store.saveProducts(PRODUCTS);
    // sync backend (optional): seed all products
try{
  const pin=(document.getElementById('adminPin')?.value||'').trim();
  if(pin){ await apiAdmin('/api/admin/seed','POST',{ products: PRODUCTS }, pin); }
}catch(e){}
ui.toast("Import réussi");
      refreshAdminTable();
      render();
      buildBrandSelect(PRODUCTS);
    }catch(err){
      ui.toast("Import invalide");
    } finally {
      e.target.value = "";
    }
  });

  document.getElementById("savePhone").addEventListener("click", ()=>{
    const v = document.getElementById("phoneInput").value.trim().replace(/\D/g,'');
    if(v.length < 8){ ui.toast("Numéro WhatsApp invalide"); return; }
    document.getElementById("shopPhone").dataset.phone = v;
    document.getElementById("shopPhone").textContent = "+" + v;
    ui.toast("Numéro WhatsApp enregistré");
  });

// Backend sync
const syncBtn = document.getElementById("syncFromDbBtn");
const pushBtn = document.getElementById("pushToDbBtn");
if(syncBtn) syncBtn.addEventListener("click", ()=>adminLoadFromDb().catch(()=>ui.toast("Erreur chargement DB")));
if(pushBtn) pushBtn.addEventListener("click", ()=>adminPushToDb().catch(()=>ui.toast("Erreur sync DB")));

}

async function main(){
  TAX = await store.getTaxonomy();
  try{ PRODUCTS = await apiGet("/api/products"); }
  catch(e){ PRODUCTS = await store.getProducts(); }
  buildPills(TAX);
  bindPills();
  buildFacetSelects(TAX);
  buildBrandSelect(PRODUCTS);
  buildBrandsPage(PRODUCTS);

  syncFromHash();
  render();

  initSearch();
  initProductGridActions();
  initCartModal();
  initDetailsModal();
  initAdmin();

  ui.setCartBadge(cartCount(store.getCart()));
  const year = document.getElementById("year");
  if(year) year.textContent = new Date().getFullYear();

  document.addEventListener("keydown", (e)=>{
    if(e.key !== "Escape") return;
    ["cartModal","detailsModal","adminModal","pinModal"].forEach(id=>{
      const el = document.getElementById(id);
      if(el && el.style.display === "flex") ui.closeModal(id);
    });
  });
}
document.addEventListener("DOMContentLoaded", main);


async function adminLoadFromDb(){
  // reading public products doesn't need pin
const data = await apiGet("/api/products");
PRODUCTS = data;
store.saveProducts(PRODUCTS);
ui.toast("Catalogue chargé depuis la base");
render();
if(typeof refreshAdminTable === "function") refreshAdminTable();
}

async function adminPushToDb(){
  const pin = (document.getElementById("adminPin")?.value||"").trim();
  if(!pin){ ui.toast("Entrez le PIN"); return; }
  await apiAdmin("/api/admin/seed", "POST", { products: PRODUCTS }, pin);
  ui.toast("Catalogue synchronisé vers la base");
}
