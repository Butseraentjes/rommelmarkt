// Helper functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function isSameDay(date1, date2) {
  return date1.getDate() === date2.getDate() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getFullYear() === date2.getFullYear();
}

// Admin Functions
function showAdminPanel() {
  // Hide all sections
  document.querySelectorAll('section').forEach(section => {
    section.classList.add('hidden');
  });
  
  // Show admin section
  document.getElementById('admin').classList.remove('hidden');
  
  // Update nav active state
  document.querySelectorAll('nav a').forEach(l => l.classList.remove('active'));
  
  // Load admin markets
  loadAdminMarkets();
}

async function loadAdminMarkets() {
  if (!isAdmin || !adminMarkets) return;
  
  try {
    const q = query(collection(db, 'rommelmarkten'), orderBy('toegevoegdOp', 'desc'));
    const querySnapshot = await getDocs(q);
    
    adminMarkets.innerHTML = '';
    
    if (querySnapshot.empty) {
      adminMarkets.innerHTML = '<p>Geen markten gevonden.</p>';
      return;
    }
    
    querySnapshot.forEach((doc) => {
      const market = { id: doc.id, ...doc.data() };
      const marketElement = createAdminMarketItem(market);
      adminMarkets.appendChild(marketElement);
    });
    
  } catch (error) {
    console.error('Fout bij laden admin markten:', error);
    adminMarkets.innerHTML = '<p>Fout bij laden markten.</p>';
  }
}

function createAdminMarketItem(market) {
  const item = document.createElement('div');
  item.className = 'admin-market-item';
  
  const dateTime = market.datumStart ? formatDateTime(market.datumStart) : { date: 'Onbekend' };
  
  item.innerHTML = `
    <div class="admin-market-info">
      <h4>${escapeHtml(market.naam)}</h4>
      <p>${escapeHtml(market.locatie)} • ${dateTime.date} • Status: ${market.status || 'actief'}</p>
    </div>
    <div class="admin-market-actions">
      <button onclick="deleteMarket('${market.id}')" class="btn btn-danger btn-small">Verwijder</button>
    </div>
  `;
  
  return item;
}

async function deleteMarket(marketId) {
  if (!isAdmin) {
    alert('Je hebt geen admin rechten.');
    return;
  }

  const market = allMarkets.find(m => m.id === marketId);
  if (!market) {
    alert('Markt niet gevonden.');
    return;
  }

  const confirmed = confirm(`Weet je zeker dat je "${market.naam}" wilt verwijderen?`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'rommelmarkten', marketId));
    
    alert('Markt succesvol verwijderd!');
    
    // Remove from local array
    allMarkets = allMarkets.filter(m => m.id !== marketId);
    
    // Refresh displays
    applyFilters();
    loadAdminMarkets();
    
  } catch (error) {
    console.error('Fout bij verwijderen van markt:', error);
    alert('Er ging iets mis bij het verwijderen. Probeer opnieuw.');
  }
}

async function handleBulkImport(e) {
  e.preventDefault();
  
  if (!isAdmin) {
    alert('Je hebt geen admin rechten.');
    return;
  }

  const rawData = bulkDataTextarea.value.trim();
  if (!rawData) {
    showImportResult('Geen data ingevoerd.', 'error');
    return;
  }

  try {
    showImportResult('Data verwerken...', 'processing');
    
    const markets = parseRommelmarktData(rawData);
    
    if (markets.length === 0) {
      showImportResult('Geen geldige rommelmarkten gevonden in de data.', 'error');
      return;
    }

    showImportResult(`${markets.length} rommelmarkten gevonden. Importeren...`, 'processing');
    
    let imported = 0;
    let errors = 0;
    
    for (let i = 0; i < markets.length; i++) {
      try {
        const marketData = {
          ...markets[i],
          userId: currentUser.uid,
          email: currentUser.email,
          toegevoegdOp: Timestamp.now(),
          status: 'actief',
          bron: 'bulk_import'
        };
        
        await addDoc(collection(db, 'rommelmarkten'), marketData);
        imported++;
        
      } catch (error) {
        console.error('Fout bij importeren van markt:', error);
        errors++;
      }
    }
    
    const resultMsg = `Import voltooid! ✅ ${imported} geïmporteerd, ❌ ${errors} fouten.`;
    showImportResult(resultMsg, 'success');
    
    bulkDataTextarea.value = '';
    loadMarkets();
    loadAdminMarkets();
    
  } catch (error) {
    console.error('Bulk import fout:', error);
    showImportResult(`Fout bij importeren: ${error.message}`, 'error');
  }
}

