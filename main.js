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

// DOM elementen
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginContainer = document.getElementById('login-container');
const mainContent = document.getElementById('main-content');
const userBar = document.getElementById('user-bar');
const userEmail = document.getElementById('user-email');
const marketForm = document.getElementById('market-form');
const marketsContainer = document.getElementById('markets-container');
const noMarketsDiv = document.getElementById('no-markets');
const filterType = document.getElementById('filter-type');
const filterLocation = document.getElementById('filter-location');
const filterDate = document.getElementById('filter-date');
const clearFiltersBtn = document.getElementById('clear-filters');
const viewGridBtn = document.getElementById('view-grid');
const viewListBtn = document.getElementById('view-list');
const resultsCount = document.getElementById('results-count');
const loadingMarketsDiv = document.getElementById('loading-markets');
const loadMoreBtn = document.getElementById('load-more-btn');
const loadMoreContainer = document.getElementById('load-more-container');
const suggestEventBtn = document.getElementById('suggest-event');
const totalMarketsSpan = document.getElementById('total-markets');
const upcomingMarketsSpan = document.getElementById('upcoming-markets');

// Admin elements
const adminPanel = document.getElementById('admin-panel');
const bulkImportForm = document.getElementById('bulk-import-form');
const bulkDataTextarea = document.getElementById('bulk-data');
const clearAllBtn = document.getElementById('clear-all-btn');
const importResults = document.getElementById('import-results');

// Global variables
let allMarkets = [];
let filteredMarkets = [];
let currentUser = null;
let isAdmin = false;
let currentView = 'grid';
let marketsPerPage = 12;
let currentPage = 1;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateStats();
});

// Event listeners
function setupEventListeners() {
  if (loginBtn) loginBtn.addEventListener('click', handleLogin);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  if (marketForm) marketForm.addEventListener('submit', handleAddMarket);
  
  // Filter event listeners
  if (filterType) filterType.addEventListener('change', applyFilters);
  if (filterLocation) filterLocation.addEventListener('input', debounce(applyFilters, 300));
  if (filterDate) filterDate.addEventListener('change', applyFilters);
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);
  
  // View toggle listeners
  if (viewGridBtn) viewGridBtn.addEventListener('click', () => switchView('grid'));
  if (viewListBtn) viewListBtn.addEventListener('click', () => switchView('list'));
  
  // Load more listener
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreMarkets);
  
  // Suggest event listener
  if (suggestEventBtn) {
    suggestEventBtn.addEventListener('click', () => {
      document.getElementById('toevoegen').scrollIntoView({ behavior: 'smooth' });
    });
  }
  
  // Admin event listeners
  if (bulkImportForm) bulkImportForm.addEventListener('submit', handleBulkImport);
  if (clearAllBtn) clearAllBtn.addEventListener('click', handleClearAll);
  
  // Smooth scrolling for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

// Authentication functions
async function handleLogin() {
  try {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="btn-icon">⏳</span> Inloggen...';
    
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    const result = await signInWithPopup(auth, provider);
    console.log('Login succesvol:', result.user.email);
    
  } catch (err) {
    console.error('Login fout:', err);
    
    let errorMessage = 'Er ging iets mis bij het inloggen. Probeer opnieuw.';
    
    if (err.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Login geannuleerd. Probeer opnieuw als je wilt inloggen.';
    } else if (err.code === 'auth/popup-blocked') {
      errorMessage = 'Popup werd geblokkeerd door je browser. Sta popups toe en probeer opnieuw.';
    }
    
    alert(errorMessage);
    
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<span class="btn-icon">🔐</span> Inloggen met Google';
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
  currentUser = user;
  if (user) {
    // User is logged in
    loginContainer.style.display = 'none';
    mainContent.style.display = 'block';
    if (userBar) userBar.style.display = 'block';
    userEmail.textContent = user.email;
    
    // Check if user is admin
    isAdmin = adminEmails.includes(user.email);
    if (adminPanel) adminPanel.style.display = isAdmin ? 'block' : 'none';
    
    // Show all sections for logged in users
    const toevoegenSection = document.getElementById('toevoegen');
    if (toevoegenSection) toevoegenSection.style.display = 'block';
    
    loadMarkets();
  } else {
    // User is logged out
    loginContainer.style.display = 'flex';
    mainContent.style.display = 'block'; // Still show main content
    if (userBar) userBar.style.display = 'none'; // Hide user bar
    
    // Hide admin and add sections for logged out users
    const toevoegenSection = document.getElementById('toevoegen');
    const adminSection = document.getElementById('admin-panel');
    
    if (toevoegenSection) toevoegenSection.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    
    currentUser = null;
    isAdmin = false;
    
    // Load markets for public viewing
    loadMarketsPublic();
  }
});

