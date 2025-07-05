// firebase.js
// Deze versie gebruikt de moderne modulaire Firebase SDK via ESM (ES Modules)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  Timestamp,
  limit,
  startAfter,
  deleteDoc,
  doc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 🔥 Jouw Firebase-configuratie (deze is publiek bruikbaar voor frontend-projecten)
const firebaseConfig = {
  apiKey: "AIzaSyDpSmCzd1fN1ueZ3Ns2LImBkxmUupVmvoo",
  authDomain: "rommelmarkt-in-je-buurt.firebaseapp.com",
  projectId: "rommelmarkt-in-je-buurt",
  storageBucket: "rommelmarkt-in-je-buurt.appspot.com",
  messagingSenderId: "910031531073",
  appId: "1:910031531073:web:3afc97af1e0fbac6bb6ac0"
};

// 🚀 Initialiseer Firebase app
const app = initializeApp(firebaseConfig);

// 🔐 Firebase Auth setup
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 🗃️ Firestore database
const db = getFirestore(app);

// 📅 Helper functies voor datum/tijd
export const formatDate = (timestamp) => {
  const date = timestamp.toDate();
  return date.toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const formatTime = (timestamp) => {
  const date = timestamp.toDate();
  return date.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDateTime = (timestamp) => {
  const date = timestamp.toDate();
  return {
    date: formatDate(timestamp),
    time: formatTime(timestamp),
    dayName: date.toLocaleDateString('nl-NL', { weekday: 'long' }),
    dayMonth: date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  };
};

// 🎯 Type mappings en iconen
export const eventTypes = {
  rommelmarkt: { 
    label: 'Rommelmarkt', 
    icon: '🏪',
    color: 'type-rommelmarkt'
  },
  garageverkoop: { 
    label: 'Garageverkoop', 
    icon: '🏠',
    color: 'type-garageverkoop'
  },
  braderie: { 
    label: 'Braderie', 
    icon: '🛍️',
    color: 'type-braderie'
  },
  kermis: { 
    label: 'Kermis', 
    icon: '🎡',
    color: 'type-kermis'
  },
  boerenmarkt: { 
    label: 'Boerenmarkt', 
    icon: '🥕',
    color: 'type-boerenmarkt'
  },
  antiekmarkt: { 
    label: 'Antiekmarkt', 
    icon: '🏺',
    color: 'type-antiekmarkt'
  },
  feest: { 
    label: 'Dorps-/stadsfeest', 
    icon: '🎉',
    color: 'type-feest'
  }
};

// 🧾 Exporteer functies en variabelen
export {
  auth,
  provider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  db,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  limit,
  startAfter,
  deleteDoc,
  doc,
  updateDoc
};
