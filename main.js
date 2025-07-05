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

console.log('🚀 Main.js geladen!');
console.log('Firebase auth:', auth);
console.log('Event types:', eventTypes);

// DOM elementen - ALLE IN ÉÉN KEER
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginContainer = document.getElementById('login-container');
const mainContent = document.getElementById('main-content');
const userBar = document.getElementById('user-bar');
const userEmail = document.getElementById('user-email');
const marketForm = document.getElementById('market-form');
const marketsContainer = document.getElementById('markets-container');
const heroMarketsContainer = document.getElementById('hero-markets-container');
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
const marketImageInput = document.getElementById('market-image');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');

// Admin elements
const adminPanel = document.getElementById('admin-panel');
const bulkImportForm = document.getElementById('bulk-import-form');
const bulkDataTextarea = document.getElementById('bulk-data');
const clearAllBtn = document.getElementById('clear-all-btn');
const importResults = document.getElementById('import-results');

console.log('DOM elementen:', {
  loginBtn: !!loginBtn,
  loginContainer: !!loginContainer,
  mainContent: !!mainContent,
  heroMarketsContainer: !!heroMarketsContainer,
  marketsContainer: !!marketsContainer,
  loadingMarketsDiv: !!loadingMarketsDiv,
  noMarketsDiv: !!noMarketsDiv
});

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
  console.log('🎯 DOM Content Loaded!');
  setupEventListeners();
  updateStats();
  
  // Start with public view - auth state will be handled by onAuthStateChanged
  console.log('🌍 Loading public markets...');
  loadMarketsPublic();
});

// Also run immediately in case DOM is already loaded
if (document.readyState === 'loading') {
  console.log('📄 Document still loading...');
} else {
  console.log('📄 Document already loaded, initializing...');
  setupEventListeners();
  updateStats();
  loadMarketsPublic();
}

// Event listeners
function setupEventListeners() {
  console.log('🔧 Setting up event listeners...');
  
  if (loginBtn) {
    console.log('✅ Login button found, adding listener');
    loginBtn.addEventListener('click', handleLogin);
  } else {
    console.error('❌ Login button not found!');
  }
  
  // Voeg event listeners toe voor login knoppen in de navigatie (indien aanwezig)
  const navLoginBtns = document.querySelectorAll('.nav-login-btn, .header-login-btn, .show-login');
  console.log('🔍 Found login buttons:', navLoginBtns.length);
  navLoginBtns.forEach((btn, index) => {
    console.log(`📌 Adding listener to login button ${index + 1}`);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginInterface();
    });
  });
  
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  if (marketForm) marketForm.addEventListener('submit', handleAddMarket);
  
  // Image upload listener
  if (marketImageInput) marketImageInput.addEventListener('change', handleImageUpload);
  
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
      // Als niet ingelogd, toon login interface
      if (!currentUser) {
        showLoginInterface();
        return;
      }
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
  
  console.log('✅ Event listeners setup complete!');
}

// Functie om login interface te tonen wanneer nodig
function showLoginInterface() {
  console.log('🔐 Showing login interface on user request');
  if (loginContainer) {
    loginContainer.style.display = 'flex';
  }
}

