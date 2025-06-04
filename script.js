// script.js

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
let roomRef = db.collection("rooms").doc("room1");

// ---------------- Globals ----------------
let roomData = null;
let playerId = null;
let playerName = null;
let players = [];
let seatOrder = [];
let direction = 1;
let deck = [];
let discardPile = [];
let currentColor = null;
let currentValue = null;
let hand = [];
let canPlayCard = false;
let unoCalled = false;
let stackCount = 0;
let stackType = null;

// ---------------- UI Elements ----------------
const chatInput          = document.getElementById("chatInput");
const chatMessages       = document.getElementById("chatLog");
const activityLog        = document.getElementById("activityLog");
const playerHand         = document.getElementById("playerHand");
const opponentsContainer = document.getElementById("opponents");
const discardPileDiv     = document.getElementById("discardPile");
const drawCardBtn        = document.getElementById("drawCardBtn");
const unoBtn             = document.getElementById("unoBtn");
const restartBtn         = document.getElementById("restartBtn");
const createRoomBtn      = document.getElementById("createRoomBtn");
const joinRoomBtn        = document.getElementById("joinRoomBtn");
const startGameBtn       = document.getElementById("startGameBtn");
const nameInput          = document.getElementById("playerNameInput");
const roomIdInput        = document.getElementById("roomCodeInput");
const maxPlayersInput    = document.getElementById("maxPlayersInput");

// ---------------- Helper Functions ----------------

// Shuffle array in place (Fisher-Yates)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
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
  let newDeck = [];
  for (let color of colors) {
    // One 0 per color
    newDeck.push({ color, value: "0" });
    // Two of each 1–9, skip, reverse, +2
    for (let i = 1; i <= 9; i++) {
      newDeck.push({ color, value: i.toString() });
      newDeck.push({ color, value: i.toString() });
    }
    for (let special of ["skip", "reverse", "+2"]) {
      newDeck.push({ color, value: special });
      newDeck.push({ color, value: special });
    }
  }
  // Add wild and +4 wild cards
  for (let i = 0; i < 4; i++) {
    newDeck.push({ color: "wild", value: "wild" });
    newDeck.push({ color: "wild", value: "+4" });
  }
  shuffle(newDeck);
  return newDeck;
}

// Render player hand cards
function renderHand() {
  playerHand.innerHTML = "";
  for (let card of hand) {
    const cardEl = document.createElement("div");
    cardEl.className = `card ${card.color} ${card.value}`;
    cardEl.textContent =
      card.value === "+4"
        ? "+4"
        : card.value === "wild"
        ? "Wild"
        : card.value;
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
    opponentDiv.className = "player";
    if (p.id === roomData.currentPlayer) opponentDiv.classList.add("current");
    opponentDiv.innerHTML = `
      <div class="player-name">${p.name}</div>
      <div>${p.handCount || 0} cards</div>
    `;
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
  cardEl.textContent =
    topCard.value === "+4"
      ? "+4"
      : topCard.value === "wild"
      ? "Wild"
      : topCard.value;
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
    if (
      stackType === "+2" &&
      card.value === "+2" &&
      (card.color === currentColor || card.color === "wild")
    )
      return true;
    if (stackType === "+4" && card.value === "+4" && card.color === "wild")
      return true;
    return false;
  }
  // Otherwise, color or value matches, or wild
  return (
    card.color === currentColor ||
    card.value === currentValue ||
    card.color === "wild"
  );
}

// Try to play a card from hand
function tryPlayCard(card) {
  // Guard: only if in a started game and it’s your turn
  if (
    !roomData ||
    !playerId ||
    roomData.status !== "started" ||
    roomData.currentPlayer !== playerId
  ) {
    return;
  }
  if (!canPlayCard) return;
  if (!canPlay(card)) return alert("Can't play this card now!");

  if (card.color === "wild") {
    // Dynamically create and show the color-selection modal
    showColorPicker(card);
  } else {
    playCard(card, null);
  }
}

