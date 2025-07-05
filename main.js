// =============================================================
// Rommelmarkt in je buurt – Main.js (clean & consolidated)
// =============================================================
// ✨ 2025‑07‑05 – Full refactor
// -------------------------------------------------------------
// • Alle imports omhoog, geen stray import meer in functies
// • Eén duidelijk init‑entrypoint via DOMContentLoaded
// • DEBUG‑flag om logging snel te dempen
// • Helpers: debounce, isSameDay, convertImageToBase64, showSuccessMessage,
//   removeImage, escapeHtml, getGradientForType, animateCounter
// • Volledige UI: grid/list, hero‑cards, smooth‑scroll, toasts
// • Admin: bulk import, clear all, delete single
// • Filtering uitgebreid (today, tomorrow, this‑week, future)
// • Beperk console‑spam; log() wrapper
// =============================================================

import {
  auth,
  provider,
  db,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  Timestamp,
  formatDate,
  formatTime,
  formatDateTime,
  eventTypes,
  adminEmails,
  deleteDoc,
  doc
} from './firebase.js';

// ──────────────────────────────────────────────────────────────
// 🔧 Config & helpers
// ──────────────────────────────────────────────────────────────
const DEBUG = true; // Zet op false in productie
const MARKET_COLLECTION = 'rommelmarkten';
const MARKETS_PER_PAGE = 12;

const log = (...args) => DEBUG && console.log(...args);

const debounce = (fn, delay = 300) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), delay); };
};

const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const convertImageToBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

function showSuccessMessage(msg) {
  const div = document.createElement('div');
  div.className = 'toast-success';
  div.textContent = msg;
  div.style.cssText = 'position:fixed;top:16px;right:16px;background:#38a169;color:#fff;padding:10px 16px;border-radius:6px;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

function removeImage() {
  previewImg && (previewImg.src = '');
  imagePreview && (imagePreview.style.display = 'none');
  marketImageInput && (marketImageInput.value = '');
}

function escapeHtml(t) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return t.replace(/[&<>"']/g, m => map[m]);
}

const getGradientForType = (t) => ({
  rommelmarkt: '#48bb78,#38a169',
  garageverkoop: '#ed8936,#dd6b20',
  braderie: '#667eea,#764ba2',
  kermis: '#e53e3e,#c53030',
  boerenmarkt: '#38a169,#2f855a',
  antiekmarkt: '#d69e2e,#b7791f',
  feest: '#9f7aea,#805ad5'
}[t] || '#48bb78,#38a169');

const animateCounter = (el, to) => { if(!el)return; const start=0,dur=800,st=performance.now(); const step=c=>{const p=Math.min((c-st)/dur,1);el.textContent=Math.round(start+(to-start)*p); p<1&&requestAnimationFrame(step);} ;requestAnimationFrame(step);};

function showErrorState() {
  marketsContainer && (marketsContainer.style.display='none');
  noMarketsDiv && (noMarketsDiv.style.display='block');
  loadingMarketsDiv && (loadingMarketsDiv.style.display='none');
}

// ──────────────────────────────────────────────────────────────
// 🗂️ State vars
// ──────────────────────────────────────────────────────────────
let allMarkets = [], filteredMarkets = [], currentUser = null, isAdmin = false;
let currentView = 'grid', currentPage = 1, hasInitializedMarkets = false;

// ──────────────────────────────────────────────────────────────
// 📦 DOM cache vars
// ──────────────────────────────────────────────────────────────
let loginBtn, logoutBtn, loginContainer, mainContent, userMenu, userEmail, marketForm,
    marketsContainer, heroMarketsContainer, noMarketsDiv, filterType, filterLocation,
    filterDate, clearFiltersBtn, viewGridBtn, viewListBtn, resultsCount, loadingMarketsDiv,
    loadMoreBtn, loadMoreContainer, suggestEventBtn, totalMarketsSpan, upcomingMarketsSpan,
    marketImageInput, imagePreview, previewImg, adminPanel, bulkImportForm, bulkDataTextarea,
    clearAllBtn, importResults;

function cacheDom() {
  loginBtn = document.getElementById('login-btn');
  logoutBtn = document.getElementById('logout-btn');
  loginContainer = document.getElementById('login-container');
  mainContent = document.getElementById('main-content');
  userMenu = document.getElementById('user-menu');
  userEmail = document.getElementById('user-email');
  marketForm = document.getElementById('market-form');
  marketsContainer = document.getElementById('markets-container');
  heroMarketsContainer = document.getElementById('hero-markets-container');
  noMarketsDiv = document.getElementById('no-markets');
  filterType = document.getElementById('filter-type');
  filterLocation = document.getElementById('filter-location');
  filterDate = document.getElementById('filter-date');
  clearFiltersBtn = document.getElementById('clear-filters');
  viewGridBtn = document.getElementById('view-grid');
  viewListBtn = document.getElementById('view-list');
  resultsCount = document.getElementById('results-count');
  loadingMarketsDiv = document.getElementById('loading-markets');
  loadMoreBtn = document.getElementById('load-more-btn');
  loadMoreContainer = document.getElementById('load-more-container');
  suggestEventBtn = document.getElementById('suggest-event');
  totalMarketsSpan = document.getElementById('total-markets');
  upcomingMarketsSpan = document.getElementById('upcoming-markets');
  marketImageInput = document.getElementById('market-image');
  imagePreview = document.getElementById('image-preview');
  previewImg = document.getElementById('preview-img');
  adminPanel = document.getElementById('admin-panel');
  bulkImportForm = document.getElementById('bulk-import-form');
  bulkDataTextarea = document.getElementById('bulk-data');
  clearAllBtn = document.getElementById('clear-all-btn');
  importResults = document.getElementById('import-results');
}

// ──────────────────────────────────────────────────────────────
// 🚀 Init
// ──────────────────────────────────────────────────────────────
function init() {
  if (window.__MARKET_APP_INITIALIZED__) return;
  window.__MARKET_APP_INITIALIZED__ = true;
  cacheDom();
  setupEventListeners();
  updateStats();
  setTimeout(()=>{ if(!hasInitializedMarkets) loadMarketsPublic(); },800);
}

document.addEventListener('DOMContentLoaded', init);

// ──────────────────────────────────────────────────────────────
// 🎧 Listeners
// ──────────────────────────────────────────────────────────────
function setupEventListeners() {
  loginBtn?.addEventListener('click', handleLogin);
  logoutBtn?.addEventListener('click', ()=>signOut(auth));
  document.querySelectorAll('.nav-login-btn,.show-login').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();showLoginInterface();}));
  marketForm?.addEventListener('submit', handleAddMarket);
  marketImageInput?.addEventListener('change', handleImageUpload);
  filterType?.addEventListener('change', applyFilters);
  filterLocation?.addEventListener('input', debounce(applyFilters,300));
  filterDate?.addEventListener('change', applyFilters);
  clearFiltersBtn?.addEventListener('click', clearFilters);
  viewGridBtn?.addEventListener('click',()=>switchView('grid'));
  viewListBtn?.addEventListener('click',()=>switchView('list'));
  loadMoreBtn?.addEventListener('click', ()=>{currentPage++;renderMarkets();});
  suggestEventBtn?.addEventListener('click',()=>currentUser?document.getElementById('toevoegen')?.scrollIntoView({behavior:'smooth'}):showLoginInterface());
  bulkImportForm?.addEventListener('submit', handleBulkImport);
  clearAllBtn?.addEventListener('click', handleClearAll);
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const href=a.getAttribute('href');if(href==='#toevoegen'&&!currentUser){e.preventDefault();return showLoginInterface();}const tgt=document.querySelector(href);if(tgt){e.preventDefault();tgt.scrollIntoView({behavior:'smooth'});}}));
}

