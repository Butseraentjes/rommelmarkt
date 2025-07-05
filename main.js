// =============================================================
// Rommelmarkten.be – Main.js  (v2025-07-05 patch-6)
// =============================================================
// Wijzigingen in deze patch
// -------------------------------------------------------------
// • Fix: DOM-mapping komt nu 1-op-1 overeen met IDs in index.html.
//   ‣ loadingMarkets, loadMoreBtn, loadMoreContainer → correcte IDs.
// • Alle oude references ($['loading'], $['loadMore'], $['loadMoreWrap'])
//   zijn vervangen door de nieuwe namen.
// • Extra null-checks zodat render() nooit crasht als element ontbreekt.
// • loginModal blijft ongewijzigd.
// -------------------------------------------------------------

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
// 🔧 Helpers & config
// ──────────────────────────────────────────────────────────────
const DEBUG = false;                           // zet naar true voor console-debug
const COLLECTION = 'rommelmarkten';
const PER_PAGE   = 12;

const log=(...a)=>DEBUG&&console.log('[RM]',...a);
const debounce=(fn,d=300)=>{let t;return(...x)=>{clearTimeout(t);t=setTimeout(()=>fn.apply(this,x),d);} }; 
const isSameDay=(a,b)=>a.toDateString()===b.toDateString();
const escapeHtml=t=>t.replace(/[&<>"]|'?/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m]));

// Firestore Timestamp → Date, of direct Date/string → Date
function dateFromFS(ts){
  if(!ts) return new Date(NaN);
  if(typeof ts.toDate==='function') return ts.toDate();
  return new Date(ts);
}

// Gradient per type
const getGradient=t=>({rommelmarkt:'#48bb78,#38a169',garageverkoop:'#ed8936,#dd6b20',braderie:'#667eea,#764ba2',kermis:'#e53e3e,#c53030',boerenmarkt:'#38a169,#2f855a',antiekmarkt:'#d69e2e,#b7791f',feest:'#9f7aea,#805ad5'}[t]||'#48bb78,#38a169');

const convertImageToBase64=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});
const toast=m=>{const d=document.createElement('div');d.textContent=m;d.style.cssText='position:fixed;top:16px;right:16px;background:#38a169;color:#fff;padding:10px 16px;border-radius:6px;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,.15)';document.body.appendChild(d);setTimeout(()=>d.remove(),2800);} ;

// ──────────────────────────────────────────────────────────────
// 🗂️ App-state
// ──────────────────────────────────────────────────────────────
let allMarkets=[],filteredMarkets=[],currentUser=null,isAdmin=false;
let currentView='grid',currentPage=1,initialized=false;

// ──────────────────────────────────────────────────────────────
// 📦 DOM refs
// ──────────────────────────────────────────────────────────────
const $={}; // cache
function dom(){
  // de sleutel-namen corresponderen exact met ids in de HTML.
  [ 'loginBtn','logoutBtn','loginContainer','userMenu','userEmail','marketForm','marketsContainer','heroMarketsContainer','noMarkets','filterType','filterLocation','filterDate','clearFilters','viewGrid','viewList','resultsCount','loadingMarkets','loadMoreBtn','loadMoreContainer','totalMarkets','upcomingMarkets' ].forEach(key=>{
    const id = key.replace(/([A-Z])/g,'-$1').toLowerCase();
    $[key]=document.getElementById(id);
  });
  // handmatige extra ids
  $['suggestEvent']=document.getElementById('suggest-event');
  $['imageInput']=document.getElementById('market-image');
  $['imagePrev']=document.getElementById('image-preview');
  $['prevImg']=document.getElementById('preview-img');
  $['adminPanel']=document.getElementById('admin-panel');
}

document.addEventListener('DOMContentLoaded',()=>{if(initialized)return;initialized=true;dom();listeners();stats();setTimeout(()=>!allMarkets.length&&loadPublic(),400);});