async function handleClearAll() {
  if (!isAdmin) {
    alert('Je hebt geen admin rechten.');
    return;
  }

  const confirmed = confirm('⚠️ WAARSCHUWING: Dit zal ALLE rommelmarkten verwijderen! Ben je zeker?');
  if (!confirmed) return;
  
  const doubleConfirm = confirm('🚨 LAATSTE KANS: Dit kan niet ongedaan gemaakt worden. Alle data wordt permanent verwijderd!');
  if (!doubleConfirm) return;

  try {
    showImportResult('Alle data verwijderen...', 'processing');
    
    const q = query(collection(db, 'rommelmarkten'));
    const querySnapshot = await getDocs(q);
    
    let deleted = 0;
    for (const docSnapshot of querySnapshot.docs) {
      await deleteDoc(doc(db, 'rommelmarkten', docSnapshot.id));
      deleted++;
    }
    
    showImportResult(`Alle data verwijderd! ${deleted} evenementen gewist.`, 'success');
    allMarkets = [];
    applyFilters();
    loadAdminMarkets();
    
  } catch (error) {
    console.error('Fout bij verwijderen:', error);
    showImportResult(`Fout bij verwijderen: ${error.message}`, 'error');
  }
}

function showImportResult(message, type) {
  if (!importResults) return;
  
  importResults.classList.remove('hidden');
  importResults.className = `import-results ${type}`;
  importResults.innerHTML = `<strong>${type === 'error' ? '❌ Fout:' : type === 'success' ? '✅ Succes:' : '⏳ Bezig:'}</strong> ${message}`;
}

function parseRommelmarktData(rawData) {
  const markets = [];
  const reorganizedData = reorganizeMarketData(rawData);
  const blocks = reorganizedData.split(/^L\s*$/m).filter(block => block.trim());
  
  for (const block of blocks) {
    try {
      const market = parseMarketBlock(block);
      if (market) {
        markets.push(market);
      }
    } catch (error) {
      console.warn('Kon blok niet verwerken:', error);
    }
  }
  
  return markets;
}

function reorganizeMarketData(rawData) {
  const parts = rawData.split(/^L\s*$/m);
  const reorganized = [];
  let currentEventData = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    
    const hasLocation = /^[A-Z\s-]+\s*\(\d{4}\)/.test(part);
    const hasDate = /^(ma|di|wo|do|vr|za|zo)\s+\d{1,2}\s+\w+\s+\d{4}/.test(part);
    
    if (hasLocation) {
      if (currentEventData) {
        reorganized.push('L\n' + currentEventData);
      }
      currentEventData = part;
    } else if (hasDate && currentEventData) {
      currentEventData += '\n' + part;
    } else if (currentEventData) {
      currentEventData += '\n' + part;
    }
  }
  
  if (currentEventData) {
    reorganized.push('L\n' + currentEventData);
  }
  
  return reorganized.join('\n\n');
}

