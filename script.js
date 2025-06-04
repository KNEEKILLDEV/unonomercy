// ---------------- Firebase Initialization ----------------
const firebaseConfig = {
  apiKey: "AIzaSyClbFpj5gSP7Wp8YdR83JHz7Cw2RkAEpIk",
  authDomain: "uno-6e5b2.firebaseapp.com",
  projectId: "uno-6e5b2",
  storageBucket: "uno-6e5b2.appspot.com",
  messagingSenderId: "485853843929",
  appId: "1:485853843929:web:b92cc93e7a2e6b2b2a050b",
  measurementId: "G-CNZXGM01ZP"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const roomRef = db.collection("rooms").doc("room1");

// ---------------- Globals ----------------
let roomData = null;
let playerId = null;
let playerName = null;
let players = [];
let spectators = [];
let seatOrder = [];
let direction = 1;
let turnIndex = 0;
let deck = [];
let discardPile = [];
let discardPileBackup = [];
let currentColor = null;
let currentValue = null;
let hand = [];
let canPlayCard = false;
let unoCalled = false;
let stackCount = 0;
let stackType = null;
let timeoutId = null;
let unoTimeoutId = null;

// UI Elements
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const activityLog = document.getElementById("activity-log");
const playerHand = document.getElementById("player-hand");
const opponentsContainer = document.getElementById("opponents");
const discardPileDiv = document.getElementById("discard-pile");
const drawCardBtn = document.getElementById("draw-card");
const unoBtn = document.getElementById("uno-button");
const restartBtn = document.getElementById("restart-game");
const colorModal = document.getElementById("color-modal");
const colorButtons = document.querySelectorAll("#color-modal button");
const createRoomBtn = document.getElementById("create-room");
const joinRoomBtn = document.getElementById("join-room");
const nameInput = document.getElementById("player-name");
const roomIdInput = document.getElementById("room-id");

// ---------------- Helper Functions ----------------

// Shuffle array in place (Fisher-Yates)
function shuffle(array) {
  for(let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Create a standard UNO deck
function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const values = [
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "skip", "reverse", "+2"
  ];
  let deck = [];
  for (let color of colors) {
    // One zero per color
    deck.push({ color, value: "0" });
    // Two of each 1-9, skip, reverse, +2
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, value: i.toString() });
      deck.push({ color, value: i.toString() });
    }
    for (let special of ["skip", "reverse", "+2"]) {
      deck.push({ color, value: special });
      deck.push({ color, value: special });
    }
  }
  // Add wild and +4 wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "+4" });
  }
  shuffle(deck);
  return deck;
}

// Render player hand cards
function renderHand() {
  playerHand.innerHTML = "";
  for (let card of hand) {
    const cardEl = document.createElement("div");
    cardEl.className = `card ${card.color} ${card.value}`;
    cardEl.textContent = card.value === "+4" ? "+4" : (card.value === "wild" ? "Wild" : card.value);
    cardEl.onclick = () => tryPlayCard(card);
    playerHand.appendChild(cardEl);
  }
}

// Render opponents
function renderOpponents() {
  opponentsContainer.innerHTML = "";
  const otherPlayers = players.filter(p => p.id !== playerId);
  otherPlayers.forEach(p => {
    const opponentDiv = document.createElement("div");
    opponentDiv.className = "opponent";
    opponentDiv.textContent = `${p.name} (${p.handCount || 0} cards)${p.id === roomData.currentPlayer ? " <--" : ""}`;
    opponentsContainer.appendChild(opponentDiv);
  });
}

// Render discard pile top card
function renderDiscardPile() {
  discardPileDiv.innerHTML = "";
  if (discardPile.length === 0) return;
  const topCard = discardPile[discardPile.length - 1];
  const cardEl = document.createElement("div");
  cardEl.className = `card ${topCard.color} ${topCard.value}`;
  cardEl.textContent = topCard.value === "+4" ? "+4" : (topCard.value === "wild" ? "Wild" : topCard.value);
  discardPileDiv.appendChild(cardEl);
}