// ──────────────────────────────────────────────────────────────
// 🎧 Event-listeners
// ──────────────────────────────────────────────────────────────
function listeners(){
  $['loginBtn']?.addEventListener('click',login);
  $['logoutBtn']?.addEventListener('click',()=>signOut(auth));
  document.querySelectorAll('.nav-login-btn,.show-login').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();showLoginModal();}));
  $['filterType']?.addEventListener('change',filter);
  $['filterLocation']?.addEventListener('input',debounce(filter,300));
  $['filterDate']?.addEventListener('change',filter);
  $['clearFilters']?.addEventListener('click',()=>{$['filterType'].value='';$['filterLocation'].value='';$['filterDate'].value='';filter();});
  $['viewGrid']?.addEventListener('click',()=>switchView('grid'));
  $['viewList']?.addEventListener('click',()=>switchView('list'));
  $['loadMoreBtn']?.addEventListener('click',()=>{currentPage++;render();});
}

function showLoginModal(){currentUser?document.getElementById('toevoegen')?.scrollIntoView({behavior:'smooth'}):$['loginContainer']&&( $['loginContainer'].style.display='flex');}

async function login(){if(!$['loginBtn'])return;try{$['loginBtn'].disabled=true;$['loginBtn'].textContent='⏳ Inloggen...';provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);$['loginContainer'].style.display='none';}catch(e){alert('Kon niet inloggen');log(e);}finally{$['loginBtn'].disabled=false;$['loginBtn'].textContent='🔐 Inloggen met Google';}}

// Auth-observer
onAuthStateChanged(auth,u=>{currentUser=u;isAdmin=!!u&&adminEmails.includes(u.email);$['userMenu'] && ($['userMenu'].style.display=u?'flex':'none');document.querySelectorAll('.nav-login-btn,.show-login').forEach(b=>b.style.display=u?'none':'');$['userEmail'] && ($['userEmail'].textContent=u?u.email:'');$['adminPanel'] && ($['adminPanel'].style.display=isAdmin?'block':'none');u?loadPrivate():(!allMarkets.length&&loadPublic());});

// ──────────────────────────────────────────────────────────────
// 📥 Data-load
// ──────────────────────────────────────────────────────────────
async function loadPublic(){await fetchMarkets(query(collection(db,COLLECTION),orderBy('datumStart','asc')));} 
async function loadPrivate(){await fetchMarkets(query(collection(db,COLLECTION),orderBy('datumStart','asc')));} // kan uitgebreid worden met where('status','==','actief')

async function fetchMarkets(q){try{loadingState(true);const snap=await getDocs(q);const map=new Map();snap.forEach(d=>{const m={id:d.id,...d.data()};const key=`${m.naam}-${m.locatie}-${dateFromFS(m.datumStart).toDateString()}`;map.has(key)||map.set(key,m);});allMarkets=[...map.values()].sort((a,b)=>dateFromFS(a.datumStart)-dateFromFS(b.datumStart));currentPage=1;filter();stats();hero();}catch(e){console.error(e);errorState();}finally{loadingState(false);} }

// ──────────────────────────────────────────────────────────────
// 🔍 Filter & render
// ──────────────────────────────────────────────────────────────
function filter(){const t=$['filterType']?.value||'';const loc=($['filterLocation']?.value||'').toLowerCase();const d=$['filterDate']?.value||'';const now=new Date();filteredMarkets=allMarkets.filter(m=>{if(t&&m.type!==t)return false;if(loc&&!(`${m.locatie} ${m.naam} ${m.organisator||''}`.toLowerCase().includes(loc)))return false;if(d){const md=dateFromFS(m.datumStart);switch(d){case 'today':if(!isSameDay(md,now))return false;break;case 'tomorrow':{const tm=new Date(now);tm.setDate(tm.getDate()+1);if(!isSameDay(md,tm))return false;}break;case 'week':{const wk=new Date(now);wk.setDate(wk.getDate()+7);if(md<now||md>wk)return false;}break;case 'weekend':{const day=md.getDay();if(day!==0&&day!==6)return false;}break;case 'month':if(md.getMonth()!==now.getMonth()||md.getFullYear()!==now.getFullYear())return false;break;}}return true;});currentPage=1;render();}

function switchView(v){currentView=v;$['viewGrid']?.classList.toggle('active',v==='grid');$['viewList']?.classList.toggle('active',v==='list');render();}

