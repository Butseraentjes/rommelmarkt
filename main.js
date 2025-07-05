// =============================================================
// Rommelmarkt in je buurt – Main.js  (v2025-07-05 patch-3)
// =============================================================
// Wijzigingen in deze patch
// -------------------------------------------------------------
// • Syntax-error gefixt (afgebroken regel aan einde van renderMarkets()).
// • Kleine hulpfuncties bijgevoegd (createMarketCard, switchView, loadHeroMarkets)
//   zodat de app opnieuw compileert en ten minste een basis-weergave toont.
// • Login-flow onveranderd; indien er verder nog fouten opduiken, laat het weten.
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
// 🔧 Config & helpers
// ──────────────────────────────────────────────────────────────
const DEBUG = true;
const MARKET_COLLECTION = 'rommelmarkten';
const MARKETS_PER_PAGE = 12;

const log = (...a)=>DEBUG&&console.log(...a);
const debounce=(fn,d=300)=>{let t;return(...x)=>{clearTimeout(t);t=setTimeout(()=>fn.apply(this,x),d);};};
const isSameDay=(a,b)=>a.toDateString()===b.toDateString();
const convertImageToBase64=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});
const showSuccessMessage=m=>{const d=document.createElement('div');d.className='toast-success';d.textContent=m;d.style.cssText='position:fixed;top:16px;right:16px;background:#38a169;color:#fff;padding:10px 16px;border-radius:6px;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,.15)';document.body.appendChild(d);setTimeout(()=>d.remove(),3000);};
const escapeHtml=t=>t.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[m]);
const getGradientForType=t=>({rommelmarkt:'#48bb78,#38a169',garageverkoop:'#ed8936,#dd6b20',braderie:'#667eea,#764ba2',kermis:'#e53e3e,#c53030',boerenmarkt:'#38a169,#2f855a',antiekmarkt:'#d69e2e,#b7791f',feest:'#9f7aea,#805ad5'}[t]||'#48bb78,#38a169');
const animateCounter=(el,to)=>{if(!el)return;const s=0,d=800,st=performance.now();const step=t=>{const p=Math.min((t-st)/d,1);el.textContent=Math.round(s+(to-s)*p);p<1&&requestAnimationFrame(step);};requestAnimationFrame(step);} ;

function showErrorState(){marketsContainer&&(marketsContainer.style.display='none');noMarketsDiv&&(noMarketsDiv.style.display='block');loadingMarketsDiv&&(loadingMarketsDiv.style.display='none');}

// ──────────────────────────────────────────────────────────────
// 🗂️ State vars
// ──────────────────────────────────────────────────────────────
let allMarkets=[],filteredMarkets=[],currentUser=null,isAdmin=false;
let currentView='grid',currentPage=1,hasInitializedMarkets=false;

// ──────────────────────────────────────────────────────────────
// 📦 DOM cache vars
// ──────────────────────────────────────────────────────────────
let loginBtn,logoutBtn,loginContainer,userMenu,userEmail,marketForm,marketsContainer,heroMarketsContainer,noMarketsDiv,filterType,filterLocation,filterDate,clearFiltersBtn,viewGridBtn,viewListBtn,resultsCount,loadingMarketsDiv,loadMoreBtn,loadMoreContainer,suggestEventBtn,totalMarketsSpan,upcomingMarketsSpan,marketImageInput,imagePreview,previewImg,adminPanel,bulkImportForm,bulkDataTextarea,clearAllBtn,importResults;

function cacheDom(){loginBtn=document.getElementById('login-btn');logoutBtn=document.getElementById('logout-btn');loginContainer=document.getElementById('login-container');userMenu=document.getElementById('user-menu');userEmail=document.getElementById('user-email');marketForm=document.getElementById('market-form');marketsContainer=document.getElementById('markets-container');heroMarketsContainer=document.getElementById('hero-markets-container');noMarketsDiv=document.getElementById('no-markets');filterType=document.getElementById('filter-type');filterLocation=document.getElementById('filter-location');filterDate=document.getElementById('filter-date');clearFiltersBtn=document.getElementById('clear-filters');viewGridBtn=document.getElementById('view-grid');viewListBtn=document.getElementById('view-list');resultsCount=document.getElementById('results-count');loadingMarketsDiv=document.getElementById('loading-markets');loadMoreBtn=document.getElementById('load-more-btn');loadMoreContainer=document.getElementById('load-more-container');suggestEventBtn=document.getElementById('suggest-event');totalMarketsSpan=document.getElementById('total-markets');upcomingMarketsSpan=document.getElementById('upcoming-markets');marketImageInput=document.getElementById('market-image');imagePreview=document.getElementById('image-preview');previewImg=document.getElementById('preview-img');adminPanel=document.getElementById('admin-panel');bulkImportForm=document.getElementById('bulk-import-form');bulkDataTextarea=document.getElementById('bulk-data');clearAllBtn=document.getElementById('clear-all-btn');importResults=document.getElementById('import-results');}