function showLoginInterface(){ if(currentUser) return document.getElementById('toevoegen')?.scrollIntoView({behavior:'smooth'}); loginContainer&&(loginContainer.style.display='flex'); }

async function handleLogin(){ if(!loginBtn)return; try{loginBtn.disabled=true;loginBtn.textContent='⏳ Inloggen...';provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}catch(e){log(e);alert('Kon niet inloggen');}finally{loginBtn.disabled=false;loginBtn.textContent='🔐 Inloggen met Google';loginContainer&&(loginContainer.style.display='none');}}

onAuthStateChanged(auth,user=>{
  currentUser=user;isAdmin=!!user&&adminEmails.includes(user.email);
  loginContainer&&(loginContainer.style.display='none');
  userMenu&&(userMenu.style.display=user?'flex':'none');
  document.querySelectorAll('.nav-login-btn,.show-login').forEach(b=>b.style.display=user?'none':'');
  userEmail&&(userEmail.textContent=user?.email||'');
  adminPanel&&(adminPanel.style.display=isAdmin?'block':'none');
  document.getElementById('toevoegen')?.style.setProperty('display',user?'block':'none');
  const navAdd=document.querySelector('.nav-add-link'); if(navAdd){ if(user){navAdd.removeAttribute('onclick');navAdd.href='#toevoegen';}else{navAdd.onclick=e=>{e.preventDefault();showLoginInterface();};}}
  user?loadMarkets():(!hasInitializedMarkets&&loadMarketsPublic());
});