function render(){if(!$['marketsContainer'])return;const start=(currentPage-1)*PER_PAGE;const slice=filteredMarkets.slice(start,start+PER_PAGE);if(!$['noMarkets']||!$['resultsCount']||!$['loadMoreContainer'])return; // safety
  if(!slice.length){$['noMarkets'].style.display='block';$['marketsContainer'].style.display='none';$['resultsCount'].textContent='0 evenementen gevonden';$['loadMoreContainer'].style.display='none';return;}
  $['noMarkets'].style.display='none';$['marketsContainer'].style.display=currentView==='grid'?'grid':'block';$['marketsContainer'].innerHTML='';slice.forEach(m=>$['marketsContainer'].appendChild(card(m)));
  const c=filteredMarkets.length;$['resultsCount'].textContent=`${c} evenement${c!==1?'en':''} gevonden`;$['loadMoreContainer'].style.display=c>currentPage*PER_PAGE?'block':'none';
  if($['loadMoreBtn'])$['loadMoreBtn'].textContent=`Meer laden (${Math.max(c-currentPage*PER_PAGE,0)})`;
}

function card(m){const a=document.createElement('a');a.className='market-card';a.href=`event.html?id=${m.id}`;a.setAttribute('aria-label',m.naam);
  const evt=eventTypes[m.type]||eventTypes.rommelmarkt;const fdt=formatDateTime(m.datumStart);
  a.innerHTML=`${m.imageUrl?`<img src="${m.imageUrl}" alt="${escapeHtml(m.naam)}" class="market-image" loading="lazy">`:`<div class="market-image" style="background:linear-gradient(135deg,${getGradient(m.type)});display:flex;align-items:center;justify-content:center;font-size:2rem;color:#fff;">${evt.icon}</div>`}
    <div class="market-card-content">
      <div class="market-type-badge type-${m.type}">${evt.icon} ${evt.label}</div>
      <h3>${escapeHtml(m.naam)}</h3>
      <p style="color:#555;font-size:.875rem;">${fdt.dayName} • ${fdt.time}</p>
      <p style="color:#777;font-size:.75rem;">${escapeHtml(m.locatie)}</p>
    </div>`;
  return a;}

// ──────────────────────────────────────────────────────────────
// 📊 Hero & stats
// ──────────────────────────────────────────────────────────────
function hero(){if(!$['heroMarketsContainer'])return;const up=allMarkets.filter(m=>dateFromFS(m.datumStart)>new Date()).slice(0,3);$['heroMarketsContainer'].innerHTML='';up.forEach(m=>{const evt=eventTypes[m.type]||eventTypes.rommelmarkt;const c=document.createElement('a');c.className='market-card';c.href=`event.html?id=${m.id}`;c.innerHTML=`<div style="padding:12px;text-align:center;background:linear-gradient(135deg,${getGradient(m.type)});color:#fff;"><strong>${escapeHtml(m.naam)}</strong><br><small>${formatDateTime(m.datumStart).dayName}</small><div style="font-size:1.5rem;margin-top:4px;">${evt.icon}</div></div>`;$['heroMarketsContainer'].appendChild(c);});}

function stats(){if(!$['totalMarkets']||!$['upcomingMarkets'])return;const now=new Date();const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);const weekEnd=new Date(now);weekEnd.setDate(now.getDate()+7);const inMonth=allMarkets.filter(m=>{const d=dateFromFS(m.datumStart);return d>=now&&d<=monthEnd;}).length;const inWeek=allMarkets.filter(m=>{const d=dateFromFS(m.datumStart);return d>=now&&d<=weekEnd;}).length;counter($['totalMarkets'],inMonth);counter($['upcomingMarkets'],inWeek);}function counter(el,to){if(!el)return;const s=0,d=700,st=performance.now();const step=t=>{const p=Math.min((t-st)/d,1);el.textContent=Math.round(s+(to-s)*p);p<1&&requestAnimationFrame(step);};requestAnimationFrame(step);} 

// ──────────────────────────────────────────────────────────────
// 🔄 UI helpers
// ──────────────────────────────────────────────────────────────
function loadingState(on){$['loadingMarkets']&&($['loadingMarkets'].style.display=on?'block':'none');}
function errorState(){if(!$['noMarkets']||!$['marketsContainer']||!$['loadingMarkets'])return;$['marketsContainer'].style.display='none';$['loadingMarkets'].style.display='none';$['noMarkets'].style.display='block';}