// Dynamically create a modal, let user pick a color, then remove it
function showColorPicker(card) {
  // Create the overlay element
  const overlay = document.createElement("div");
  overlay.className = "modal";

  // Build inner HTML
  overlay.innerHTML = `
    <div class="modal-content">
      <h3>Select a Color</h3>
      <div class="color-options">
        <button class="color-btn" data-color="red" style="background:red;"></button>
        <button class="color-btn" data-color="green" style="background:green;"></button>
        <button class="color-btn" data-color="blue" style="background:blue;"></button>
        <button class="color-btn" data-color="yellow" style="background:yellow;"></button>
      </div>
    </div>
  `;

  // Attach click listeners to each color button
  overlay.querySelectorAll(".color-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const chosenColor = btn.dataset.color;
      playCard(card, chosenColor);
      document.body.removeChild(overlay);
    });
  });

  // Append to <body>
  document.body.appendChild(overlay);
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
      if (
        room.stackType === "+2" &&
        !(
          card.value === "+2" &&
          (card.color === room.currentColor || card.color === "wild")
        )
      )
        return;
      if (
        room.stackType === "+4" &&
        !(card.value === "+4" && card.color === "wild")
      )
        return;
    } else {
      if (
        !(
          card.color === room.currentColor ||
          card.value === room.currentValue ||
          card.color === "wild"
        )
      )
        return;
    }

    // Remove card from player's hand
    const playerHandArr = room.players[playerIndex].hand;
    const cardIdx = playerHandArr.findIndex(
      c => c.color === card.color && c.value === card.value
    );
    if (cardIdx === -1) return; // Card not in hand

    playerHandArr.splice(cardIdx, 1);
    // Update handCount
    room.players[playerIndex].handCount = playerHandArr.length;

    // Update discard pile
    if (!room.discardPileBackup) room.discardPileBackup = [];
    room.discardPileBackup.push(...room.discardPile.slice(0, -1)); // Backup all but top
    room.discardPile = room.discardPile.slice(-1); // Keep only top card
    room.discardPile.push({
      color: card.color,
      value: card.value,
      chosenColor: chosenColor || null
    });

    // Update current color and value
    room.currentColor = card.color === "wild" ? chosenColor : card.color;
    room.currentValue = card.value;

    // Reset UNO flag if needed
    if (room.players[playerIndex].unoCalled) {
      room.players[playerIndex].unoCalled = false;
    }

    // Handle special cards
    if (card.value === "reverse") {
      room.direction = room.direction * -1;
    }

    // Update stackCount and stackType if +2 or +4
    if (card.value === "+2" || card.value === "+4") {
      room.stackCount =
        (room.stackCount || 0) + (card.value === "+2" ? 2 : 4);
      room.stackType = card.value;
    } else {
      room.stackCount = 0;
      room.stackType = null;
    }

    // Check if player has won
    const updatedHand = room.players[playerIndex].hand;
    if (updatedHand.length === 0) {
      room.winner = playerId;
      room.currentPlayer = null;
      room.status = "ended";
    } else {
      // Move to next player
      let nextIndex =
        (room.seatOrder.indexOf(playerId) +
          room.direction +
          room.seatOrder.length) %
        room.seatOrder.length;
      if (card.value === "skip") {
        nextIndex =
          (nextIndex + room.direction + room.seatOrder.length) %
          room.seatOrder.length;
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
    room.players[playerIndex].handCount = room.players[playerIndex].hand.length;

    // Move turn to next player
    let nextIndex =
      (room.seatOrder.indexOf(playerId) +
        room.direction +
        room.seatOrder.length) %
      room.seatOrder.length;
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

    const playerHandArr = room.players[playerIndex].hand;
    if (playerHandArr.length !== 1)
      return alert("You can only call UNO when you have exactly one card!");

    room.players[playerIndex].unoCalled = true;
    return room;
  });
}

// Add chat message to Firestore
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

// Listen for chat updates
function listenChat() {
  roomRef
    .collection("chat")
    .orderBy("timestamp")
    .limit(200)
    .onSnapshot(snapshot => {
      chatMessages.innerHTML = "";
      snapshot.forEach(doc => {
        const { sender, message } = doc.data();
        appendChatMessage(sender, message);
      });
      // Prune chat if > 200 messages
      if (snapshot.size > 200) {
        let batch = db.batch();
        snapshot.docs
          .slice(0, snapshot.size - 200)
          .forEach(doc => batch.delete(doc.ref));
        batch.commit();
      }
    });
}