// Append message to chat window and scroll
function appendChatMessage(sender, message) {
  const msg = document.createElement("div");
  msg.textContent = `${sender}: ${message}`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Append activity log message
function appendActivityLog(message) {
  const log = document.createElement("div");
  log.textContent = message;
  activityLog.appendChild(log);
  activityLog.scrollTop = activityLog.scrollHeight;
}

// Check if card can be played on top of current discard
function canPlay(card) {
  if (stackCount > 0) {
    // If stacking +2 or +4, must play same type
    if (stackType === "+2" && card.value === "+2" && (card.color === currentColor || card.color === "wild")) return true;
    if (stackType === "+4" && card.value === "+4" && card.color === "wild") return true;
    return false;
  }
  // Otherwise, card color or value matches, or wild
  return card.color === currentColor || card.value === currentValue || card.color === "wild";
}

// Try to play a card from hand
function tryPlayCard(card) {
  if (!canPlayCard) return;
  if (!canPlay(card)) return alert("Can't play this card now!");

  if (card.color === "wild") {
    // Show color modal before playing wild card
    colorModal.style.display = "block";
    colorButtons.forEach(btn => {
      btn.onclick = () => {
        playCard(card, btn.dataset.color);
        colorModal.style.display = "none";
      };
    });
  } else {
    playCard(card, null);
  }
}

// Play card with optional chosenColor (for wild)
function playCard(card, chosenColor) {
  roomRef.transaction(room => {
    if (!room) return;
    if (room.currentPlayer !== playerId) return; // Not your turn
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    // Check stack rules again inside transaction
    if (room.stackCount > 0) {
      if (room.stackType === "+2" && !(card.value === "+2" && (card.color === room.currentColor || card.color === "wild"))) return;
      if (room.stackType === "+4" && !(card.value === "+4" && card.color === "wild")) return;
    } else {
      if (!(card.color === room.currentColor || card.value === room.currentValue || card.color === "wild")) return;
    }

    // Remove card from player's hand
    const playerHand = room.players[playerIndex].hand;
    const cardIdx = playerHand.findIndex(c => c.color === card.color && c.value === card.value);
    if (cardIdx === -1) return; // Card not in hand

    playerHand.splice(cardIdx, 1);

    // Update discard pile
    if (!room.discardPileBackup) room.discardPileBackup = [];
    room.discardPileBackup.push(...room.discardPile.slice(0, -1)); // Backup all but top discard
    room.discardPile = room.discardPile.slice(-1); // Keep only top card
    room.discardPile.push({ color: card.color, value: card.value, chosenColor: chosenColor || null });

    // Update current color and value
    room.currentColor = card.color === "wild" ? chosenColor : card.color;
    room.currentValue = card.value;

    // Reset UNO called flag if applicable
    if (room.players[playerIndex].unoCalled) {
      room.players[playerIndex].unoCalled = false;
    }

    // Handle special cards effects
    if (card.value === "reverse") {
      room.direction = room.direction * -1;
    }

    // Update stackCount and stackType if +2 or +4
    if (card.value === "+2" || card.value === "+4") {
      room.stackCount = (room.stackCount || 0) + (card.value === "+2" ? 2 : 4);
      room.stackType = card.value;
    } else {
      room.stackCount = 0;
      room.stackType = null;
    }

    // Check if player has won
    if (playerHand.length === 0) {
      room.winner = playerId;
      room.currentPlayer = null;
      room.status = "ended";
    } else {
      // Move to next player
      let nextIndex = (room.seatOrder.indexOf(playerId) + room.direction + room.seatOrder.length) % room.seatOrder.length;
      if (card.value === "skip") {
        nextIndex = (nextIndex + room.direction + room.seatOrder.length) % room.seatOrder.length;
      }
      room.currentPlayer = room.seatOrder[nextIndex];
    }

    return room;
  });
}

// Draw a card from deck
function drawCard() {
  if (!canPlayCard) return alert("Not your turn to draw!");
  roomRef.transaction(room => {
    if (!room) return;
    if (room.currentPlayer !== playerId) return;
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    if (!room.deck || room.deck.length === 0) {
      // Reshuffle discard backup into deck except top discard
      if (room.discardPileBackup && room.discardPileBackup.length > 0) {
        room.deck = room.discardPileBackup;
        shuffle(room.deck);
        room.discardPileBackup = [];
      } else {
        return; // No cards left
      }
    }

    const card = room.deck.pop();
    room.players[playerIndex].hand.push(card);

    // Move turn to next player
    let nextIndex = (room.seatOrder.indexOf(playerId) + room.direction + room.seatOrder.length) % room.seatOrder.length;
    room.currentPlayer = room.seatOrder[nextIndex];

    // Reset stack if player draws instead of stacking
    if (room.stackCount > 0) {
      room.stackCount = 0;
      room.stackType = null;
    }

    return room;
  });
}

// Call UNO
function callUno() {
  if (!canPlayCard) return alert("Not your turn!");
  if (unoCalled) return alert("UNO already called!");
  roomRef.transaction(room => {
    if (!room) return;
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    const playerHand = room.players[playerIndex].hand;
    if (playerHand.length !== 1) return alert("You can only call UNO when you have exactly one card!");

    room.players[playerIndex].unoCalled = true;
    return room;
  });
}

// Add chat message to Firebase
function sendChatMessage(text) {
  if (!text.trim()) return;
  const chatRef = roomRef.collection("chat");
  chatRef.add({
    sender: playerName,
    message: text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  chatInput.value = "";
}

// Listen for chat messages updates
function listenChat() {
  roomRef.collection("chat").orderBy("timestamp").limit(200).onSnapshot(snapshot => {
    chatMessages.innerHTML = "";
    snapshot.forEach(doc => {
      const { sender, message } = doc.data();
      appendChatMessage(sender, message);
    });
    // Prune chat if > 200 messages
    if (snapshot.size > 200) {
      let batch = db.batch();
      snapshot.docs.slice(0, snapshot.size - 200).forEach(doc => batch.delete(doc.ref));
      batch.commit();
    }
  });
}

// Append activity log entry to Firebase
function logActivity(message) {
  const logRef = roomRef.collection("activityLog");
  logRef.add({
    message,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Listen activity log updates
function listenActivityLog() {
  roomRef.collection("activityLog").orderBy("timestamp").limit(200).onSnapshot(snapshot => {
    activityLog.innerHTML = "";
    snapshot.forEach(doc => {
      appendActivityLog(doc.data().message);
    });
    if (snapshot.size > 200) {
      let batch = db.batch();
      snapshot.docs.slice(0, snapshot.size - 200).forEach(doc => batch.delete(doc.ref));
      batch.commit();
    }
  });
}

// Listen to room state updates
function listenRoom() {
  roomRef.onSnapshot(doc => {
    roomData = doc.data();
    if (!roomData) return;

    players = roomData.players || [];
    spectators = roomData.spectators || [];
    seatOrder = roomData.seatOrder || [];
    direction = roomData.direction || 1;
    discardPile = roomData.discardPile || [];
    deck = roomData.deck || [];
    currentColor = roomData.currentColor;
    currentValue = roomData.currentValue;
    turnIndex = seatOrder.indexOf(roomData.currentPlayer);

    // Update UI based on player data
    const me = players.find(p => p.id === playerId);
    if (me) {
      hand = me.hand || [];
      unoCalled = me.unoCalled || false;
    } else {
      hand = [];
    }

    // Determine if player can play this turn
    canPlayCard = roomData.currentPlayer === playerId && roomData.status === "started";

    renderHand();
    renderOpponents();
    renderDiscardPile();

    // Enable/disable buttons
    drawCardBtn.disabled = !canPlayCard;
    unoBtn.disabled = !canPlayCard || unoCalled || hand.length !== 2;

    // Show winner if game ended
    if (roomData.status === "ended") {
      if (roomData.winner === playerId) {
        alert("You won!");
      } else {
        alert(`Player ${roomData.winnerName || "someone"} won the game!`);
      }
    }
  });
}

// ---------------- Room and Player Setup ----------------

async function createRoom() {
  playerName = nameInput.value.trim();
  if (!playerName) return alert("Enter your name");

  // Generate random room ID or get from input
  const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  playerId = Math.random().toString(36).substring(2, 15);

  // Initialize room data
  await db.collection("rooms").doc(newRoomId).set({
    players: [{
      id: playerId,
      name: playerName,
      hand: [],
      unoCalled: false,
      connected: true,
      handCount: 0,
    }],
    spectators: [],
    seatOrder: [playerId],
    direction: 1,
    currentPlayer: playerId,
    deck: createDeck(),
    discardPile: [],
    discardPileBackup: [],
    currentColor: null,
    currentValue: null,
    stackCount: 0,
    stackType: null,
    status: "waiting",
  });

  roomRef = db.collection("rooms").doc(newRoomId);
  listenRoom();
  listenChat();
  listenActivityLog();

  // Save room id to UI for player info
  alert(`Room created! Share this code to friends: ${newRoomId}`);

  // After creating, wait for more players and start game manually or automatically
}

async function joinRoom() {
  playerName = nameInput.value.trim();
  if (!playerName) return alert("Enter your name");

  const joinRoomId = roomIdInput.value.trim();
  if (!joinRoomId) return alert("Enter room ID");

  roomRef = db.collection("rooms").doc(joinRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return alert("Room does not exist!");

  roomData = roomDoc.data();

  // Check if player already exists (rejoin)
  if (!roomData.players.some(p => p.name === playerName)) {
    // Add player if less than 10 players
    if (roomData.players.length >= 10) return alert("Room full!");

    playerId = Math.random().toString(36).substring(2, 15);

    // Add player to players list and seatOrder
    roomRef.update({
      players: firebase.firestore.FieldValue.arrayUnion({
        id: playerId,
        name: playerName,
        hand: [],
        unoCalled: false,
        connected: true,
        handCount: 0,
      }),
      seatOrder: [...roomData.seatOrder, playerId],
    });
  } else {
    // Rejoin scenario: find existing playerId
    const existingPlayer = roomData.players.find(p => p.name === playerName);
    playerId = existingPlayer.id;
  }

  listenRoom();
  listenChat();
  listenActivityLog();
}

// Start game when enough players have joined
async function startGame() {
  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;
  if (room.status === "started") return alert("Game already started");
  if (room.players.length < 2) return alert("Need at least 2 players to start!");

  // Create and shuffle deck
  let deck = createDeck();

  // Deal 7 cards to each player
  let players = room.players.map(p => {
    const hand = deck.splice(0, 7);
    return {
      ...p,
      hand,
      handCount: hand.length,
      unoCalled: false,
      connected: true,
    };
  });

  // Draw the first discard card (cannot be wild/+4)
  let firstCard;
  do {
    firstCard = deck.shift();
  } while (firstCard.color === "wild" || firstCard.value === "+4");

  // Initialize room state
  await roomRef.update({
    players,
    deck,
    discardPile: [firstCard],
    discardPileBackup: [],
    currentColor: firstCard.color,
    currentValue: firstCard.value,
    stackCount: 0,
    stackType: null,
    direction: 1,
    seatOrder: players.map(p => p.id),
    currentPlayer: players[0].id,
    status: "started",
    winner: null,
  });

  logActivity(`Game started! First card is ${firstCard.color} ${firstCard.value}.`);
}

// ---------------- Event Listeners ----------------
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") {
    sendChatMessage(chatInput.value);
  }
});

drawCardBtn.onclick = drawCard;
unoBtn.onclick = callUno;
createRoomBtn.onclick = createRoom;
joinRoomBtn.onclick = joinRoom;
restartBtn.onclick = () => {
  if (confirm("Restart game? This will reset the room.")) {
    roomRef.delete();
  }
};

// ---------------- Initialization ----------------
// On page load, can optionally set playerId and listen for updates if joined already