function parseMarketBlock(block) {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line && line !== 'L');
  
  if (lines.length < 2) return null;
  
  let plaats = '';
  let postcode = '';
  let adres = '';
  let naam = '';
  let datum = null;
  let startTijd = '09:00';
  let eindTijd = null;
  let beschrijving = '';
  let organisator = '';
  let contact = '';
  let standgeld = null;
  let type = 'rommelmarkt';
  
  const firstLine = lines[0];
  const plaatsMatch = firstLine.match(/^([A-Z\s-]+(?:\s*-\s*[A-Z\s]+)?)\s*\((\d{4})\)\s*(.*)$/);
  if (plaatsMatch) {
    plaats = plaatsMatch[1].trim();
    postcode = plaatsMatch[2];
    adres = plaatsMatch[3].trim();
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const datumMatch = line.match(/^(ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
    if (datumMatch) {
      const [, , dag, maand, jaar] = datumMatch;
      datum = parseDutchDate(`${dag} ${maand} ${jaar}`);
      continue;
    }
    
    const tijdMatch = line.match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
    if (tijdMatch) {
      const [, startUur, startMin, eindUur, eindMin] = tijdMatch;
      startTijd = `${startUur.padStart(2, '0')}:${startMin}`;
      eindTijd = `${eindUur.padStart(2, '0')}:${eindMin}`;
      continue;
    }
    
    if (line.includes('@') || line.includes('+32')) {
      const parts = line.split('-');
      if (parts.length >= 2) {
        organisator = parts[0].trim();
        contact = parts.slice(1).join('-').trim();
      } else {
        contact = line;
      }
      continue;
    }
    
    const standgeldMatch = line.match(/standplaats\s*([\d,]+)\s*€/i);
    if (standgeldMatch) {
      standgeld = parseFloat(standgeldMatch[1].replace(',', '.'));
      continue;
    }
    
    if (!naam && line.length > 5 && line.length < 80 && 
        !line.includes('http') && !line.includes('@') && 
        !line.includes('(') && !line.match(/^\d/)) {
      
      if (!line.toLowerCase().includes('opstellen') && 
          !line.toLowerCase().includes('ontruiming') &&
          !line.toLowerCase().includes('bekijk details')) {
        naam = line;
      }
    }
    
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('garage')) type = 'garageverkoop';
    if (lowerLine.includes('braderie')) type = 'braderie';
    if (lowerLine.includes('kermis')) type = 'kermis';
    if (lowerLine.includes('antiek') || lowerLine.includes('brocante')) type = 'antiekmarkt';
    if (lowerLine.includes('feest')) type = 'feest';
  }
  
  if (!naam) {
    naam = `Rommelmarkt ${plaats}`;
  }
  
  beschrijving = lines.slice(1, 6)
    .filter(line => 
      !line.includes('@') && 
      !line.includes('http') && 
      !line.match(/^\s*\d{1,2}:\d{2}/) &&
      !line.match(/^(ma|di|wo|do|vr|za|zo)\s+\d/) &&
      line.length > 15 && 
      line.length < 150
    )
    .join(' ')
    .substring(0, 200);
  
  if (!plaats || !datum) {
    return null;
  }
  
  const locatie = adres ? `${adres}, ${postcode} ${plaats}` : `Centrum, ${postcode} ${plaats}`;
  
  const startDateTime = new Date(`${datum}T${startTijd}`);
  const endDateTime = eindTijd ? new Date(`${datum}T${eindTijd}`) : null;
  
  return {
    naam: naam.substring(0, 100),
    type: type,
    locatie: locatie,
    datumStart: Timestamp.fromDate(startDateTime),
    datumEind: endDateTime ? Timestamp.fromDate(endDateTime) : null,
    beschrijving: beschrijving,
    organisator: organisator.substring(0, 100),
    contact: contact.substring(0, 100),
    aantalStanden: null,
    standgeld: standgeld
  };
}

function parseDutchDate(dateStr) {
  const maanden = {
    'januari': '01', 'februari': '02', 'maart': '03', 'april': '04',
    'mei': '05', 'juni': '06', 'juli': '07', 'augustus': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mrt': '03', 'apr': '04', 'mei': '05',
    'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09',
    'okt': '10', 'nov': '11', 'dec': '12'
  };
  
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (match) {
    const [, dag, maand, jaar] = match;
    const maandNr = maanden[maand.toLowerCase()];
    if (maandNr) {
      return `${jaar}-${maandNr}-${dag.padStart(2, '0')}`;
    }
  }
  
  return null;
}

// Make deleteMarket globally accessible
window.deleteMarket = deleteMarket;

// Debug functions
window.debugInfo = () => {
  console.log('🔍 Debug Info:');
  console.log('- Current User:', currentUser);
  console.log('- Is Admin:', isAdmin);
  console.log('- All Markets:', allMarkets);
  console.log('- Filtered Markets:', filteredMarkets);
};

