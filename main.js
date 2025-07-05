import { auth, provider, db, signInWithPopup, onAuthStateChanged, collection, addDoc } from './firebase.js';

const loginBtn = document.getElementById('login-btn');
const loginContainer = document.getElementById('login-container');
const mainContent = document.getElementById('main-content');
const userEmail = document.getElementById('user-email');
const addMarketBtn = document.getElementById('add-market');

loginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginContainer.style.display = 'none';
    mainContent.style.display = 'block';
    userEmail.textContent = `Ingelogd als: ${user.email}`;
  } else {
    loginContainer.style.display = 'block';
    mainContent.style.display = 'none';
  }
});

addMarketBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;

  await addDoc(collection(db, 'rommelmarkten'), {
    userId: user.uid,
    email: user.email,
    locatie: 'Voorbeeldstraat 123, 9000 Gent',
    toegevoegdOp: new Date()
  });

  alert('Rommelmarkt toegevoegd!');
});
