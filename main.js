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

console.log('🚀 Main.js geladen - Simple version');

// DOM elementen
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
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
  
  // Form
  if (marketForm) marketForm.addEventListener('submit', handleAddMarket);
  
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
    
    loadMarkets();
  } else {
    // User is logged out
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (userBar) userBar.classList.add('hidden');
    
    currentUser = null;
    isAdmin = false;
    
    // Hide add section if visible
    const addSection = document.getElementById('add');
    if (addSection && !addSection.classList.contains('hidden')) {
      addSection.classList.add('hidden');
      // Show markets section instead
      document.getElementById('markets').classList.remove('hidden');
      // Update nav
      document.querySelector('nav a[href="#markets"]').classList.add('active');
      document.querySelector('nav a[href="#add"]').classList.remove('active');
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