console.log('✅ Simple main.js loaded with admin functionality!');import { 
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

console.log('🚀 Main.js geladen - Simple version');

// DOM elementen
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const adminBtn = document.getElementById('admin-btn');
const userBar = document.getElementById('user-bar');
const userEmail = document.getElementById('user-email');
const marketForm = document.getElementById('market-form');
const marketGrid = document.getElementById('market-grid');
const loading = document.getElementById('loading');
const noMarkets = document.getElementById('no-markets');
const filterType = document.getElementById('filter-type');
const filterLocation = document.getElementById('filter-location');
const filterDate = document.getElementById('filter-date');
const clearFiltersBtn = document.getElementById('clear-filters');

// Admin elements
const bulkImportForm = document.getElementById('bulk-import-form');
const bulkDataTextarea = document.getElementById('bulk-data');
const clearAllBtn = document.getElementById('clear-all-btn');
const importResults = document.getElementById('import-results');
const adminMarkets = document.getElementById('admin-markets');

// Global variables
let allMarkets = [];
let filteredMarkets = [];
let currentUser = null;
let isAdmin = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 DOM Content Loaded!');
  setupEventListeners();
  loadMarketsPublic();
});

// Event listeners
function setupEventListeners() {
  console.log('🔧 Setting up event listeners...');
  
  // Navigation
  document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', handleNavigation);
  });

  // Auth buttons
  if (loginBtn) loginBtn.addEventListener('click', handleLogin);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  if (adminBtn) adminBtn.addEventListener('click', showAdminPanel);
  
  // Form
  if (marketForm) marketForm.addEventListener('submit', handleAddMarket);
  
  // Admin
  if (bulkImportForm) bulkImportForm.addEventListener('submit', handleBulkImport);
  if (clearAllBtn) clearAllBtn.addEventListener('click', handleClearAll);
  
  // Filters
  if (filterType) filterType.addEventListener('change', applyFilters);
  if (filterLocation) filterLocation.addEventListener('input', debounce(applyFilters, 300));
  if (filterDate) filterDate.addEventListener('change', applyFilters);
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);
}

// Navigation handling
function handleNavigation(e) {
  e.preventDefault();
  
  // Remove active class from all links
  document.querySelectorAll('nav a').forEach(l => l.classList.remove('active'));
  
  // Add active class to clicked link
  e.target.classList.add('active');
  
  // Show/hide sections
  const target = e.target.getAttribute('href').substring(1);
  
  document.querySelectorAll('section').forEach(section => {
    if (section.id === target) {
      section.classList.remove('hidden');
    } else if (section.id !== 'home') {
      section.classList.add('hidden');
    }
  });
  
  // Special handling for add section - check if user is logged in
  if (target === 'add' && !currentUser) {
    showLoginPrompt();
    return;
  }
  
  // Scroll to section
  document.getElementById(target).scrollIntoView({ 
    behavior: 'smooth' 
  });
}

function showLoginPrompt() {
  alert('Je moet ingelogd zijn om een evenement toe te voegen. Klik op "Inloggen" rechtsboven.');
}

// Auth functions
async function handleLogin() {
  if (!loginBtn) return;
  
  try {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Inloggen...';
    
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    const result = await signInWithPopup(auth, provider);
    console.log('✅ Login succesvol:', result.user.email);
    
  } catch (err) {
    console.error('❌ Login fout:', err);
    
    let errorMessage = 'Er ging iets mis bij het inloggen. Probeer opnieuw.';
    
    if (err.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Login geannuleerd.';
    } else if (err.code === 'auth/popup-blocked') {
      errorMessage = 'Popup werd geblokkeerd door je browser. Sta popups toe en probeer opnieuw.';
    }
    
    alert(errorMessage);
    
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Inloggen';
    }
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Logout fout:', err);
  }
}

