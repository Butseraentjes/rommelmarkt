// firebase.js
// Deze versie gebruikt de moderne modulaire Firebase SDK via ESM (ES Modules)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

// 🧾 Exporteer functies en variabelen
export {
  auth,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  db,
  collection,
  addDoc,
  getDocs,
  query,
  where
};