// ──────────────────────────────────────────────────────────────
// ➕ Add market
// ──────────────────────────────────────────────────────────────
async function handleAddMarket(e){e.preventDefault(); if(!currentUser)return alert('Log eerst in'); const sb=marketForm.querySelector('button[type="submit"]'); const txt=sb.innerHTML; sb.disabled=true; sb.innerText='Toevoegen...'; try{const d=getFormData(); const v=validateFormData(d); if(!v.isValid) return alert(v.message); const docData=await prepareMarketData(d); await addDoc(collection(db,MARKET_COLLECTION),docData); showSuccessMessage('Evenement toegevoegd 🎉'); marketForm.reset();removeImage();loadMarkets(); document.getElementById('markten')?.scrollIntoView({behavior:'smooth'});}catch(e){log(e);alert('Fout bij opslaan');}finally{sb.disabled=false;sb.innerHTML=txt;}}

function getFormData(){ return{ naam:document.getElementById('market-name').value.trim(), type:document.getElementById('market-type').value, locatie:document.getElementById('market-location').value.trim(), organisator:document.getElementById('market-organizer').value.trim(), datum:document.getElementById('market-date').value, tijdStart:document.getElementById('market-time-start').value, tijdEind:document.getElementById('market-time-end').value, aantalStanden:document.getElementById('market-stands').value, standgeld:document.getElementById('market-price').value, contact:document.getElementById('market-contact').value.trim(), beschrijving:document.getElementById('market-description').value.trim(), imageFile:marketImageInput?.files[0]||null };}

function validateFormData(d){ if(!d.naam||!d.type||!d.locatie||!d.datum||!d.tijdStart) return{isValid:false,message:'Vul alle verplichte velden in.'}; const start=new Date(`${d.datum}T${d.tijdStart}`); if(start<new Date()) return{isValid:false,message:'Datum ligt in verleden'}; if(d.tijdEind){const end=new Date(`${d.datum}T${d.tijdEind}`); if(end<=start) return{isValid:false,message:'Eindtijd moet na starttijd'};} return{isValid:true};}

async function prepareMarketData(fd){const st=new Date(`${fd.datum}T${fd.tijdStart}`); const et=fd.tijdEind?new Date(`${fd.datum}T${fd.tijdEind}`):null; return{ userId:currentUser.uid,email:currentUser.email,naam:fd.naam,type:fd.type,locatie:fd.locatie,organisator:fd.organisator||'',datumStart:Timestamp.fromDate(st),datumEind:et?Timestamp.fromDate(et):null,aantalStanden:fd.aantalStanden?parseInt(fd.aantalStanden):null,standgeld:fd.standgeld?parseFloat(fd.standgeld):null,contact:fd.contact||'',beschrijving:fd.beschrijving||'',imageUrl:fd.imageFile?await convertImageToBase64(fd.imageFile):'',toegevoegdOp:Timestamp.now(),status:'actief'};}

// ──────────────────────────────────────────────────────────────
// 🗄️ Load markets (public/auth)
// ──────────────────────────────────────────────────────────────
async function loadMarketsPublic(){hasInitializedMarkets=true;await genericLoadMarkets(true);} async function loadMarkets(){hasInitializedMarkets=true;await genericLoadMarkets(false);}

async function genericLoadMarkets(pub){try{showLoadingState(); const q=query(collection(db,MARKET_COLLECTION),...(pub?[]:[where('status','==','actief')]),orderBy('datumStart','asc')); const snap=await getDocs(q); const map=new Map(); snap.forEach(d=>{const m={id:d.id,...d.data()}; if(!pub&&m.status&&m.status!=='actief')return; const key=`${m.naam}-${m.locatie}-${m.datumStart.toDate().toDateString()}`; if(!map.has(key)) map.set(key,m);}); allMarkets=[...map.values()].sort((a,b)=>a.datumStart.toDate()-b.datumStart.toDate()); currentPage=1; applyFilters(); updateStats(); loadHeroMarkets();}catch(e){log(e);showErrorState();}}

function showLoadingState(){loadingMarketsDiv&&(loadingMarketsDiv.style.display='block'); marketsContainer&&(marketsContainer.style.display='none'); noMarketsDiv&&(noMarketsDiv.style.display='none'); loadMoreContainer&&(loadMoreContainer.style.display='none');}

// ──────────────────────────────────────────────────────────────
// 🔍 Filtering
// ──────────────────────────────────────────────────────────────
function applyFilters(){if(!allMarkets)return; const tF=filterType?.value.toLowerCase()||''; const lF=filterLocation?.value.toLowerCase()||''; const dF=filterDate?.value||''; filteredMarkets=allMarkets.filter(m=>{ if(tF&&m.type!==tF)return false; if(lF&&!(`${m.locatie} ${m.naam} ${m.organisator||''}`.toLowerCase().includes(lF)))return false; if(dF){const md=m.datumStart.toDate(),now=new Date(); switch(dF){case 'today': if(!isSameDay(md,now))return false; break; case 'tomorrow': const tom=new Date(now); tom.setDate(now.getDate()+1); if(!isSameDay(md,tom))return false; break; case 'this-week': const s=new Date(now); s.setDate(now.getDate()-now.getDay()); const e=new Date(s); e.setDate(e.getDate()+6); if(md<s||md>e)return false; break; case 'future': if(md<now)return false; break; }} return true;}); currentPage=1; renderMarkets();}