// Market form handling
async function handleAddMarket(e) {
  e.preventDefault();
  
  if (!currentUser) {
    alert('Je moet ingelogd zijn om een evenement toe te voegen.');
    return;
  }

  const submitBtn = marketForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-icon">⏳</span> Toevoegen...';

    const formData = getFormData();
    const validation = validateFormData(formData);
    if (!validation.isValid) {
      alert(validation.message);
      return;
    }

    const marketData = prepareMarketData(formData);
    await addDoc(collection(db, 'rommelmarkten'), marketData);
    
    showSuccessMessage('Evenement succesvol toegevoegd!');
    marketForm.reset();
    loadMarkets();
    
    document.getElementById('markten').scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Fout bij toevoegen:', error);
    alert('Er ging iets mis bij het toevoegen. Probeer opnieuw.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
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

function prepareMarketData(formData) {
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
    toegevoegdOp: Timestamp.now(),
    status: 'actief'
  };
}

// Load markets for public viewing (when not logged in)
async function loadMarketsPublic() {
  try {
    showLoadingState();
    
    let q;
    try {
      q = query(
        collection(db, 'rommelmarkten'),
        orderBy('datumStart', 'asc')
      );
    } catch (indexError) {
      q = query(
        collection(db, 'rommelmarkten'),
        orderBy('toegevoegdOp', 'desc')
      );
    }
    
    const querySnapshot = await getDocs(q);
    allMarkets = [];

    querySnapshot.forEach((doc) => {
      const market = { id: doc.id, ...doc.data() };
      
      // Voor publieke weergave: toon alle actieve markten (ook verleden)
      const isActive = !market.status || market.status === 'actief';
      
      if (isActive) {
        allMarkets.push(market);
      }
    });

    // Sorteer op datum (meest recente eerst voor debug)
    allMarkets.sort((a, b) => b.datumStart.toDate() - a.datumStart.toDate());

    currentPage = 1;
    applyFilters();
    updateStats();

    console.log('Publieke markten geladen:', allMarkets.length);
    allMarkets.forEach(market => {
      console.log('Markt:', market.naam, 'Datum:', market.datumStart.toDate());
    });

  } catch (error) {
    console.error('Fout bij laden publieke evenementen:', error);
    showErrorState();
  }
}

// Load and display markets
async function loadMarkets() {
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
    allMarkets = [];

    querySnapshot.forEach((doc) => {
      const market = { id: doc.id, ...doc.data() };
      
      // Voor ingelogde gebruikers: meer permissieve filtering voor debugging
      const now = new Date();
      const marketDate = market.datumStart.toDate();
      const isActive = !market.status || market.status === 'actief';
      
      // Tijdelijk: toon ook markten van de laatste 30 dagen voor debugging
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      if (isActive && marketDate > thirtyDaysAgo) {
        allMarkets.push(market);
      }
    });

    // Sorteer op datum (toekomstige eerst, dan verleden)
    allMarkets.sort((a, b) => {
      const dateA = a.datumStart.toDate();
      const dateB = b.datumStart.toDate();
      const now = new Date();
      
      // Toekomstige events eerst, dan gesorteerd op datum
      if (dateA > now && dateB < now) return -1;
      if (dateA < now && dateB > now) return 1;
      
      return dateA - dateB;
    });

    currentPage = 1;
    applyFilters();
    updateStats();

    // Debug logging
    console.log('Ingelogde gebruiker - markten geladen:', allMarkets.length);
    allMarkets.forEach(market => {
      const isFuture = market.datumStart.toDate() > new Date() ? '(TOEKOMST)' : '(VERLEDEN)';
      console.log('Markt:', market.naam, 'Datum:', market.datumStart.toDate(), isFuture);
    });

  } catch (error) {
    console.error('Fout bij laden evenementen:', error);
    
    try {
      console.log('Probeer backup query...');
      const backupQuery = query(
        collection(db, 'rommelmarkten'),
        orderBy('toegevoegdOp', 'desc')
      );
      
      const querySnapshot = await getDocs(backupQuery);
      allMarkets = [];

      querySnapshot.forEach((doc) => {
        const market = { id: doc.id, ...doc.data() };
        const now = new Date();
        const marketDate = market.datumStart.toDate();
        
        if (marketDate > now) {
          allMarkets.push(market);
        }
      });
      
      allMarkets.sort((a, b) => a.datumStart.toDate() - b.datumStart.toDate());
      
      currentPage = 1;
      applyFilters();
      updateStats();
      
    } catch (backupError) {
      console.error('Ook backup query mislukt:', backupError);
      showErrorState();
    }
  }
}

