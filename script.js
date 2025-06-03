// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  databaseURL: "https://unonomercy-66ba7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.firebasestorage.app",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Test connection
db.ref(".info/connected").on("value", (snap) => {
  console.log(snap.val() ? "✅ Connected to Firebase" : "❌ Not connected to Firebase");
});

function joinGame() {
  const playerName = document.getElementById("name").value.trim();
  if (!playerName) {
    alert("Please enter a name");
    return;
  }

  const roomId = "default_room";
  const playerRef = db.ref(`games/${roomId}/players/${playerName}`);
  playerRef.set({ name: playerName });

  // Listen for game state updates
  db.ref(`games/${roomId}`).on("value", (snapshot) => {
    const gameData = snapshot.val();
    if (gameData) {
      console.log("🎮 Game data:", gameData);
      updateUI(gameData);
    }
  });

  document.getElementById("lobby").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
}

function drawCard() {
  alert("Draw card function not implemented yet.");
}

function updateUI(gameData) {
  const playerHand = document.getElementById("playerHand");
  const turnIndicator = document.getElementById("turnIndicator");

  const players = gameData.players || {};
  turnIndicator.textContent = `Players in game: ${Object.keys(players).join(", ")}`;

  // Example card display
  playerHand.innerHTML = '';
  const sampleCard = document.createElement("div");
  sampleCard.className = "card";
  sampleCard.textContent = "Red 5";
  playerHand.appendChild(sampleCard);
}