// Auth state observer
onAuthStateChanged(auth, (user) => {
  console.log('🔄 Auth state changed:', user ? `Logged in as ${user.email}` : 'Logged out');
  
  currentUser = user;
  
  if (user) {
    // User is logged in
    if (loginBtn) loginBtn.style.display = 'none';
    if (userBar) userBar.classList.remove('hidden');
    if (userEmail) userEmail.textContent = user.email;
    
    // Check if user is admin
    isAdmin = adminEmails.includes(user.email);
    console.log('👑 Admin status:', isAdmin);
    
    // Show/hide admin button
    if (adminBtn) {
      if (isAdmin) {
        adminBtn.classList.remove('hidden');
      } else {
        adminBtn.classList.add('hidden');
      }
    }
    
    loadMarkets();
  } else {
    // User is logged out
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (userBar) userBar.classList.add('hidden');
    if (adminBtn) adminBtn.classList.add('hidden');
    
    currentUser = null;
    isAdmin = false;
    
    // Hide admin and add sections if visible
    const addSection = document.getElementById('add');
    const adminSection = document.getElementById('admin');
    
    if (addSection && !addSection.classList.contains('hidden')) {
      addSection.classList.add('hidden');
      document.getElementById('markets').classList.remove('hidden');
      document.querySelector('nav a[href="#markets"]').classList.add('active');
      document.querySelector('nav a[href="#add"]').classList.remove('active');
    }
    
    if (adminSection && !adminSection.classList.contains('hidden')) {
      adminSection.classList.add('hidden');
      document.getElementById('markets').classList.remove('hidden');
      document.querySelector('nav a[href="#markets"]').classList.add('active');
    }
  }
});

// Load markets (public version)
async function loadMarketsPublic() {
  console.log('🚀 Loading public markets...');
  
  try {
    showLoadingState();
    
    let q;
    try {
      q = query(
        collection(db, 'rommelmarkten'),
        orderBy('datumStart', 'asc')
      );
    } catch (indexError) {
      console.log('Index niet klaar, probeer alternatief...');
      q = query(
        collection(db, 'rommelmarkten'),
        orderBy('toegevoegdOp', 'desc')
      );
    }
    
    const querySnapshot = await getDocs(q);
    console.log('📊 Query snapshot ontvangen:', querySnapshot.size, 'documenten');
    
    if (querySnapshot.empty) {
      console.log('⚠️ Geen documenten gevonden');
      allMarkets = [];
      applyFilters();
      return;
    }
    
    const marketsMap = new Map();

    querySnapshot.forEach((doc) => {
      const marketData = doc.data();
      const market = { id: doc.id, ...marketData };
      
      // Filter actieve markten
      const isActive = !market.status || market.status === 'actief';
      
      if (isActive && market.datumStart) {
        // Filter duplicates
        const uniqueKey = `${market.naam}-${market.locatie}-${market.datumStart.toDate().toDateString()}`;
        
        if (!marketsMap.has(uniqueKey)) {
          marketsMap.set(uniqueKey, market);
        }
      }
    });

    allMarkets = Array.from(marketsMap.values());
    
    // Sort by date
    allMarkets.sort((a, b) => a.datumStart.toDate() - b.datumStart.toDate());

    console.log('✅ Markten geladen:', allMarkets.length);
    applyFilters();

  } catch (error) {
    console.error('❌ Fout bij laden evenementen:', error);
    showErrorState();
  }
}

// Load markets (authenticated version)
async function loadMarkets() {
  console.log('🔄 Loading markets for authenticated user...');
  
  try {
    showLoadingState();
    
    let q;
    try {
      q = query(
        collection(db, 'rommelmarkten'),
        where('status', '==', 'actief'),
        orderBy('datumStart', 'asc')
      );
    } catch (indexError) {
      console.log('Index nog niet klaar, gebruik eenvoudige query...');
      q = query(
        collection(db, 'rommelmarkten'),
        orderBy('datumStart', 'asc')
      );
    }
    
    const querySnapshot = await getDocs(q);
    const marketsMap = new Map();

    querySnapshot.forEach((doc) => {
      const market = { id: doc.id, ...doc.data() };
      
      const isActive = !market.status || market.status === 'actief';
      
      if (isActive && market.datumStart) {
        const uniqueKey = `${market.naam}-${market.locatie}-${market.datumStart.toDate().toDateString()}`;
        
        if (!marketsMap.has(uniqueKey)) {
          marketsMap.set(uniqueKey, market);
        }
      }
    });

    allMarkets = Array.from(marketsMap.values());
    allMarkets.sort((a, b) => a.datumStart.toDate() - b.datumStart.toDate());

    console.log('✅ Authenticated markets loaded:', allMarkets.length);
    applyFilters();

  } catch (error) {
    console.error('Fout bij laden evenementen:', error);
    showErrorState();
  }
}

