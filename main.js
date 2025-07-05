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
const userEmail = document.getElementById('user-email');
const marketForm = document.getElementById('market-form');
const marketsContainer = document.getElementById('markets-container');
const noMarketsDiv = document.getElementById('no-markets');
const filterType = document.getElementById('filter-type');
const filterLocation = document.getElementById('filter-location');
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
let currentUser = null;
let isAdmin = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateStats();
});

// Event listeners
function setupEventListeners() {
  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  marketForm.addEventListener('submit', handleAddMarket);
  filterType.addEventListener('change', filterMarkets);
  filterLocation.addEventListener('input', debounce(filterMarkets, 300));
  
  // Admin event listeners
  bulkImportForm.addEventListener('submit', handleBulkImport);
  clearAllBtn.addEventListener('click', handleClearAll);
  
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
    
    // Extra configuratie voor popup om CORP warnings te minimaliseren
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    const result = await signInWithPopup(auth, provider);
    console.log('Login succesvol:', result.user.email);
    
  } catch (err) {
    console.error('Login fout:', err);
    
    // Specifieke foutafhandeling
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
    loginContainer.style.display = 'none';
    mainContent.style.display = 'block';
    userEmail.textContent = user.email;
    
    // Check if user is admin
    isAdmin = adminEmails.includes(user.email);
    adminPanel.style.display = isAdmin ? 'block' : 'none';
    
    loadMarkets();
  } else {
    loginContainer.style.display = 'flex';
    mainContent.style.display = 'none';
    adminPanel.style.display = 'none';
    currentUser = null;
    isAdmin = false;
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

    // Haal formulier data op
    const formData = getFormData();
    
    // Validatie
    const validation = validateFormData(formData);
    if (!validation.isValid) {
      alert(validation.message);
      return;
    }

    // Bereid data voor database voor
    const marketData = prepareMarketData(formData);

    // Voeg toe aan database
    await addDoc(collection(db, 'rommelmarkten'), marketData);
    
    // Success feedback
    showSuccessMessage('Evenement succesvol toegevoegd!');
    marketForm.reset();
    loadMarkets();
    
    // Scroll naar markten sectie
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

  // Check datum
  const startDateTime = new Date(`${data.datum}T${data.tijdStart}`);
  const now = new Date();
  
  if (startDateTime < now) {
    return { isValid: false, message: 'De datum en tijd kunnen niet in het verleden liggen.' };
  }

  // Check eindtijd
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

// Load and display markets
async function loadMarkets() {
  try {
    showLoadingState();
    
    // Tijdelijke fallback zonder status filter als index nog niet bestaat
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
      
      // Filter op actieve status en toekomstige evenementen
      const now = new Date();
      const marketDate = market.datumStart.toDate();
      const isActive = !market.status || market.status === 'actief';
      
      if (marketDate > now && isActive) {
        allMarkets.push(market);
      }
    });

    displayMarkets(allMarkets);
    updateStats();

  } catch (error) {
    console.error('Fout bij laden evenementen:', error);
    
    // Probeer backup query zonder where clause
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
      
      // Sorteer handmatig op datum
      allMarkets.sort((a, b) => a.datumStart.toDate() - b.datumStart.toDate());
      
      displayMarkets(allMarkets);
      updateStats();
      
    } catch (backupError) {
      console.error('Ook backup query mislukt:', backupError);
      showErrorState();
    }
  }
}

function displayMarkets(markets) {
  marketsContainer.innerHTML = '';
  
  if (markets.length === 0) {
    noMarketsDiv.style.display = 'block';
    return;
  }
  
  noMarketsDiv.style.display = 'none';
  
  markets.forEach(market => {
    const marketElement = createMarketCard(market);
    marketsContainer.appendChild(marketElement);
  });
}

function createMarketCard(market) {
  const card = document.createElement('div');
  card.className = 'market-card';
  
  const eventType = eventTypes[market.type] || eventTypes.rommelmarkt;
  const dateTime = formatDateTime(market.datumStart);
  const endTime = market.datumEind ? formatTime(market.datumEind) : null;
  
  card.innerHTML = `
    <div class="market-type-badge ${eventType.color}">
      ${eventType.icon} ${eventType.label}
    </div>
    
    <h3>${escapeHtml(market.naam)}</h3>
    
    <div class="market-date-time">
      📅 ${dateTime.date}
      <br>
      🕐 ${dateTime.time}${endTime ? ` - ${endTime}` : ''}
    </div>
    
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
    
    ${market.beschrijving ? `
      <div class="market-description">
        ${escapeHtml(market.beschrijving)}
      </div>
    ` : ''}
    
    <div class="market-added-by">
      Toegevoegd door ${escapeHtml(market.email)} op ${formatDate(market.toegevoegdOp)}
    </div>
  `;
  
  return card;
}