// Authentication functions
async function handleLogin() {
  console.log('🔐 Login button clicked!');
  
  if (!loginBtn) {
    console.error('❌ Login button not found');
    return;
  }
  
  try {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="btn-icon">⏳</span> Inloggen...';
    
    console.log('🚀 Starting Google login...');
    
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    const result = await signInWithPopup(auth, provider);
    console.log('✅ Login succesvol:', result.user.email);
    
  } catch (err) {
    console.error('❌ Login fout:', err);
    
    let errorMessage = 'Er ging iets mis bij het inloggen. Probeer opnieuw.';
    
    if (err.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Login geannuleerd. Probeer opnieuw als je wilt inloggen.';
    } else if (err.code === 'auth/popup-blocked') {
      errorMessage = 'Popup werd geblokkeerd door je browser. Sta popups toe en probeer opnieuw.';
    }
    
    alert(errorMessage);
    
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<span class="btn-icon">🔐</span> Inloggen met Google';
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

// Verbeterde Auth state observer
onAuthStateChanged(auth, (user) => {
  console.log('🔄 Auth state changed:', user ? `Logged in as ${user.email}` : 'Logged out');
  
  currentUser = user;
  
  if (user) {
    // User is logged in
    console.log('✅ User logged in, showing main content');
    
    // Hide login container
    if (loginContainer) {
      loginContainer.style.display = 'none';
      console.log('🚫 Login container hidden');
    }
    
    // Show main content
    if (mainContent) {
      mainContent.style.display = 'block';
      console.log('✅ Main content shown');
    }
    
    // Show user bar
    if (userBar) {
      userBar.style.display = 'block';
      console.log('👤 User bar shown');
    }
    
    // Set user email
    if (userEmail) {
      userEmail.textContent = user.email;
      console.log('📧 User email set:', user.email);
    }
    
    // Check if user is admin
    isAdmin = adminEmails.includes(user.email);
    console.log('👑 Admin status:', isAdmin);
    
    if (adminPanel) {
      adminPanel.style.display = isAdmin ? 'block' : 'none';
      console.log('🔧 Admin panel:', isAdmin ? 'shown' : 'hidden');
    }
    
    // Show add section for logged in users
    const toevoegenSection = document.getElementById('toevoegen');
    if (toevoegenSection) {
      toevoegenSection.style.display = 'block';
      console.log('➕ Toevoegen section shown');
    }
    
    // Load markets for authenticated users
    loadMarkets();
  } else {
    // User is logged out - FOR PUBLIC VIEWING, DON'T SHOW LOGIN CONTAINER
    console.log('👤 User logged out, setting up public view');
    
    // BELANGRIJKE WIJZIGING: Voor publieke weergave, toon GEEN login container
    // Alleen tonen als de gebruiker expliciet wil inloggen
    if (loginContainer) {
      loginContainer.style.display = 'none'; // Verander van 'flex' naar 'none'
      console.log('🚫 Login container hidden for public view');
    }
    
    // Keep main content visible for public viewing
    if (mainContent) {
      mainContent.style.display = 'block';
      console.log('📄 Main content kept visible for public');
    }
    
    // Hide user bar
    if (userBar) {
      userBar.style.display = 'none';
      console.log('🚫 User bar hidden');
    }
    
    // Hide admin and add sections for logged out users
    const toevoegenSection = document.getElementById('toevoegen');
    const adminSection = document.getElementById('admin-panel');
    
    if (toevoegenSection) {
      toevoegenSection.style.display = 'none';
      console.log('🚫 Toevoegen section hidden');
    }
    if (adminSection) {
      adminSection.style.display = 'none';
      console.log('🚫 Admin section hidden');
    }
    
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

    const marketData = await prepareMarketData(formData);
    await addDoc(collection(db, 'rommelmarkten'), marketData);
    
    showSuccessMessage('Geweldig evenement toegevoegd! 🎉');
    marketForm.reset();
    removeImage(); // Clear image preview
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
    beschrijving: document.getElementById('market-description').value.trim(),
    imageFile: marketImageInput ? marketImageInput.files[0] : null
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

  let imageUrl = '';
  if (formData.imageFile) {
    try {
      // Convert image to base64 for simple storage
      imageUrl = await convertImageToBase64(formData.imageFile);
    } catch (error) {
      console.warn('Fout bij verwerken afbeelding:', error);
    }
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
    imageUrl: imageUrl,
    toegevoegdOp: Timestamp.now(),
    status: 'actief'
  };
}

// DEBUG VERSION - Load markets for public viewing (when not logged in)
async function loadMarketsPublic() {
  console.log('🚀 loadMarketsPublic gestart');
  
  try {
    showLoadingState();
    console.log('📊 Loading state getoond');
    
    // Test of Firebase verbinding werkt
    console.log('🔗 Testen Firebase verbinding...');
    console.log('DB object:', db);
    console.log('Collection functie:', collection);
    
    let q;
    try {
      console.log('📋 Proberen query met orderBy datumStart...');
      q = query(
        collection(db, 'rommelmarkten'),
        orderBy('datumStart', 'asc')
      );
      console.log('✅ Query succesvol gemaakt');
    } catch (indexError) {
      console.log('❌ Index fout, proberen backup query...');
      console.error('Index error:', indexError);
      q = query(
        collection(db, 'rommelmarkten'),
        orderBy('toegevoegdOp', 'desc')
      );
      console.log('✅ Backup query succesvol gemaakt');
    }
    
    console.log('🔍 Uitvoeren van query...');
    const querySnapshot = await getDocs(q);
    console.log('📊 Query snapshot ontvangen:', querySnapshot);
    console.log('📊 Aantal documenten:', querySnapshot.size);
    
    if (querySnapshot.empty) {
      console.log('⚠️ Geen documenten gevonden in database');
      // Toon debug info
      if (marketsContainer) {
        marketsContainer.innerHTML = `
          <div style="text-align: center; padding: 2rem; background: #f8f9fa; border-radius: 8px;">
            <h3>🔍 Debug Info</h3>
            <p><strong>Database status:</strong> Verbonden</p>
            <p><strong>Query uitgevoerd:</strong> Ja</p>
            <p><strong>Documenten gevonden:</strong> 0</p>
            <p><strong>Collection naam:</strong> rommelmarkten</p>
            <p style="color: #666; font-size: 0.9rem;">
              Dit betekent dat de database leeg is of dat er een probleem is met de Firestore regels.
            </p>
          </div>
        `;
      }
      if (loadingMarketsDiv) loadingMarketsDiv.style.display = 'none';
      return;
    }
    
    const marketsMap = new Map(); // Voor duplicate filtering
    let processedCount = 0;

    querySnapshot.forEach((doc) => {
      processedCount++;
      const marketData = doc.data();
      console.log(`📋 Document ${processedCount}:`, {
        id: doc.id,
        naam: marketData.naam,
        datumStart: marketData.datumStart,
        status: marketData.status
      });
      
      const market = { id: doc.id, ...marketData };
      
      // Voor publieke weergave: toon alle actieve markten
      const isActive = !market.status || market.status === 'actief';
      console.log(`📊 Market ${market.naam} - Active: ${isActive}`);
      
      if (isActive) {
        // Filter duplicates op basis van naam + locatie + datum
        const uniqueKey = `${market.naam}-${market.locatie}-${market.datumStart.toDate().toDateString()}`;
        
        if (!marketsMap.has(uniqueKey)) {
          marketsMap.set(uniqueKey, market);
          console.log(`✅ Market toegevoegd: ${market.naam}`);
        } else {
          console.log(`🔄 Duplicate geskipt: ${market.naam}`);
        }
      } else {
        console.log(`❌ Inactieve market geskipt: ${market.naam}`);
      }
    });

    allMarkets = Array.from(marketsMap.values());
    console.log('📊 Finale markten array:', allMarkets.length);
    console.log('📊 Markten details:', allMarkets.map(m => ({ naam: m.naam, datum: m.datumStart.toDate() })));

    // Sorteer op datum (meest recente eerst voor debug)
    allMarkets.sort((a, b) => b.datumStart.toDate() - a.datumStart.toDate());

    currentPage = 1;
    
    console.log('🎯 Applying filters...');
    applyFilters();
    
    console.log('📊 Updating stats...');
    updateStats();
    
    console.log('🎪 Loading hero markets...');
    loadHeroMarkets();

    console.log('✅ Publieke markten geladen (na duplicate filtering):', allMarkets.length);

  } catch (error) {
    console.error('❌ Fout bij laden publieke evenementen:', error);
    console.error('Error stack:', error.stack);
    
    // Toon debug error info
    if (marketsContainer) {
      marketsContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; background: #fee; border-radius: 8px; border: 1px solid #fcc;">
          <h3>❌ Fout bij laden</h3>
          <p><strong>Error:</strong> ${error.message}</p>
          <p><strong>Type:</strong> ${error.code || 'Onbekend'}</p>
          <details style="margin-top: 1rem; text-align: left;">
            <summary>Technische details</summary>
            <pre style="background: #f5f5f5; padding: 1rem; overflow: auto; font-size: 0.8rem;">${error.stack}</pre>
          </details>
        </div>
      `;
    }
    
    if (loadingMarketsDiv) loadingMarketsDiv.style.display = 'none';
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
    const marketsMap = new Map(); // Voor duplicate filtering

    querySnapshot.forEach((doc) => {
      const market = { id: doc.id, ...doc.data() };
      
      // Voor ingelogde gebruikers: meer permissieve filtering voor debugging
      const now = new Date();
      const marketDate = market.datumStart.toDate();
      const isActive = !market.status || market.status === 'actief';
      
      // Tijdelijk: toon ook markten van de laatste 30 dagen voor debugging
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      if (isActive && marketDate > thirtyDaysAgo) {
        // Filter duplicates op basis van naam + locatie + datum
        const uniqueKey = `${market.naam}-${market.locatie}-${market.datumStart.toDate().toDateString()}`;
        
        if (!marketsMap.has(uniqueKey)) {
          marketsMap.set(uniqueKey, market);
        } else {
          console.log('Duplicate gevonden en geskipt:', market.naam);
        }
      }
    });

    allMarkets = Array.from(marketsMap.values());

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
    loadHeroMarkets(); // Load markets for hero section

    // Debug logging
    console.log('Ingelogde gebruiker - markten geladen (na duplicate filtering):', allMarkets.length);

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
      loadHeroMarkets();
      
    } catch (backupError) {
      console.error('Ook backup query mislukt:', backupError);
      showErrorState();
    }
  }
}

function showLoadingState() {
  console.log('📊 showLoadingState called');
  if (loadingMarketsDiv) {
    loadingMarketsDiv.style.display = 'block';
    console.log('✅ Loading div shown');
  }
  if (marketsContainer) {
    marketsContainer.style.display = 'none';
    console.log('🚫 Markets container hidden');
  }
  if (noMarketsDiv) {
    noMarketsDiv.style.display = 'none';
    console.log('🚫 No markets div hidden');
  }
  if (loadMoreContainer) {
    loadMoreContainer.style.display = 'none';
  }
}

function applyFilters() {
  console.log('🎯 applyFilters gestart');
  console.log('📊 allMarkets length:', allMarkets ? allMarkets.length : 'undefined');
  
  if (!allMarkets) {
    console.log('❌ allMarkets is undefined/null');
    return;
  }
  
  const typeFilter = filterType ? filterType.value.toLowerCase() : '';
  const locationFilter = filterLocation ? filterLocation.value.toLowerCase() : '';
  const dateFilter = filterDate ? filterDate.value : '';
  
  console.log('🔍 Filters:', { typeFilter, locationFilter, dateFilter });
  
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
  
  console.log('📊 Filtered markets count:', filteredMarkets.length);
  
  currentPage = 1;
  displayMarkets();
  updateResultsInfo();
}

function displayMarkets() {
  console.log('🎬 displayMarkets called');
  console.log('📊 filteredMarkets:', filteredMarkets ? filteredMarkets.length : 'undefined');
  
  if (loadingMarketsDiv) {
    loadingMarketsDiv.style.display = 'none';
    console.log('🚫 Loading div hidden');
  }
  
  if (!filteredMarkets || filteredMarkets.length === 0) {
    console.log('❌ No filtered markets to display');
    if (marketsContainer) {
      marketsContainer.style.display = 'none';
      console.log('🚫 Markets container hidden (no markets)');
    }
    if (noMarketsDiv) {
      noMarketsDiv.style.display = 'block';
      console.log('✅ No markets div shown');
    }
    if (loadMoreContainer) {
      loadMoreContainer.style.display = 'none';
    }
    return;
  }
  
  console.log('✅ Displaying markets');
  if (noMarketsDiv) {
    noMarketsDiv.style.display = 'none';
    console.log('🚫 No markets div hidden');
  }
  if (marketsContainer) {
    marketsContainer.style.display = currentView === 'grid' ? 'grid' : 'block';
    marketsContainer.className = currentView === 'grid' ? 'markets-grid' : 'markets-list';
    console.log(`✅ Markets container shown in ${currentView} view`);
  }
  
  const startIndex = (currentPage - 1) * marketsPerPage;
  const endIndex = Math.min(startIndex + marketsPerPage, filteredMarkets.length);
  const marketsToShow = filteredMarkets.slice(0, endIndex);
  
  console.log(`📊 Showing ${marketsToShow.length} markets (${startIndex} to ${endIndex})`);
  
  if (marketsContainer) {
    marketsContainer.innerHTML = '';
    marketsToShow.forEach((market, index) => {
      console.log(`🏪 Creating card for: ${market.naam}`);
      const marketElement = createMarketCard(market);
      marketsContainer.appendChild(marketElement);
    });
    console.log('✅ All market cards added to container');
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
  const hasImage = market.imageUrl && market.imageUrl !== '';
  
  return `
    <div class="market-date-badge">
      ${dateTime.dayMonth}
    </div>
    
    ${isAdmin ? `
      <div class="market-admin-controls">
        <button onclick="deleteMarket('${market.id}')" class="btn-delete-market" title="Verwijder markt">
          🗑️
        </button>
      </div>
    ` : ''}
    
    ${hasImage ? `
      <img src="${market.imageUrl}" alt="${escapeHtml(market.naam)}" class="market-image" loading="lazy">
    ` : `
      <div class="market-image" style="background: linear-gradient(135deg, ${getGradientForType(market.type)}); display: flex; align-items: center; justify-content: center; font-size: 3rem;">
        ${eventType.icon}
      </div>
    `}
    
    <div class="market-card-content">
      <div class="market-type-badge ${eventType.color}">
        ${eventType.icon} ${eventType.label}
      </div>
      
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
        
        ${market.contact ? `
          <div class="market-detail">
            <span class="market-detail-icon">📞</span>
            <span>${escapeHtml(market.contact)}</span>
          </div>
        ` : ''}
      </div>
      
      ${market.beschrijving ? `
        <div class="market-description">
          ${escapeHtml(market.beschrijving.substring(0, 120))}${market.beschrijving.length > 120 ? '...' : ''}
        </div>
      ` : ''}
    </div>
    
    <div class="market-footer">
      ✨ Toegevoegd op ${formatDate(market.toegevoegdOp)}
    </div>
  `;
}

function createListView(market, eventType, dateTime, endTime) {
  const hasImage = market.imageUrl && market.imageUrl !== '';
  
  return `
    ${hasImage ? `
      <img src="${market.imageUrl}" alt="${escapeHtml(market.naam)}" class="market-image" loading="lazy">
    ` : `
      <div class="market-image" style="background: linear-gradient(135deg, ${getGradientForType(market.type)}); display: flex; align-items: center; justify-content: center; font-size: 2rem;">
        ${eventType.icon}
      </div>
    `}
    
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

// Load markets for hero section
function loadHeroMarkets() {
  console.log('🎪 loadHeroMarkets called');
  if (!heroMarketsContainer) {
    console.log('❌ heroMarketsContainer not found');
    return;
  }
  
  // Get next 3 upcoming markets
  const upcomingMarkets = allMarkets
    .filter(market => market.datumStart.toDate() > new Date())
    .slice(0, 3);
  
  console.log('🎪 Upcoming markets for hero:', upcomingMarkets.length);
  
  heroMarketsContainer.innerHTML = '';
  
  if (upcomingMarkets.length === 0) {
    heroMarketsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: rgba(255,255,255,0.8);">
        <div style="font-size: 2rem; margin-bottom: 1rem;">🎪</div>
        <p>Binnenkort komen er nieuwe geweldige markten!</p>
      </div>
    `;
    return;
  }
  
  upcomingMarkets.forEach((market, index) => {
    console.log(`🎪 Adding hero market ${index + 1}: ${market.naam}`);
    const eventType = eventTypes[market.type] || eventTypes.rommelmarkt;
    const dateTime = formatDateTime(market.datumStart);
    const endTime = market.datumEind ? formatTime(market.datumEind) : null;
    
    const heroCard = document.createElement('div');
    heroCard.className = 'market-card';
    heroCard.style.cssText = 'background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);';
    
    const hasImage = market.imageUrl && market.imageUrl !== '';
    
    heroCard.innerHTML = `
      ${hasImage ? `
        <img src="${market.imageUrl}" alt="${escapeHtml(market.naam)}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 15px 15px 0 0;">
      ` : `
        <div style="width: 100%; height: 150px; background: linear-gradient(135deg, ${getGradientForType(market.type)}); display: flex; align-items: center; justify-content: center; font-size: 3rem; border-radius: 15px 15px 0 0;">
          ${eventType.icon}
        </div>
      `}
      
      <div style="padding: 1.5rem;">
        <div class="market-type-badge ${eventType.color}" style="margin-bottom: 1rem;">
          ${eventType.icon} ${eventType.label}
        </div>
        <h3 style="color: white; margin-bottom: 1rem; font-size: 1.2rem;">${escapeHtml(market.naam)}</h3>
        <div style="color: rgba(255,255,255,0.9); font-size: 0.9rem;">
          📅 ${dateTime.dayName}<br>
          🕐 ${dateTime.time}${endTime ? ` - ${endTime}` : ''}<br>
          📍 ${escapeHtml(market.locatie)}
        </div>
      </div>
    `;
    
    heroMarketsContainer.appendChild(heroCard);
  });
  
  console.log('✅ Hero markets loaded');
}

// Image upload handling
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('Bestand is te groot. Maximum 5MB toegestaan.');
    event.target.value = '';
    return;
  }
  
  // Check file type
  if (!file.type.startsWith('image/')) {
    alert('Alleen afbeeldingen zijn toegestaan.');
    event.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    if (previewImg && imagePreview) {
      previewImg.src = e.target.result;
      imagePreview.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  if (marketImageInput) marketImageInput.value = '';
  if (imagePreview) imagePreview.style.display = 'none';
  if (previewImg) previewImg.src = '';
}

// Get gradient colors for market types
function getGradientForType(type) {
  const gradients = {
    rommelmarkt: '#48bb78, #38a169',
    garageverkoop: '#ed8936, #dd6b20',
    braderie: '#667eea, #764ba2',
    kermis: '#e53e3e, #c53030',
    boerenmarkt: '#38a169, #2f855a',
    antiekmarkt: '#d69e2e, #b7791f',
    feest: '#9f7aea, #805ad5'
  };
  return gradients[type] || gradients.rommelmarkt;
}

// Convert image to base64 for storage
function convertImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    console.log(`📊 Results info updated: ${count} ${word}`);
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

// Delete individual market (admin only)
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
    
    showSuccessMessage('Markt succesvol verwijderd! 🗑️');
    
    // Remove from local array
    allMarkets = allMarkets.filter(m => m.id !== marketId);
    
    // Refresh display
    applyFilters();
    updateStats();
    loadHeroMarkets();
    
    console.log('Markt verwijderd:', market.naam);
    
  } catch (error) {
    console.error('Fout bij verwijderen van markt:', error);
    alert('Er ging iets mis bij het verwijderen. Probeer opnieuw.');
  }
}

// Make deleteMarket globally accessible for onclick handlers
if (typeof window !== 'undefined') {
  window.deleteMarket = deleteMarket;
}

// Test functie om handmatig markten toe te voegen (voor debugging)
async function addTestMarket() {
  if (!currentUser) {
    console.log('❌ Geen gebruiker ingelogd voor test market');
    return;
  }
  
  try {
    const testMarket = {
      userId: currentUser.uid,
      email: currentUser.email,
      naam: 'Test Rommelmarkt',
      type: 'rommelmarkt',
      locatie: 'Teststraat 1, 1000 Brussel',
      organisator: 'Test Organisator',
      datumStart: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // Volgende week
      datumEind: null,
      aantalStanden: 50,
      standgeld: 2.5,
      contact: 'test@example.com',
      beschrijving: 'Dit is een test rommelmarkt voor debugging',
      imageUrl: '',
      toegevoegdOp: Timestamp.now(),
      status: 'actief'
    };
    
    console.log('🧪 Adding test market:', testMarket);
    const docRef = await addDoc(collection(db, 'rommelmarkten'), testMarket);
    console.log('✅ Test market added with ID:', docRef.id);
    
    // Reload markets
    loadMarketsPublic();
    
  } catch (error) {
    console.error('❌ Error adding test market:', error);
  }
}

// Console helper functies voor debugging
console.log('🔧 Debug functies beschikbaar in console:');
console.log('  - loadMarketsPublic() - Herlaad markten met debug output');
console.log('  - addTestMarket() - Voeg test market toe (als ingelogd)');
console.log('  - allMarkets - Bekijk alle geladen markten');
console.log('  - filteredMarkets - Bekijk gefilterde markten');

// Maak functies globaal beschikbaar voor console testing
if (typeof window !== 'undefined') {
  window.debugLoadMarkets = loadMarketsPublic;
  window.addTestMarket = addTestMarket;
  window.debugInfo = () => {
    console.log('🔍 Debug Info:');
    console.log('- Current User:', currentUser);
    console.log('- All Markets:', allMarkets);
    console.log('- Filtered Markets:', filteredMarkets);
    console.log('- Markets Container:', marketsContainer);
    console.log('- Loading Div:', loadingMarketsDiv);
    console.log('- No Markets Div:', noMarketsDiv);
  };
}