// Append activity log entry to Firestore
function logActivity(message) {
  const logRef = roomRef.collection("activityLog");
  logRef.add({
    message,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Listen for activity log updates
function listenActivityLog() {
  roomRef
    .collection("activityLog")
    .orderBy("timestamp")
    .limit(200)
    .onSnapshot(snapshot => {
      activityLog.innerHTML = "";
      snapshot.forEach(doc => {
        appendActivityLog(doc.data().message);
      });
      if (snapshot.size > 200) {
        let batch = db.batch();
        snapshot.docs
          .slice(0, snapshot.size - 200)
          .forEach(doc => batch.delete(doc.ref));
        batch.commit();
      }
    });
}

// Listen to room state updates
function listenRoom() {
  roomRef.onSnapshot(doc => {
    roomData = doc.data();
    if (!roomData) return;

    // Show the game area once we have a valid room
    document.getElementById("game-area").classList.remove("hidden");
    document.getElementById("roomCodeDisplay").textContent = doc.id;
    document.getElementById("playerNameDisplay").textContent = playerName;
    document.getElementById("currentPlayerDisplay").textContent =
      roomData.currentPlayer === playerId ? "You" : roomData.currentPlayer;

    // Update player count & max display
    const countEl = document.getElementById("playerCountDisplay");
    const maxEl   = document.getElementById("maxPlayersDisplay");
    countEl.textContent = (roomData.players || []).length;
    maxEl.textContent   = roomData.maxPlayers || 0;

    players = roomData.players || [];
    seatOrder = roomData.seatOrder || [];
    direction = roomData.direction || 1;
    discardPile = roomData.discardPile || [];
    deck = roomData.deck || [];
    currentColor = roomData.currentColor;
    currentValue = roomData.currentValue;

    // Update player‐specific data
    const me = players.find(p => p.id === playerId);
    if (me) {
      hand = me.hand || [];
      unoCalled = me.unoCalled || false;
    } else {
      hand = [];
    }

    // Determine if player can actually play this turn
    canPlayCard =
      roomData.currentPlayer === playerId && roomData.status === "started";

    renderHand();
    renderOpponents();
    renderDiscardPile();

    // Disable/hide Start Game button after game starts
    if (roomData.status === "started") {
      startGameBtn.disabled = true;
    }

    // Enable/disable Draw & UNO buttons
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

// ---------------- Room & Player Setup ----------------

async function createRoom() {
  playerName = nameInput.value.trim();
  if (!playerName) return alert("Enter your name");

  // If blank or invalid, default to 10
  let maxInput = parseInt(maxPlayersInput.value, 10);
  if (isNaN(maxInput)) {
    maxInput = 10;
  }
  if (maxInput < 2 || maxInput > 10) {
    return alert("Max players must be a number between 2 and 10");
  }

  // Generate random room ID
  const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  playerId = Math.random().toString(36).substring(2, 15);

  // Initialize room data
  await db.collection("rooms").doc(newRoomId).set({
    players: [
      {
        id: playerId,
        name: playerName,
        hand: [],
        unoCalled: false,
        connected: true,
        handCount: 0
      }
    ],
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
    maxPlayers: maxInput
  });

  roomRef = db.collection("rooms").doc(newRoomId);
  listenRoom();
  listenChat();
  listenActivityLog();

  alert(`Room created! Share this code with friends: ${newRoomId}`);
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

  const maxAllowed = roomData.maxPlayers || 10;
  if ((roomData.players || []).length >= maxAllowed) {
    return alert("Room is full according to its max players limit!");
  }

  // Check if player already exists (rejoin)
  if (!roomData.players.some(p => p.name === playerName)) {
    playerId = Math.random().toString(36).substring(2, 15);

    // Add player to players list and seatOrder
    roomRef.update({
      players: firebase.firestore.FieldValue.arrayUnion({
        id: playerId,
        name: playerName,
        hand: [],
        unoCalled: false,
        connected: true,
        handCount: 0
      }),
      seatOrder: [...roomData.seatOrder, playerId]
    });
  } else {
    // Rejoin: find existing playerId
    const existingPlayer = roomData.players.find(p => p.name === playerName);
    playerId = existingPlayer.id;
  }

  listenRoom();
  listenChat();
  listenActivityLog();
}

async function startGame() {
  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;
  if (room.status === "started") return alert("Game already started");
  if (room.players.length < 2) return alert("Need at least 2 players to start!");

  // Create & shuffle deck
  let newDeck = createDeck();

  // Deal 7 cards to each player
  let updatedPlayers = room.players.map(p => {
    const playerHand = newDeck.splice(0, 7);
    return {
      ...p,
      hand: playerHand,
      handCount: playerHand.length,
      unoCalled: false,
      connected: true
    };
  });

  // Draw the first discard card (cannot be wild/+4)
  let firstCard;
  do {
    firstCard = newDeck.shift();
  } while (firstCard.color === "wild" || firstCard.value === "+4");

  // Initialize room state
  await roomRef.update({
    players: updatedPlayers,
    deck: newDeck,
    discardPile: [firstCard],
    discardPileBackup: [],
    currentColor: firstCard.color,
    currentValue: firstCard.value,
    stackCount: 0,
    stackType: null,
    direction: 1,
    seatOrder: updatedPlayers.map(p => p.id),
    currentPlayer: updatedPlayers[0].id,
    status: "started",
    winner: null
  });

  logActivity(`Game started! First card is ${firstCard.color} ${firstCard.value}.`);
}

// ---------------- Event Listeners ----------------

chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") {
    sendChatMessage(chatInput.value);
  }
});

drawCardBtn.onclick   = drawCard;
unoBtn.onclick        = callUno;
createRoomBtn.onclick = createRoom;
joinRoomBtn.onclick   = joinRoom;
startGameBtn.onclick  = startGame;
restartBtn.onclick    = () => {
  if (confirm("Restart game? This will reset the room.")) {
    roomRef.delete();
    document.getElementById("game-area").classList.add("hidden");
  }
};

// Optional: if someone reloads and has an active playerId & roomRef, you could re-attach listeners here.
