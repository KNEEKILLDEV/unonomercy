// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.appspot.com",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR",
  databaseURL: "https://unonomercy-66ba7-default-rtdb.firebaseio.com"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let playerId = null;
let roomId = "default_room";

// Join game
function joinGame() {
  const nameInput = document.getElementById("name");
  const name = nameInput.value || "Player";
  playerId = "player_" + Math.random().toString(36).substring(2, 8);

  const playerRef = db.ref(`games/${roomId}/players/${playerId}`);
  playerRef.set({
    name: name,
    hand: [],
    isTurn: false
  });

  playerRef.onDisconnect().remove(); // Remove player on disconnect

  // Load and watch game
  db.ref(`games/${roomId}`).on("value", (snapshot) => {
    const gameData = snapshot.val();
    if (gameData) {
      updateUI(gameData);
    }
  });

  // Initial draw
  drawInitialCards();
}

// Draw starting cards
function drawInitialCards() {
  const cards = [];
  for (let i = 0; i < 7; i++) {
    cards.push(getRandomCard());
  }

  db.ref(`games/${roomId}/players/${playerId}/hand`).set(cards);
}

// Generate a random card
function getRandomCard() {
  const colors = ["red", "green", "blue", "yellow", "wild"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse", "+2"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const value = (color === "wild") ? "+4" : values[Math.floor(Math.random() * values.length)];
  return { color, value };
}

// Draw a new card
function drawCard() {
  const card = getRandomCard();
  const handRef = db.ref(`games/${roomId}/players/${playerId}/hand`);
  handRef.once("value", (snapshot) => {
    const hand = snapshot.val() || [];
    hand.push(card);
    handRef.set(hand);
  });
}

// Update the UI
function updateUI(game) {
  const handDiv = document.getElementById("playerHand");
  const pileDiv = document.getElementById("discardPile");
  const turnText = document.getElementById("turnIndicator");

  const player = game.players?.[playerId];
  const hand = player?.hand || [];

  handDiv.innerHTML = "";
  hand.forEach(card => {
    const cardDiv = document.createElement("div");
    cardDiv.className = `card ${card.color}`;
    cardDiv.innerText = card.value;
    handDiv.appendChild(cardDiv);
  });

  const topCard = game.discardPile?.slice(-1)[0];
  pileDiv.innerHTML = topCard ? `<div class="card ${topCard.color}">${topCard.value}</div>` : "";

  const isMyTurn = game.currentTurn === playerId;
  turnText.innerText = isMyTurn ? "Your turn!" : "Waiting for your turn...";
}