// Show loading state
function showLoadingState() {
  if (loading) loading.classList.remove('hidden');
  if (marketGrid) marketGrid.style.display = 'none';
  if (noMarkets) noMarkets.classList.add('hidden');
}

// Apply filters
function applyFilters() {
  console.log('🎯 Applying filters...');
  
  if (!allMarkets) {
    console.log('❌ allMarkets is undefined');
    return;
  }
  
  const typeFilter = filterType ? filterType.value.toLowerCase() : '';
  const locationFilter = filterLocation ? filterLocation.value.toLowerCase() : '';
  const dateFilter = filterDate ? filterDate.value : '';
  
  filteredMarkets = allMarkets.filter(market => {
    // Type filter
    if (typeFilter && market.type !== typeFilter) {
      return false;
    }
    
    // Location filter
    if (locationFilter) {
      const searchText = `${market.locatie} ${market.naam} ${market.organisator || ''}`.toLowerCase();
      if (!searchText.includes(locationFilter)) {
        return false;
      }
    }
    
    // Date filter
    if (dateFilter) {
      const marketDate = market.datumStart.toDate();
      const now = new Date();
      
      switch (dateFilter) {
        case 'today':
          if (!isSameDay(marketDate, now)) return false;
          break;
        case 'week':
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() + 7);
          if (marketDate > weekEnd) return false;
          break;
        case 'month':
          if (marketDate.getMonth() !== now.getMonth() || marketDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
          break;
      }
    }
    
    return true;
  });
  
  console.log('📊 Filtered markets:', filteredMarkets.length);
  displayMarkets();
}

// Display markets
function displayMarkets() {
  console.log('🎬 Displaying markets...');
  
  if (loading) loading.classList.add('hidden');
  
  if (!filteredMarkets || filteredMarkets.length === 0) {
    if (marketGrid) marketGrid.style.display = 'none';
    if (noMarkets) noMarkets.classList.remove('hidden');
    return;
  }
  
  if (noMarkets) noMarkets.classList.add('hidden');
  if (marketGrid) {
    marketGrid.style.display = 'grid';
    marketGrid.innerHTML = '';
    
    filteredMarkets.forEach(market => {
      const marketElement = createMarketCard(market);
      marketGrid.appendChild(marketElement);
    });
  }
}

// Create market card
function createMarketCard(market) {
  const card = document.createElement('div');
  card.className = 'market-card';
  
  const eventType = eventTypes[market.type] || eventTypes.rommelmarkt;
  const dateTime = formatDateTime(market.datumStart);
  const endTime = market.datumEind ? formatTime(market.datumEind) : null;
  
  card.innerHTML = `
    <div class="market-image">${eventType.icon}</div>
    <div class="market-content">
      <div class="market-type">${eventType.label}</div>
      <h3 class="market-title">${escapeHtml(market.naam)}</h3>
      <div class="market-details">
        <div class="market-detail">
          <span class="market-detail-icon">📍</span>
          <span>${escapeHtml(market.locatie)}</span>
        </div>
        ${market.organisator ? `
          <div class="market-detail">
            <span class="market-detail-icon">👥</span>
            <span>${escapeHtml(market.organisator)}</span>
          </div>
        ` : ''}
        ${market.aantalStanden ? `
          <div class="market-detail">
            <span class="market-detail-icon">🏪</span>
            <span>${market.aantalStanden} standjes</span>
          </div>
        ` : ''}
        ${market.standgeld ? `
          <div class="market-detail">
            <span class="market-detail-icon">💰</span>
            <span>€${market.standgeld.toFixed(2)} per meter</span>
          </div>
        ` : ''}
        ${market.contact ? `
          <div class="market-detail">
            <span class="market-detail-icon">📞</span>
            <span>${escapeHtml(market.contact)}</span>
          </div>
        ` : ''}
      </div>
      <div class="market-date">
        ${dateTime.dayName} ${dateTime.time}${endTime ? ` - ${endTime}` : ''}
      </div>
    </div>
  `;
  
  return card;
}

// Clear filters
function clearFilters() {
  if (filterType) filterType.value = '';
  if (filterLocation) filterLocation.value = '';
  if (filterDate) filterDate.value = '';
  applyFilters();
}