function showLoadingState() {
  if (loadingMarketsDiv) {
    loadingMarketsDiv.style.display = 'block';
  }
  if (marketsContainer) {
    marketsContainer.style.display = 'none';
  }
  if (noMarketsDiv) {
    noMarketsDiv.style.display = 'none';
  }
  if (loadMoreContainer) {
    loadMoreContainer.style.display = 'none';
  }
}

function applyFilters() {
  if (!allMarkets) return;
  
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
        case 'tomorrow':
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (!isSameDay(marketDate, tomorrow)) return false;
          break;
        case 'week':
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() + 7);
          if (marketDate > weekEnd) return false;
          break;
        case 'weekend':
          const day = marketDate.getDay();
          if (day !== 0 && day !== 6) return false;
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
  
  currentPage = 1;
  displayMarkets();
  updateResultsInfo();
}

function displayMarkets() {
  if (loadingMarketsDiv) loadingMarketsDiv.style.display = 'none';
  
  if (!filteredMarkets || filteredMarkets.length === 0) {
    if (marketsContainer) marketsContainer.style.display = 'none';
    if (noMarketsDiv) noMarketsDiv.style.display = 'block';
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    return;
  }
  
  if (noMarketsDiv) noMarketsDiv.style.display = 'none';
  if (marketsContainer) {
    marketsContainer.style.display = currentView === 'grid' ? 'grid' : 'block';
    marketsContainer.className = currentView === 'grid' ? 'markets-grid' : 'markets-list';
  }
  
  const startIndex = (currentPage - 1) * marketsPerPage;
  const endIndex = Math.min(startIndex + marketsPerPage, filteredMarkets.length);
  const marketsToShow = filteredMarkets.slice(0, endIndex);
  
  if (marketsContainer) {
    marketsContainer.innerHTML = '';
    marketsToShow.forEach(market => {
      const marketElement = createMarketCard(market);
      marketsContainer.appendChild(marketElement);
    });
  }
  
  if (loadMoreContainer && loadMoreBtn) {
    if (endIndex < filteredMarkets.length) {
      loadMoreContainer.style.display = 'block';
      loadMoreBtn.textContent = `Meer laden (${filteredMarkets.length - endIndex} resterende)`;
    } else {
      loadMoreContainer.style.display = 'none';
    }
  }
}

function loadMoreMarkets() {
  currentPage++;
  displayMarkets();
}

function createMarketCard(market) {
  const card = document.createElement('div');
  card.className = 'market-card';
  
  const eventType = eventTypes[market.type] || eventTypes.rommelmarkt;
  const dateTime = formatDateTime(market.datumStart);
  const endTime = market.datumEind ? formatTime(market.datumEind) : null;
  
  if (currentView === 'list') {
    card.innerHTML = createListView(market, eventType, dateTime, endTime);
  } else {
    card.innerHTML = createGridView(market, eventType, dateTime, endTime);
  }
  
  return card;
}

function createGridView(market, eventType, dateTime, endTime) {
  return `
    <div class="market-date-badge">
      ${dateTime.dayMonth}
    </div>
    
    <div class="market-type-badge ${eventType.color}">
      ${eventType.icon} ${eventType.label}
    </div>
    
    <div class="market-card-content">
      <h3>${escapeHtml(market.naam)}</h3>
      
      <div class="market-date-time">
        📅 ${dateTime.dayName}
        <br>
        🕐 ${dateTime.time}${endTime ? ` - ${endTime}` : ''}
      </div>
      
      <div class="market-details-grid">
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
      </div>
      
      ${market.beschrijving ? `
        <div class="market-description">
          ${escapeHtml(market.beschrijving.substring(0, 120))}${market.beschrijving.length > 120 ? '...' : ''}
        </div>
      ` : ''}
      
      ${market.contact ? `
        <div class="market-detail">
          <span class="market-detail-icon">📞</span>
          <span>${escapeHtml(market.contact)}</span>
        </div>
      ` : ''}
    </div>
    
    <div class="market-added-by">
      Toegevoegd op ${formatDate(market.toegevoegdOp)}
    </div>
  `;
}