// ──────────────────────────────────────────────────────────────
// 🚀 Init
// ──────────────────────────────────────────────────────────────
function init(){if(window.__MARKET_APP_INITIALIZED__)return;window.__MARKET_APP_INITIALIZED__=true;cacheDom();setupEventListeners();updateStats();setTimeout(()=>{!hasInitializedMarkets&&loadMarketsPublic();},600);}document.addEventListener('DOMContentLoaded',init);

// ──────────────────────────────────────────────────────────────
// 🎧 Listeners
// ──────────────────────────────────────────────────────────────
function setupEventListeners(){loginBtn&&loginBtn.addEventListener('click',handleLogin);logoutBtn&&logoutBtn.addEventListener('click',()=>signOut(auth));document.querySelectorAll('.nav-login-btn,.show-login').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();showLoginInterface();}));marketForm&&marketForm.addEventListener('submit',handleAddMarket);marketImageInput&&marketImageInput.addEventListener('change',handleImageUpload);filterType&&filterType.addEventListener('change',applyFilters);filterLocation&&filterLocation.addEventListener('input',debounce(applyFilters,300));filterDate&&filterDate.addEventListener('change',applyFilters);clearFiltersBtn&&clearFiltersBtn.addEventListener('click',clearFilters);viewGridBtn&&viewGridBtn.addEventListener('click',()=>switchView('grid'));viewListBtn&&viewListBtn.addEventListener('click',()=>switchView('list'));loadMoreBtn&&loadMoreBtn.addEventListener('click',()=>{currentPage++;renderMarkets();});}

function showLoginInterface(){currentUser?document.getElementById('toevoegen')?.scrollIntoView({behavior:'smooth'}):loginContainer&&(loginContainer.style.display='flex');}
async function handleLogin(){if(!loginBtn)return;try{loginBtn.disabled=true;loginBtn.textContent='⏳ Inloggen...';provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}catch(e){alert('Kon niet inloggen');log(e);}finally{loginBtn.disabled=false;loginBtn.textContent='🔐 Inloggen met Google';loginContainer&&(loginContainer.style.display='none');}}

// ──────────────────────────────────────────────────────────────
// 🆕 Stubs
// ──────────────────────────────────────────────────────────────
function handleAddMarket(e){e.preventDefault();alert('Evenement toevoegen is binnenkort beschikbaar.');}
function handleImageUpload(){/* todo */}

onAuthStateChanged(auth,u=>{currentUser=u;isAdmin=!!u&&adminEmails.includes(u.email);userMenu&&(userMenu.style.display=u?'flex':'none');document.querySelectorAll('.nav-login-btn,.show-login').forEach(b=>b.style.display=u?'none':'');userEmail&&(userEmail.textContent=u?.email||'');adminPanel&&(adminPanel.style.display=isAdmin?'block':'none');u?loadMarkets():(!hasInitializedMarkets&&loadMarketsPublic());});

// ──────────────────────────────────────────────────────────────
// 🗄️ Data-loaders
// ──────────────────────────────────────────────────────────────
async function loadMarketsPublic(){hasInitializedMarkets=true;await genericLoadMarkets(true);}async function loadMarkets(){hasInitializedMarkets=true;await genericLoadMarkets(false);} 

async function genericLoadMarkets(isPublic){try{showLoadingState();const q=query(collection(db,MARKET_COLLECTION),orderBy('datumStart','asc'));await fetchAndProcess(q);}catch(e){if(e.code==='failed-precondition'){log('⚠️ Index ontbreekt – fallback op toegevoegdOp');const q2=query(collection(db,MARKET_COLLECTION),orderBy('toegevoegdOp','desc'));await fetchAndProcess(q2);}else{log(e);showErrorState();}}}

async function fetchAndProcess(q){const snap=await getDocs(q);const map=new Map();snap.forEach(d=>{const m={id:d.id,...d.data()};const key=`${m.naam}-${m.locatie}-${m.datumStart.toDate().toDateString()}`;map.has(key)||map.set(key,m);});allMarkets=[...map.values()].sort((a,b)=>a.datumStart.toDate()-b.datumStart.toDate());currentPage=1;applyFilters();updateStats();loadHeroMarkets();loadingMarketsDiv&&(loadingMarketsDiv.style.display='none');}

function showLoadingState(){loadingMarketsDiv&&(loadingMarketsDiv.style.display='block');marketsContainer&&(marketsContainer.style.display='none');noMarketsDiv&&(noMarketsDiv.style.display='none');loadMoreContainer&&(loadMoreContainer.style.display='none');}