// Filter functions
function filterMarkets() {
  const typeFilter = filterType.value.toLowerCase();
  const locationFilter = filterLocation.value.toLowerCase();
  
  let filteredMarkets = allMarkets;
  
  // Filter op type
  if (typeFilter) {
    filteredMarkets = filteredMarkets.filter(market => 
      market.type === typeFilter
    );
  }
  
  // Filter op locatie
  if (locationFilter) {
    filteredMarkets = filteredMarkets.filter(market => 
      market.locatie.toLowerCase().includes(locationFilter) ||
      market.naam.toLowerCase().includes(locationFilter) ||
      (market.organisator && market.organisator.toLowerCase().includes(locationFilter))
    );
  }
  
  displayMarkets(filteredMarkets);
}

// Utility functions
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

function showLoadingState() {
  marketsContainer.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: #718096;">
      <div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
      <p>Evenementen laden...</p>
    </div>
  `;
  noMarketsDiv.style.display = 'none';
}

function showErrorState() {
  marketsContainer.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: #e53e3e;">
      <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
      <p>Fout bij het laden van evenementen. Probeer de pagina te verversen.</p>
    </div>
  `;
  noMarketsDiv.style.display = 'none';
}

function showSuccessMessage(message) {
  // Creer een tijdelijke success melding
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
  
  // Verwijder na 3 seconden
  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}

function updateStats() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  // Count markets this month
  const thisMonthCount = allMarkets.filter(market => {
    const marketDate = market.datumStart.toDate();
    return marketDate >= now && marketDate <= thisMonth;
  }).length;
  
  // Count markets next week
  const nextWeekCount = allMarkets.filter(market => {
    const marketDate = market.datumStart.toDate();
    return marketDate >= now && marketDate <= nextWeek;
  }).length;
  
  // Animate counters
  animateCounter(totalMarketsSpan, thisMonthCount);
  animateCounter(upcomingMarketsSpan, nextWeekCount);
}

function animateCounter(element, targetValue) {
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
        
        // Update progress
        updateImportProgress(i + 1, markets.length);
        
      } catch (error) {
        console.error('Fout bij importeren van markt:', error);
        errors++;
      }
    }
    
    const resultMsg = `Import voltooid! ✅ ${imported} geïmporteerd, ❌ ${errors} fouten.`;
    showImportResult(resultMsg, 'success');
    
    // Clear textarea and reload markets
    bulkDataTextarea.value = '';
    loadMarkets();
    
  } catch (error) {
    console.error('Bulk import fout:', error);
    showImportResult(`Fout bij importeren: ${error.message}`, 'error');
  }
}

function parseRommelmarktData(rawData) {
  const markets = [];
  
  // Split data into lines and process
  const lines = rawData.split('\n').filter(line => line.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and headers
    if (!line || line.includes('Rommelmarkten') || line.includes('Toggle navigation')) {
      continue;
    }
    
    try {
      const market = parseMarketLine(line);
      if (market) {
        markets.push(market);
      }
    } catch (error) {
      console.warn('Kon regel niet verwerken:', line, error);
    }
  }
  
  return markets;
}

function parseMarketLine(line) {
  // Basis regex patterns voor verschillende data formaten
  const patterns = [
    // Pattern: PLAATS (postcode) AdresType evenementDatum tijd Type evenement
    /^([A-Z\s-]+)\s*\((\d{4})\)\s*([^A-Z]+?)([A-Z].*?)(\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)|\d{1,2}\s+\w+\s+\d{4})\s+(\d{1,2}u\d{2}.*?)([A-Z].*?)$/i,
    
    // Pattern voor andere formaten
    /^([A-Z\s-]+)\s*\((\d{4})\)\s*(.*?)(\d{1,2}\s+\w+\s+\d{4})\s+(.*?)$/i
  ];
  
  // Probeer verschillende patterns
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return extractMarketInfo(match, line);
    }
  }
  
  // Fallback: probeer simpele extractie
  return extractMarketInfoSimple(line);
}

