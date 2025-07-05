// =============================================================
// Rommelmarkten.be – Main.js  (v2025-07-05 patch-9 - WORKING)
// =============================================================
// Wijzigingen in deze patch
// -------------------------------------------------------------
// • Terug naar werkende versie
// • Fix voor undefined display issues
// • Verbeterde error handling
// • Simpele, betrouwbare structuur
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
  doc,
  limit
} from './firebase.js';

// ──────────────────────────────────────────────────────────────
// 🔧 Helpers & config
// ──────────────────────────────────────────────────────────────
const DEBUG = true;                           // zet naar true voor console-debug
const COLLECTION = 'rommelmarkten';
const PER_PAGE   = 12;

const log=(...a)=>DEBUG&&console.log('[RM]',...a);
const debounce=(fn,d=300)=>{let t;return(...x)=>{clearTimeout(t);t=setTimeout(()=>fn.apply(this,x),d);} }; 
const isSameDay=(a,b)=>a.toDateString()===b.toDateString();
const escapeHtml=t=>t.replace(/[&<>"]|'?/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m]));

// Firebase Debug Info
console.log('🔥 Firebase Debug Info:');
console.log('Current URL:', window.location.href);
console.log('Auth object:', auth);
console.log('DB object:', db);

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

// ──────────────────────────────────────────────────────────────
// 🔧 Firebase Debug & Testing
// ──────────────────────────────────────────────────────────────
// Test Firebase connection
setTimeout(async () => {
  try {
    console.log('🧪 Testing Firestore connection...');
    const testQuery = query(collection(db, COLLECTION), limit(1));
    const snap = await getDocs(testQuery);
    console.log('✅ Firestore connection successful!');
    console.log('Documents found:', snap.size);
    if (snap.size > 0) {
      snap.forEach(doc => {
        console.log('Sample document:', doc.id, doc.data());
      });
    }
  } catch (error) {
    console.error('❌ Firestore connection failed:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Full error object:', error);
  }
}, 2000);

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
  
  // Voeg form handling toe
  setupFormHandling();
  
  // Voeg suggest event button handling toe
  $['suggestEvent']?.addEventListener('click', showLoginModal);
}

function showLoginModal(){currentUser?document.getElementById('toevoegen')?.scrollIntoView({behavior:'smooth'}):$['loginContainer']&&( $['loginContainer'].style.display='flex');}

async function login(){
  if(!$['loginBtn'])return;
  try{
    console.log('🔐 Starting login process...');
    $['loginBtn'].disabled=true;
    $['loginBtn'].textContent='⏳ Inloggen...';
    provider.setCustomParameters({prompt:'select_account'});
    const result = await signInWithPopup(auth,provider);
    console.log('✅ Login successful:', result.user.email);
    $['loginContainer'].style.display='none';
  }catch(e){
    console.error('❌ Login failed:', e);
    alert('Kon niet inloggen: ' + e.message);
    log(e);
  }finally{
    $['loginBtn'].disabled=false;
    $['loginBtn'].textContent='🔐 Inloggen met Google';
  }
}

// ──────────────────────────────────────────────────────────────
// 📝 Form Handling
// ──────────────────────────────────────────────────────────────
function setupFormHandling() {
  const form = $['marketForm'];
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
      showLoginModal();
      return;
    }
    
    try {
      console.log('📝 Starting form submission...');
      
      // Haal form data op
      const naam = document.getElementById('market-name')?.value?.trim();
      const type = document.getElementById('market-type')?.value;
      const locatie = document.getElementById('market-location')?.value?.trim();
      const organisator = document.getElementById('market-organizer')?.value?.trim();
      const datum = document.getElementById('market-date')?.value;
      const tijdStart = document.getElementById('market-time-start')?.value;
      const tijdEind = document.getElementById('market-time-end')?.value;
      const aantalStanden = document.getElementById('market-stands')?.value;
      const standgeld = document.getElementById('market-price')?.value;
      const contact = document.getElementById('market-contact')?.value?.trim();
      const beschrijving = document.getElementById('market-description')?.value?.trim();
      
      // Validatie
      if (!naam || !type || !locatie || !datum || !tijdStart) {
        alert('Vul alle verplichte velden in');
        return;
      }
      
      // Maak start datum/tijd object
      const startDateTime = new Date(`${datum}T${tijdStart}`);
      if (isNaN(startDateTime.getTime())) {
        alert('Ongeldige datum of tijd');
        return;
      }
      
      // Maak eind datum/tijd object als tijdEind is opgegeven
      let endDateTime = null;
      if (tijdEind) {
        endDateTime = new Date(`${datum}T${tijdEind}`);
        if (isNaN(endDateTime.getTime())) {
          alert('Ongeldige eindtijd');
          return;
        }
      }
      
      // Afbeelding verwerken
      let imageUrl = '';
      const imageFile = document.getElementById('market-image')?.files[0];
      if (imageFile) {
        try {
          imageUrl = await convertImageToBase64(imageFile);
        } catch (e) {
          console.error('Error converting image:', e);
        }
      }
      
      // Event object maken
      const eventData = {
        naam,
        type,
        locatie,
        datumStart: Timestamp.fromDate(startDateTime),
        toegevoegdOp: Timestamp.now(),
        toegevoegdDoor: currentUser.email,
        status: 'actief'
      };
      
      // Optionele velden toevoegen
      if (organisator) eventData.organisator = organisator;
      if (endDateTime) eventData.datumEind = Timestamp.fromDate(endDateTime);
      if (aantalStanden) eventData.aantalStanden = parseInt(aantalStanden);
      if (standgeld) eventData.standgeld = parseFloat(standgeld);
      if (contact) eventData.contact = contact;
      if (beschrijving) eventData.beschrijving = beschrijving;
      if (imageUrl) eventData.imageUrl = imageUrl;
      
      console.log('💾 Saving event data:', eventData);
      
      // Opslaan in Firestore
      const docRef = await addDoc(collection(db, COLLECTION), eventData);
      console.log('✅ Event saved with ID:', docRef.id);
      
      // Success feedback
      toast('Evenement succesvol toegevoegd!');
      form.reset();
      
      // Verberg image preview
      const imagePreview = document.getElementById('image-preview');
      if (imagePreview) imagePreview.style.display = 'none';
      
      // Herlaad data
      await loadPrivate();
      
      // Scroll naar markten sectie
      document.getElementById('markten')?.scrollIntoView({ behavior: 'smooth' });
      
    } catch (error) {
      console.error('❌ Error adding event:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      toast('Er ging iets mis bij het toevoegen van het evenement: ' + error.message);
    }
  });
  
  // Image preview handling
  const imageInput = document.getElementById('market-image');
  const imagePreview = document.getElementById('image-preview');
  const previewImg = document.getElementById('preview-img');
  
  if (imageInput && imagePreview && previewImg) {
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

// Functie voor het verwijderen van images
function removeImage() {
  const imageInput = document.getElementById('market-image');
  const imagePreview = document.getElementById('image-preview');
  
  if (imageInput) imageInput.value = '';
  if (imagePreview) imagePreview.style.display = 'none';
}

// Maak removeImage globaal beschikbaar
window.removeImage = removeImage;

// Auth-observer met debug info
onAuthStateChanged(auth,u=>{
  console.log('🔐 Auth state changed:', u ? 'Logged in as ' + u.email : 'Not logged in');
  currentUser=u;
  isAdmin=!!u&&adminEmails.includes(u.email);
  $['userMenu'] && ($['userMenu'].style.display=u?'flex':'none');
  document.querySelectorAll('.nav-login-btn,.show-login').forEach(b=>b.style.display=u?'none':'');
  $['userEmail'] && ($['userEmail'].textContent=u?u.email:'');
  $['adminPanel'] && ($['adminPanel'].style.display=isAdmin?'block':'none');
  
  // Toon/verberg de "evenement toevoegen" sectie
  const addSection = document.getElementById('toevoegen');
  if (addSection) {
    addSection.style.display = u ? 'block' : 'none';
  }
  
  u?loadPrivate():(!allMarkets.length&&loadPublic());
});

// ──────────────────────────────────────────────────────────────
// 📥 Data-load
// ──────────────────────────────────────────────────────────────
async function loadPublic(){
  console.log('📥 Loading public markets...');
  await fetchMarkets(query(collection(db,COLLECTION),orderBy('datumStart','asc')));
} 

async function loadPrivate(){
  console.log('📥 Loading private markets...');
  await fetchMarkets(query(collection(db,COLLECTION),orderBy('datumStart','asc')));
} // kan uitgebreid worden met where('status','==','actief')

async function fetchMarkets(q){
  try{
    console.log('🔄 Fetching markets from Firestore...');
    loadingState(true);
    const snap=await getDocs(q);
    console.log('📊 Retrieved', snap.size, 'documents');
    
    const map=new Map();
    snap.forEach((d, index) => {
      const m={id:d.id,...d.data()};
      
      // Log alleen de eerste 3 documenten om console niet te overbelasten
      if(index < 3) {
        console.log('📄 Document', index + 1, ':', d.id);
        console.log('📝 All fields and values:', m);
        console.log('🔑 Field names:', Object.keys(m));
        console.log('📛 naam field:', m.naam);
        console.log('📍 locatie field:', m.locatie);
        console.log('📅 datumStart field:', m.datumStart);
        console.log('---');
      }
      
      const key=`${m.naam}-${m.locatie}-${dateFromFS(m.datumStart).toDateString()}`;
      map.has(key)||map.set(key,m);
    });
    
    allMarkets=[...map.values()].sort((a,b)=>dateFromFS(a.datumStart)-dateFromFS(b.datumStart));
    console.log('✅ Processed', allMarkets.length, 'unique markets');
    
    currentPage=1;
    filter();
    stats();
    hero();
  }catch(e){
    console.error('❌ Error fetching markets:', e);
    console.error('Error code:', e.code);
    console.error('Error message:', e.message);
    errorState();
  }finally{
    loadingState(false);
  } 
}

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

function card(m){
  console.log('🏪 Creating card for:', m.naam, 'Type:', m.type);
  
  const a=document.createElement('a');
  a.className='market-card';
  a.href=`event.html?id=${m.id}`;
  a.setAttribute('aria-label',m.naam || 'Onbekend evenement');
  
  const evt=eventTypes[m.type]||eventTypes.rommelmarkt;
  
  // Veilige datum formattering
  let dayName = 'Datum onbekend';
  let timeString = '';
  
  try {
    if (m.datumStart && typeof m.datumStart.toDate === 'function') {
      const date = m.datumStart.toDate();
      dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
      timeString = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      console.log('📅 Direct date formatting for', m.naam, '- Day:', dayName, 'Time:', timeString);
    } else {
      console.log('❌ No valid datumStart for:', m.naam);
    }
  } catch (e) {
    console.error('❌ Error formatting date for:', m.naam, e);
  }
  
  // Debug de waardes die gebruikt worden
  console.log('🔍 Card values:', {
    naam: m.naam,
    locatie: m.locatie,
    type: m.type,
    evt: evt,
    dayName: dayName,
    timeString: timeString
  });
  
  a.innerHTML=`${m.imageUrl?`<img src="${m.imageUrl}" alt="${escapeHtml(m.naam || 'Evenement')}" class="market-image" loading="lazy">`:`<div class="market-image" style="background:linear-gradient(135deg,${getGradient(m.type)});display:flex;align-items:center;justify-content:center;font-size:2rem;color:#fff;">${evt.icon}</div>`}
    <div class="market-card-content">
      <div class="market-type-badge type-${m.type}">${evt.icon} ${evt.label}</div>
      <h3>${escapeHtml(m.naam || 'Onbekend evenement')}</h3>
      <p style="color:#555;font-size:.875rem;">${dayName} • ${timeString}</p>
      <p style="color:#777;font-size:.75rem;">${escapeHtml(m.locatie || 'Locatie onbekend')}</p>
    </div>`;
  return a;
}

// ──────────────────────────────────────────────────────────────
// 📊 Hero & stats
// ──────────────────────────────────────────────────────────────
function hero(){if(!$['heroMarketsContainer'])return;const up=allMarkets.filter(m=>dateFromFS(m.datumStart)>new Date()).slice(0,3);$['heroMarketsContainer'].innerHTML='';up.forEach(m=>{const evt=eventTypes[m.type]||eventTypes.rommelmarkt;const c=document.createElement('a');c.className='market-card';c.href=`event.html?id=${m.id}`;c.innerHTML=`<div style="padding:12px;text-align:center;background:linear-gradient(135deg,${getGradient(m.type)});color:#fff;"><strong>${escapeHtml(m.naam || 'Onbekend evenement')}</strong><br><small>${formatDateTime(m.datumStart).dayName}</small><div style="font-size:1.5rem;margin-top:4px;">${evt.icon}</div></div>`;$['heroMarketsContainer'].appendChild(c);});}

function stats(){if(!$['totalMarkets']||!$['upcomingMarkets'])return;const now=new Date();const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);const weekEnd=new Date(now);weekEnd.setDate(now.getDate()+7);const inMonth=allMarkets.filter(m=>{const d=dateFromFS(m.datumStart);return d>=now&&d<=monthEnd;}).length;const inWeek=allMarkets.filter(m=>{const d=dateFromFS(m.datumStart);return d>=now&&d<=weekEnd;}).length;counter($['totalMarkets'],inMonth);counter($['upcomingMarkets'],inWeek);}function counter(el,to){if(!el)return;const s=0,d=700,st=performance.now();const step=t=>{const p=Math.min((t-st)/d,1);el.textContent=Math.round(s+(to-s)*p);p<1&&requestAnimationFrame(step);};requestAnimationFrame(step);} 

// ──────────────────────────────────────────────────────────────
// 🔄 UI helpers
// ──────────────────────────────────────────────────────────────
function loadingState(on){$['loadingMarkets']&&($['loadingMarkets'].style.display=on?'block':'none');}
function errorState(){if(!$['noMarkets']||!$['marketsContainer']||!$['loadingMarkets'])return;$['marketsContainer'].style.display='none';$['loadingMarkets'].style.display='none';$['noMarkets'].style.display='block';}
