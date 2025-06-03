// Firebase config and initialization (your existing config)
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
async function joinGame() {
  const nameInput = document.getElementById("name");
  const name = nameInput.value.trim() || "Player";
  playerId = "player_" + Math.random().toString(36).substring(2, 8);

  // Add player to DB
  const playerRef = db.ref(`games/${roomId}/players/${playerId}`);
  await playerRef.set({
    name: name,
    hand: [],
    isTurn: false
  });
  playerRef.onDisconnect().remove(); // Remove player on disconnect

  // Check if game needs initialization
  const gameRef = db.ref(`games/${roomId}`);
  const snapshot = await gameRef.once("value");
  if (!snapshot.exists()) {
    // Initialize game if first player
    initializeGame(playerId);
  }

  // Listen for game state changes
  gameRef.on("value", (snapshot) => {
    const game = snapshot.val();
    if (game) updateUI(game);
  });

  // Draw initial cards for this player if empty
  const handSnapshot = await playerRef.child("hand").once("value");
  if (!handSnapshot.exists() || handSnapshot.val().length === 0) {
    drawInitialCards();
  }

  // Show game area
  document.getElementById("gameArea").style.display = "block";
}

// Initialize game with starting discard card and turn
function initializeGame(startPlayerId) {
  const initialCard = getRandomCard();
  db.ref(`games/${roomId}`).set({
    discardPile: [initialCard],
    currentTurn: startPlayerId,
    players: {}
  });
}

// Draw 7 initial cards
async function drawInitialCards() {
  const cards = [];
  for (let i = 0; i < 7; i++) {
    cards.push(getRandomCard());
  }
  await db.ref(`games/${roomId}/players/${playerId}/hand`).set(cards);
}

// Generate random card (simplified)
function getRandomCard() {
  const colors = ["red", "green", "blue", "yellow"];
  const values = ["0","1","2","3","4","5","6","7","8","9","Skip","Reverse","+2"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const value = values[Math.floor(Math.random() * values.length)];
  return { color, value };
}

// Draw one card (if player draws on their turn)
async function drawCard() {
  const gameSnap = await db.ref(`games/${roomId}`).once("value");
  const game = gameSnap.val();
  if (game.currentTurn !== playerId) {
    alert("It's not your turn!");
    return;
  }

  const card = getRandomCard();
  const handRef = db.ref(`games/${roomId}/players/${playerId}/hand`);
  const handSnap = await handRef.once("value");
  const hand = handSnap.val() || [];
  hand.push(card);
  await handRef.set(hand);

  // End turn after drawing
  advanceTurn(game);
}

// Play a card from hand
async function playCard(cardIndex) {
  const gameSnap = await db.ref(`games/${roomId}`).once("value");
  const game = gameSnap.val();
  if (game.currentTurn !== playerId) {
    alert("It's not your turn!");
    return;
  }

  const playerHand = game.players[playerId].hand;
  const card = playerHand[cardIndex];
  const topCard = game.discardPile[game.discardPile.length -1];

  if (!canPlayCard(card, topCard)) {
    alert("You can't play that card!");
    return;
  }

  // Remove card from hand
  playerHand.splice(cardIndex, 1);

  // Update database atomically
  const updates = {};
  updates[`games/${roomId}/players/${playerId}/hand`] = playerHand;
  updates[`games/${roomId}/discardPile`] = [...game.discardPile, card];

  // Check if player won
  if (playerHand.length === 0) {
    alert(`🎉 ${game.players[playerId].name} wins!`);
    // Reset game or handle accordingly
    initializeGame(playerId);
    return;
  }

  // Advance turn (simple round-robin for now)
  advanceTurn(game, updates);

  await db.ref().update(updates);
}

// Validate if card can be played on top card
function canPlayCard(card, topCard) {
  return (
    card.color === topCard.color ||
    card.value === topCard.value
  );
}

// Advance turn to next player
function advanceTurn(game, updates = {}) {
  const playerIds = Object.keys(game.players);
  const currentIndex = playerIds.indexOf(game.currentTurn);
  const nextIndex = (currentIndex + 1) % playerIds.length;
  updates[`games/${roomId}/currentTurn`] = playerIds[nextIndex];
}

// Update UI
function updateUI(game) {
  const handDiv = document.getElementById("playerHand");
  const pileDiv = document.getElementById("discardPile");
  const turnText = document.getElementById("turnIndicator");

  const player = game.players?.[playerId];
  if (!player) return;

  // Render hand cards (clickable)
  handDiv.innerHTML = "";
  player.hand.forEach((card, idx) => {
    const cardDiv = document.createElement("div");
    cardDiv.className = `card ${card.color}`;
    cardDiv.innerText = card.value;
    cardDiv.style.cursor = "pointer";
    cardDiv.onclick = () => playCard(idx);
    handDiv.appendChild(cardDiv);
  });

  // Render discard pile top card
  const topCard = game.discardPile?.slice(-1)[0];
  pileDiv.innerHTML = topCard ? `<div class="card ${topCard.color}">${topCard.value}</div>` : "";

  // Show turn indicator
  if (game.currentTurn === playerId) {
    turnText.innerText = "Your turn!";
  } else {
    const currentPlayer = game.players[game.currentTurn];
    turnText.innerText = `Waiting for ${currentPlayer?.name || "other player"}...`;
  }
}