function extractMarketInfo(match, originalLine) {
  try {
    const [, plaats, postcode, adres, naam, datumStr, tijdStr, type] = match;
    
    // Parse datum
    const datum = parseDutchDate(datumStr);
    if (!datum) return null;
    
    // Parse tijd
    const { startTijd, eindTijd } = parseTijden(tijdStr);
    
    // Bepaal type
    const evenementType = bepaalType(type || naam || originalLine);
    
    return {
      naam: naam?.trim() || `Rommelmarkt ${plaats}`,
      type: evenementType,
      locatie: `${adres?.trim() || 'Centrum'}, ${postcode} ${plaats}`,
      datumStart: Timestamp.fromDate(new Date(`${datum}T${startTijd || '09:00'}`)),
      datumEind: eindTijd ? Timestamp.fromDate(new Date(`${datum}T${eindTijd}`)) : null,
      beschrijving: `Automatisch geïmporteerd evenement in ${plaats}`,
      organisator: '',
      contact: '',
      aantalStanden: null,
      standgeld: null
    };
  } catch (error) {
    console.warn('Fout bij extracten van marktinfo:', error);
    return null;
  }
}

function extractMarketInfoSimple(line) {
  // Simpele fallback extractie
  const words = line.split(/\s+/);
  let plaats = '';
  let postcode = '';
  let datum = null;
  
  // Zoek postcode
  for (let word of words) {
    if (/^\(\d{4}\)$/.test(word)) {
      postcode = word.replace(/[()]/g, '');
      break;
    }
  }
  
  // Zoek plaats (woorden voor postcode)
  const postcodeIndex = words.findIndex(w => w.includes(postcode));
  if (postcodeIndex > 0) {
    plaats = words.slice(0, postcodeIndex).join(' ').replace(/[^A-Za-z\s-]/g, '');
  }
  
  // Zoek datum
  const datePattern = /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|\w+)\s+(\d{4})/i;
  const dateMatch = line.match(datePattern);
  if (dateMatch) {
    datum = parseDutchDate(dateMatch[0]);
  }
  
  if (!plaats || !datum) return null;
  
  return {
    naam: `Rommelmarkt ${plaats}`,
    type: 'rommelmarkt',
    locatie: `Centrum, ${postcode} ${plaats}`,
    datumStart: Timestamp.fromDate(new Date(`${datum}T09:00`)),
    datumEind: null,
    beschrijving: `Automatisch geïmporteerd evenement in ${plaats}`,
    organisator: '',
    contact: '',
    aantalStanden: null,
    standgeld: null
  };
}

function parseDutchDate(dateStr) {
  const maanden = {
    'januari': '01', 'februari': '02', 'maart': '03', 'april': '04',
    'mei': '05', 'juni': '06', 'juli': '07', 'augustus': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mrt': '03', 'apr': '04',
    'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09',
    'okt': '10', 'nov': '11', 'dec': '12'
  };
  
  // Pattern: "6 juli 2025" of "12 juli 2025"
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

function parseTijden(tijdStr) {
  let startTijd = '09:00';
  let eindTijd = null;
  
  // Pattern: "08u00 - 16u00" of "9:00 - 17:00"
  const tijdMatch = tijdStr.match(/(\d{1,2})[u:](\d{2})(?:\s*-\s*(\d{1,2})[u:](\d{2}))?/);
  if (tijdMatch) {
    const [, startUur, startMin, eindUur, eindMin] = tijdMatch;
    startTijd = `${startUur.padStart(2, '0')}:${startMin}`;
    if (eindUur && eindMin) {
      eindTijd = `${eindUur.padStart(2, '0')}:${eindMin}`;
    }
  }
  
  return { startTijd, eindTijd };
}

function bepaalType(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('garage')) return 'garageverkoop';
  if (lowerText.includes('braderie')) return 'braderie';
  if (lowerText.includes('kermis')) return 'kermis';
  if (lowerText.includes('boerenmarkt')) return 'boerenmarkt';
  if (lowerText.includes('antiek') || lowerText.includes('brocante')) return 'antiekmarkt';
  if (lowerText.includes('feest')) return 'feest';
  
  return 'rommelmarkt'; // default
}

function showImportResult(message, type) {
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
