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
  Timestamp
} from './firebase.js';

// DOM elementen
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginContainer = document.getElementById('login-container');
const mainContent = document.getElementById('main-content');
const userEmail = document.getElementById('user-email');
const marketForm = document.getElementById('market-form');
const marketsContainer = document.getElementById('markets-container');

// Login functionaliteit
loginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error('Login fout:', err);
    alert('Er ging iets mis bij het inloggen. Probeer opnieuw.');
  }
});

// Logout functionaliteit
logoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Logout fout:', err);
  }
});

// Auth state observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginContainer.style.display = 'none';
    mainContent.style.display = 'block';
    userEmail.textContent = `Ingelogd als: ${user.email}`;
    loadMarkets(); // Laad rommelmarkten wanneer gebruiker ingelogd is
  } else {
    loginContainer.style.display = 'block';
    mainContent.style.display = 'none';
  }
});

// Rommelmarkt toevoegen
marketForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const user = auth.currentUser;
  if (!user) {
    alert('Je moet ingelogd zijn om een rommelmarkt toe te voegen.');
    return;
  }

  // Haal formulier data op
  const naam = document.getElementById('market-name').value.trim();
  const locatie = document.getElementById('market-location').value.trim();
  const datum = document.getElementById('market-date').value;
  const tijd = document.getElementById('market-time').value;
  const beschrijving = document.getElementById('market-description').value.trim();

  // Validatie
  if (!naam || !locatie || !datum || !tijd) {
    alert('Vul alle verplichte velden in.');
    return;
  }

  // Combineer datum en tijd
  const dateTimeString = `${datum}T${tijd}`;
  const marktDatum = new Date(dateTimeString);

  // Check of datum in het verleden ligt
  if (marktDatum < new Date()) {
    alert('De datum kan niet in het verleden liggen.');
    return;
  }

  const formData = {
    userId: user.uid,
    email: user.email,
    naam: naam,
    locatie: locatie,
    datum: Timestamp.fromDate(marktDatum),
    beschrijving: beschrijving || '',
    toegevoegdOp: Timestamp.now()
  };

  try {
    await addDoc(collection(db, 'rommelmarkten'), formData);
    alert('Rommelmarkt succesvol toegevoegd!');
    marketForm.reset();
    loadMarkets(); // Herlaad de lijst
  } catch (error) {
    console.error('Fout bij toevoegen:', error);
    alert('Er ging iets mis bij het toevoegen. Probeer opnieuw.');
  }
});

// Laad en toon rommelmarkten
async function loadMarkets() {
  try {
    const q = query(
      collection(db, 'rommelmarkten'),
      orderBy('datum', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    marketsContainer.innerHTML = '';

    if (querySnapshot.empty) {
      marketsContainer.innerHTML = '<p>Nog geen rommelmarkten toegevoegd.</p>';
      return;
    }

    querySnapshot.forEach((doc) => {
      const market = doc.data();
      const marketElement = createMarketCard(market);
      marketsContainer.appendChild(marketElement);
    });

  } catch (error) {
    console.error('Fout bij laden rommelmarkten:', error);
    marketsContainer.innerHTML = '<p>Fout bij het laden van rommelmarkten.</p>';
  }
}

// Maak een rommelmarkt kaart element
function createMarketCard(market) {
  const card = document.createElement('div');
  card.className = 'market-card';

  // Converteer Firestore Timestamp naar JavaScript Date
  const marktDatum = market.datum.toDate();
  const toegevoegdOp = market.toegevoegdOp.toDate();

  // Formateer datum en tijd
  const datumFormatted = marktDatum.toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const tijdFormatted = marktDatum.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const toegevoegdFormatted = toegevoegdOp.toLocaleDateString('nl-NL');

  card.innerHTML = `
    <h4>${market.naam}</h4>
    <div class="market-location">📍 ${market.locatie}</div>
    <div class="market-datetime">🗓️ ${datumFormatted} om ${tijdFormatted}</div>
    ${market.beschrijving ? `<div class="market-description">${market.beschrijving}</div>` : ''}
    <div class="market-added-by">Toegevoegd door ${market.email} op ${toegevoegdFormatted}</div>
  `;

  return card;
}