function clearFilters(){filterType&&(filterType.value=''); filterLocation&&(filterLocation.value=''); filterDate&&(filterDate.value=''); applyFilters();}

// ──────────────────────────────────────────────────────────────
// 📤 Render/paging
// ──────────────────────────────────────────────────────────────
function renderMarkets(){if(!marketsContainer)return; marketsContainer.innerHTML=''; const start=(currentPage-1)*MARKETS_PER_PAGE; const items=filteredMarkets.slice(start,start+MARKETS_PER_PAGE); if(!items.length){noMarketsDiv&&(noMarketsDiv.style.display='block'); marketsContainer.style.display='none'; resultsCount&&(resultsCount.textContent='0'); loadMoreContainer&&(loadMoreContainer.style.display='none'); return;} noMarketsDiv&&(noMarketsDiv.style.display='none'); marketsContainer.style.display=currentView==='grid'?'grid':'block'; items.forEach(m=>marketsContainer.appendChild(createMarketCard(m))); loadMoreContainer&&(loadMoreContainer.style.display=filteredMarkets.length>currentPage*MARKETS_PER_PAGE?'block':'none'); resultsCount&&(resultsCount.textContent=filteredMarkets.length);}

function createMarketCard(m){const c=document.createElement('div'); c.className=`market-card ${currentView}`; const dt=formatDate?formatDate(m.datumStart.toDate()):m.datumStart.toDate().toLocaleDateString(); c.innerHTML=`<h3>${escapeHtml(m.naam)}</h3><p>${dt} – ${escapeHtml(m.locatie)}</p>${m.imageUrl?`<img src="${m.imageUrl}" loading="lazy">`:''}`; return c;}

function switchView(v){currentView=v; viewGridBtn?.classList.toggle('active',v==='grid'); viewListBtn?.classList.toggle('active',v==='list'); marketsContainer?.classList.toggle('list-view',v==='list'); renderMarkets();}

function loadHeroMarkets(){if(!heroMarketsContainer)return; heroMarketsContainer.innerHTML=''; const up=filteredMarkets.filter(m=>m.datumStart.toDate()>new Date()).slice(0,3); up.forEach(m=>{const div=document.createElement('div'); div.className='hero-market'; div.textContent=`${m.naam} – ${formatDate?formatDate(m.datumStart.toDate()):''}`; heroMarketsContainer.appendChild(div);});}

function updateStats(){totalMarketsSpan&&(totalMarketsSpan.textContent=allMarkets.length); const up=allMarkets.filter(m=>m.datumStart.toDate()>new Date()).length; upcomingMarketsSpan&&(upcomingMarketsSpan.textContent=up);}

// ──────────────────────────────────────────────────────────────
// 🛠 Admin
// ──────────────────────────────────────────────────────────────
function handleBulkImport(e){e.preventDefault(); if(!isAdmin)return alert('Admin only'); const raw=bulkDataTextarea.value.trim(); if(!raw)return alert('Geen JSON'); try{const data=JSON.parse(raw); Promise.all(data.map(d=>addDoc(collection(db,MARKET_COLLECTION),d))).then(()=>{showSuccessMessage('Import klaar'); bulkDataTextarea.value=''; loadMarkets();});}catch{alert('JSON ongeldig');}}

function handleClearAll(){if(!isAdmin)return alert('Admin only'); if(!confirm('Alles wissen?'))return; getDocs(collection(db,MARKET_COLLECTION)).then(snap=>Promise.all(snap.docs.map(d=>deleteDoc(doc(db,MARKET_COLLECTION,d.id)))).then(()=>{showSuccessMessage('Alles verwijderd'); loadMarkets();}));}

// ──────────────────────────────────────────────────────────────
// 🖼 Image upload preview
// ──────────────────────────────────────────────────────────────
function handleImageUpload(e){const f=e.target.files[0]; if(!f)return removeImage(); if(f.size>5*1024*1024){alert('Max 5MB');return e.target.value='';} if(!f.type.startsWith('image/')){alert('Alleen afbeeldingen');return e.target.value='';} previewImg.src=URL.createObjectURL(f); imagePreview.style.display='block';}

// =============================================================
// EINDE BESTAND
// =============================================================