// ──────────────────────────────────────────────────────────────
// 🔍 Filtering
// ──────────────────────────────────────────────────────────────
function applyFilters(){if(!allMarkets)return;const t=filterType?.value.toLowerCase()||'';const l=filterLocation?.value.toLowerCase()||'';const d=filterDate?.value||'';filteredMarkets=allMarkets.filter(m=>{if(t&&m.type!==t)return false;if(l&&!(`${m.locatie} ${m.naam} ${m.organisator||''}`.toLowerCase().includes(l)))return false;if(d){const md=m.datumStart.toDate();const now=new Date();switch(d){case 'today':if(!isSameDay(md,now))return false;break;case 'tomorrow':const tm=new Date(now);tm.setDate(now.getDate()+1);if(!isSameDay(md,tm))return false;break;case 'week':{const end=new Date(now);end.setDate(now.getDate()+7);if(md<now||md>end)return false;}break;case 'weekend':{const day=md.getDay();if(day!==0&&day!==6)return false;}break;case 'month':if(md.getMonth()!==now.getMonth()||md.getFullYear()!==now.getFullYear())return false;break;case 'future':if(md<now)return false;break;}}return true;});currentPage=1;renderMarkets();}

function clearFilters(){filterType&&(filterType.value='');filterLocation&&(filterLocation.value='');filterDate&&(filterDate.value='');applyFilters();}

// ──────────────────────────────────────────────────────────────
// 📤 Rendering
// ──────────────────────────────────────────────────────────────
function renderMarkets(){if(!marketsContainer)return;loadingMarketsDiv&&(loadingMarketsDiv.style.display='none');const start=(currentPage-1)*MARKETS_PER_PAGE;const items=filteredMarkets.slice(start,start+MARKETS_PER_PAGE);
  if(!items.length){noMarketsDiv&&(noMarketsDiv.style.display='block');marketsContainer.style.display='none';resultsCount&&(resultsCount.textContent='0 evenementen gevonden');loadMoreContainer&&(loadMoreContainer.style.display='none');return;}
  noMarketsDiv&&(noMarketsDiv.style.display='none');marketsContainer.style.display=currentView==='grid'?'grid':'block';marketsContainer.innerHTML='';items.forEach(m=>marketsContainer.appendChild(createMarketCard(m)));
  if(resultsCount){const c=filteredMarkets.length;resultsCount.textContent=`${c} evenement${c!==1?'en':''} gevonden`;}
  loadMoreContainer&&(loadMoreContainer.style.display=(filteredMarkets.length>currentPage*MARKETS_PER_PAGE?'block':'none'));
}

function createMarketCard(m){const card=document.createElement('div');card.className='market-card';const evt=eventTypes[m.type]||eventTypes.rommelmarkt;const dateObj=formatDateTime(m.datumStart);
  card.innerHTML=`<div class="market-image" style="background:linear-gradient(135deg,${getGradientForType(m.type)});display:flex;align-items:center;justify-content:center;font-size:2rem;color:#fff;">${evt.icon}</div>`+
    `<div class="market-card-content"><h3>${escapeHtml(m.naam)}</h3><p style="color:#555;font-size:0.875rem;">${dateObj.dayName} • ${dateObj.time}</p>`+
    `<p style="color:#777;font-size:0.75rem;">${escapeHtml(m.locatie)}</p></div>`;
  return card;}

function switchView(v){currentView=v;viewGridBtn&&(viewGridBtn.classList.toggle('active',v==='grid'));viewListBtn&&(viewListBtn.classList.toggle('active',v==='list'));renderMarkets();}

function loadHeroMarkets(){if(!heroMarketsContainer)return;const upcoming=allMarkets.filter(m=>m.datumStart.toDate()>new Date()).slice(0,3);heroMarketsContainer.innerHTML='';upcoming.forEach(m=>{const card=document.createElement('div');card.className='market-card';card.innerHTML=`<div style="padding:12px;text-align:center;"><strong>${escapeHtml(m.naam)}</strong><br><small>${formatDateTime(m.datumStart).dayName}</small></div>`;heroMarketsContainer.appendChild(card);});}

function updateStats(){if(!totalMarketsSpan||!upcomingMarketsSpan)return;const now=new Date();const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);const weekEnd=new Date(now);weekEnd.setDate(now.getDate()+7);const inMonth=allMarkets.filter(m=>{const d=m.datumStart.toDate();return d>=now&&d<=monthEnd;}).length;const inWeek=allMarkets.filter(m=>{const d=m.datumStart.toDate();return d>=now&&d<=weekEnd;}).length;animateCounter(totalMarketsSpan,inMonth);animateCounter(upcomingMarketsSpan,inWeek);}