function createListView(market, eventType, dateTime, endTime) {
  return `
    <div class="market-info">
      <div class="market-type-badge ${eventType.color}">
        ${eventType.icon} ${eventType.label}
      </div>
      <h3>${escapeHtml(market.naam)}</h3>
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
    </div>
    <div class="market-date-compact">
      ${dateTime.dayName}<br>
      ${dateTime.time}${endTime ? ` - ${endTime}` : ''}
    </div>
  `;
}

function clearFilters() {
  if (filterType) filterType.value = '';
  if (filterLocation) filterLocation.value = '';
  if (filterDate) filterDate.value = '';
  applyFilters();
}

function switchView(view) {
  currentView = view;
  
  if (viewGridBtn && viewListBtn) {
    viewGridBtn.classList.toggle('active', view === 'grid');
    viewListBtn.classList.toggle('active', view === 'list');
  }
  
  displayMarkets();
}

function updateResultsInfo() {
  if (resultsCount && filteredMarkets) {
    const count = filteredMarkets.length;
    const word = count === 1 ? 'evenement' : 'evenementen';
    resultsCount.textContent = `${count} ${word} gevonden`;
  }
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

function showErrorState() {
  if (marketsContainer) {
    marketsContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #e53e3e;">
        <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
        <p>Fout bij het laden van evenementen. Probeer de pagina te verversen.</p>
      </div>
    `;
  }
  if (noMarketsDiv) noMarketsDiv.style.display = 'none';
}

function showSuccessMessage(message) {
  const successDiv = document.createElement('div');
  successDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #48bb78, #38a169);
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    font-weight: 500;
  `;
  successDiv.textContent = message;
  
  document.body.appendChild(successDiv);
  
  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}

function updateStats() {
  if (!totalMarketsSpan || !upcomingMarketsSpan || !allMarkets) return;
  
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  const thisMonthCount = allMarkets.filter(market => {
    const marketDate = market.datumStart.toDate();
    return marketDate >= now && marketDate <= thisMonth;
  }).length;
  
  const nextWeekCount = allMarkets.filter(market => {
    const marketDate = market.datumStart.toDate();
    return marketDate >= now && marketDate <= nextWeek;
  }).length;
  
  animateCounter(totalMarketsSpan, thisMonthCount);
  animateCounter(upcomingMarketsSpan, nextWeekCount);
}

function animateCounter(element, targetValue) {
  if (!element) return;
  
  const startValue = 0;
  const duration = 1000;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const currentValue = Math.round(startValue + (targetValue - startValue) * progress);
    element.textContent = currentValue;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// Admin Functions
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
        
        updateImportProgress(i + 1, markets.length);
        
      } catch (error) {
        console.error('Fout bij importeren van markt:', error);
        errors++;
      }
    }
    
    const resultMsg = `Import voltooid! ✅ ${imported} geïmporteerd, ❌ ${errors} fouten.`;
    showImportResult(resultMsg, 'success');
    
    bulkDataTextarea.value = '';
    loadMarkets();
    
  } catch (error) {
    console.error('Bulk import fout:', error);
    showImportResult(`Fout bij importeren: ${error.message}`, 'error');
  }
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

function showImportResult(message, type) {
  if (!importResults) return;
  
  importResults.style.display = 'block';
  importResults.className = `import-results ${type}`;
  importResults.innerHTML = `
    <strong>${type === 'error' ? '❌ Fout:' : type === 'success' ? '✅ Succes:' : '⏳ Bezig:'}</strong> ${message}
    ${type === 'processing' ? '<div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>' : ''}
  `;
}

function updateImportProgress(current, total) {
  const progressFill = document.getElementById('progress-fill');
  if (progressFill) {
    const percentage = (current / total) * 100;
    progressFill.style.width = `${percentage}%`;
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
    loadMarkets();
    
  } catch (error) {
    console.error('Fout bij verwijderen:', error);
    showImportResult(`Fout bij verwijderen: ${error.message}`, 'error');
  }
}