// Show error state
function showErrorState() {
  if (loading) loading.classList.add('hidden');
  if (marketGrid) {
    marketGrid.style.display = 'block';
    marketGrid.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #e53e3e; grid-column: 1 / -1;">
        <h3>Fout bij het laden</h3>
        <p>Probeer de pagina te verversen.</p>
      </div>
    `;
  }
  if (noMarkets) noMarkets.classList.add('hidden');
}

// Form handling
async function handleAddMarket(e) {
  e.preventDefault();
  
  if (!currentUser) {
    alert('Je moet ingelogd zijn om een evenement toe te voegen.');
    return;
  }

  const submitBtn = marketForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Toevoegen...';

    const formData = getFormData();
    const validation = validateFormData(formData);
    if (!validation.isValid) {
      alert(validation.message);
      return;
    }

    const marketData = await prepareMarketData(formData);
    await addDoc(collection(db, 'rommelmarkten'), marketData);
    
    alert('Evenement succesvol toegevoegd! 🎉');
    marketForm.reset();
    loadMarkets();
    
    // Go back to markets view
    document.getElementById('markets').classList.remove('hidden');
    document.getElementById('add').classList.add('hidden');
    document.querySelector('nav a[href="#markets"]').classList.add('active');
    document.querySelector('nav a[href="#add"]').classList.remove('active');

  } catch (error) {
    console.error('Fout bij toevoegen:', error);
    alert('Er ging iets mis bij het toevoegen. Probeer opnieuw.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

function getFormData() {
  return {
    naam: document.getElementById('market-name').value.trim(),
    type: document.getElementById('market-type').value,
    locatie: document.getElementById('market-location').value.trim(),
    organisator: document.getElementById('market-organizer').value.trim(),
    datum: document.getElementById('market-date').value,
    tijdStart: document.getElementById('market-time-start').value,
    tijdEind: document.getElementById('market-time-end').value,
    aantalStanden: document.getElementById('market-stands').value,
    standgeld: document.getElementById('market-price').value,
    contact: document.getElementById('market-contact').value.trim(),
    beschrijving: document.getElementById('market-description').value.trim()
  };
}

function validateFormData(data) {
  if (!data.naam || !data.type || !data.locatie || !data.datum || !data.tijdStart) {
    return { isValid: false, message: 'Vul alle verplichte velden in.' };
  }

  const startDateTime = new Date(`${data.datum}T${data.tijdStart}`);
  const now = new Date();
  
  if (startDateTime < now) {
    return { isValid: false, message: 'De datum en tijd kunnen niet in het verleden liggen.' };
  }

  if (data.tijdEind) {
    const endDateTime = new Date(`${data.datum}T${data.tijdEind}`);
    if (endDateTime <= startDateTime) {
      return { isValid: false, message: 'De eindtijd moet na de starttijd liggen.' };
    }
  }

  return { isValid: true };
}

async function prepareMarketData(formData) {
  const startDateTime = new Date(`${formData.datum}T${formData.tijdStart}`);
  let endDateTime = null;
  
  if (formData.tijdEind) {
    endDateTime = new Date(`${formData.datum}T${formData.tijdEind}`);
  }

  return {
    userId: currentUser.uid,
    email: currentUser.email,
    naam: formData.naam,
    type: formData.type,
    locatie: formData.locatie,
    organisator: formData.organisator || '',
    datumStart: Timestamp.fromDate(startDateTime),
    datumEind: endDateTime ? Timestamp.fromDate(endDateTime) : null,
    aantalStanden: formData.aantalStanden ? parseInt(formData.aantalStanden) : null,
    standgeld: formData.standgeld ? parseFloat(formData.standgeld) : null,
    contact: formData.contact || '',
    beschrijving: formData.beschrijving || '',
    imageUrl: '',
    toegevoegdOp: Timestamp.now(),
    status: 'actief'
  };
}

// Helper functions
function isSameDay(date1, date2) {
  return date1.getDate() === date2.getDate() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getFullYear() === date2.getFullYear();
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Debug functions
window.debugInfo = () => {
  console.log('🔍 Debug Info:');
  console.log('- Current User:', currentUser);
  console.log('- All Markets:', allMarkets);
  console.log('- Filtered Markets:', filteredMarkets);
};

console.log('✅ Simple main.js loaded!');
