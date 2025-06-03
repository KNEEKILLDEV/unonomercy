// script.js - Complete Uno No Mercy Multiplayer Logic with Firebase

// Firebase config and initialization
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

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let playerName = "";
let playerId = "";
let roomId = "";
let playerHand = [];
let currentTurnId = "";
let turnDirection = 1; // 1 = clockwise, -1 = counterclockwise
let gameStarted = false;
let playersOrder = [];

const playerNameInput = document.getElementById("playerNameInput");
const roomInput = document.getElementById("roomInput");
const maxPlayersInput = document.getElementById("maxPlayersInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const drawCardBtn = document.getElementById("drawCardBtn");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatInput = document.getElementById("chatInput");

const lobbyDiv = document.getElementById("lobby");
const gameDiv = document.getElementById("game");
const roomNameLabel = document.getElementById("roomNameLabel");
const turnLabel = document.getElementById("turnLabel");
const playerHandDiv = document.getElementById("playerHand");
const discardPile = document.getElementById("discardPile");
const opponentsContainer = document.getElementById("opponentsContainer");
const activityLog = document.getElementById("activityLog");
const chatMessages = document.getElementById("chatMessages");

// Utility to shuffle an array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Create full deck with special cards
function createDeck() {
  const colors = ["red", "green", "blue", "yellow"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse", "+2"];
  const deck = [];

  for (const color of colors) {
    for (const value of values) {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    }
  }

  const wildCards = ["Wild", "+4"];
  for (let i = 0; i < 4; i++) {
    wildCards.forEach(value => deck.push({ color: "wild", value }));
  }

  return shuffle(deck);
}

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// UI Updates

function createCardElement(card) {
  const div = document.createElement("div");
  div.className = `card ${card.color}`;
  div.textContent = card.value;
  if (card.color === "wild") div.classList.add("wild-card");

  div.onclick = () => {
    if (!gameStarted) return alert("Game has not started yet.");
    if (currentTurnId !== playerId) return alert("It's not your turn!");
    if (!canPlayCard(card)) return alert("You cannot play this card now.");
    playCard(card);
  };
  return div;
}

function renderPlayerHand(hand) {
  playerHandDiv.innerHTML = "";
  hand.forEach(card => playerHandDiv.appendChild(createCardElement(card)));
}

function renderOpponents(players) {
  opponentsContainer.innerHTML = "";
  playersOrder.forEach(pid => {
    if (pid !== playerId && players[pid]) {
      const div = document.createElement("div");
      div.className = "opponent";
      const name = players[pid].name;
      const count = players[pid].hand.length;
      div.innerHTML = `<strong>${name}</strong><br>${count} cards`;
      if (pid === currentTurnId) div.classList.add("active-turn");
      opponentsContainer.appendChild(div);
    }
  });
}

function renderDiscard(card) {
  discardPile.innerHTML = "";
  if (!card) return;
  const discardCard = createCardElement(card);
  discardPile.appendChild(discardCard);
}

function logActivity(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  activityLog.appendChild(li);
  activityLog.scrollTop = activityLog.scrollHeight;
}

function postChat(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Game logic

// Checks if a card can be legally played on top of the current discard
function canPlayCard(card) {
  const topCard = currentGameState.discard;
  if (!topCard) return true; // Should not happen normally
  if (card.color === "wild") return true;
  if (card.color === topCard.color) return true;
  if (card.value === topCard.value) return true;
  return false;
}

let currentGameState = null;

function nextPlayerId() {
  if (!playersOrder.length) return null;
  let idx = playersOrder.indexOf(currentTurnId);
  idx = (idx + turnDirection + playersOrder.length) % playersOrder.length;
  return playersOrder[idx];
}

function updateTurn(nextTurnId) {
  currentTurnId = nextTurnId;
  db.ref(`rooms/${roomId}/turn`).set({ id: currentTurnId, name: currentGameState.players[currentTurnId].name });
}

function drawCardForPlayer(pid, count = 1) {
  let deck = currentGameState.deck.slice();
  let players = {...currentGameState.players};
  const drawnCards = [];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      // reshuffle discard pile except top card
      let newDeck = currentGameState.discardPileBackup || [];
      deck = shuffle(newDeck);
      db.ref(`rooms/${roomId}/discardPileBackup`).set([]);
    }
    if (deck.length === 0) break; // no cards left

    const card = deck.shift();
    drawnCards.push(card);
    players[pid].hand.push(card);
  }

  db.ref(`rooms/${roomId}/deck`).set(deck);
  db.ref(`rooms/${roomId}/players/${pid}/hand`).set(players[pid].hand);
  return drawnCards;
}

function applyCardEffect(card, playerWhoPlayed) {
  switch (card.value) {
    case "Skip":
      // Skip next player
      currentTurnId = nextPlayerId();
      currentTurnId = nextPlayerId(); // skip one player extra
      break;
    case "Reverse":
      turnDirection = -turnDirection;
      // If 2 players only, Reverse acts as Skip
      if (playersOrder.length === 2) {
        currentTurnId = nextPlayerId();
        currentTurnId = nextPlayerId();
      } else {
        currentTurnId = nextPlayerId();
      }
      break;
    case "+2":
      {
        let next = nextPlayerId();
        drawCardForPlayer(next, 2);
        currentTurnId = nextPlayerId();
      }
      break;
    case "+4":
      {
        let next = nextPlayerId();
        drawCardForPlayer(next, 4);
        currentTurnId = nextPlayerId();
      }
      break;
    default:
      currentTurnId = nextPlayerId();
  }
  updateTurn(currentTurnId);
  db.ref(`rooms/${roomId}/discard`).set(card);
  logActivity(`${playerWhoPlayed} played ${card.color} ${card.value}`);
}

function playCard(card) {
  if (!canPlayCard(card)) {
    alert("Illegal move! Cannot play this card.");
    return;
  }

  // Remove card from player's hand
  const handIndex = playerHand.findIndex(c => c.color === card.color && c.value === card.value);
  if (handIndex === -1) return alert("You don't have this card.");

  playerHand.splice(handIndex, 1);
  db.ref(`rooms/${roomId}/players/${playerId}/hand`).set(playerHand);

  // Update discard pile and effects
  applyCardEffect(card, playerName);

  // Check if player won
  if (playerHand.length === 0) {
    alert(`${playerName} has won the game!`);
    logActivity(`${playerName} has won the game!`);
    gameStarted = false;
  }
}

// Listen for game state updates
db.ref(`rooms`).on("value", snapshot => {
  if (!roomId || !playerId) return;
  const game = snapshot.child(roomId).val();
  if (!game || !game.players || !game.players[playerId]) return;

  currentGameState = game;
  playerHand = game.players[playerId].hand || [];
  playersOrder = Object.keys(game.players);

  gameStarted = true;
  currentTurnId = game.turn.id;
  turnDirection = game.turnDirection || 1;

  renderPlayerHand(playerHand);
  renderDiscard(game.discard);
  renderOpponents(game.players);
  turnLabel.textContent = game.turn.name;
  roomNameLabel.textContent = roomId;
});

// Create room
createRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId = roomInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!playerName || !roomId || !maxPlayers || maxPlayers < 2 || maxPlayers > 10) {
    alert("Please enter valid name, room, and max players (2-10).");
    return;
  }
  playerId = generateId();
  const deck = createDeck();
  const players = {};
  players[playerId] = { name: playerName, hand: [] };
  const discard = deck.pop();
  db.ref(`rooms/${roomId}`).set({
    players,
    deck,
    discard,
    turn: { id: playerId, name: playerName },
    turnDirection: 1,
    maxPlayers,
    chat: [],
    log: []
  });
  db.ref(`rooms/${roomId}/players/${playerId}`).update({ id: playerId });
  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
  roomNameLabel.textContent = roomId;
  turnLabel.textContent = playerName;
};

// Join room
joinRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId = roomInput.value.trim();
  if (!playerName || !roomId) {
    alert("Enter your name and room.");
    return;
  }
  playerId = generateId();

  // Load game to add player
  db.ref(`rooms/${roomId}`).once("value").then(snapshot => {
    const game = snapshot.val();
    if (!game) {
      alert("Room not found.");
      return;
    }
    if (Object.keys(game.players).length >= game.maxPlayers) {
      alert("Room full.");
      return;
    }

    // Deal 7 cards to new player
    let deck = game.deck.slice();
    const hand = deck.splice(0, 7);

    // Update DB
    const updates = {};
    updates[`rooms/${roomId}/players/${playerId}`] = { name: playerName, hand };
    updates[`rooms/${roomId}/deck`] = deck;
    db.ref().update(updates);

    lobbyDiv.style.display = "none";
    gameDiv.style.display = "block";
    roomNameLabel.textContent = roomId;
    turnLabel.textContent = game.turn.name;
  });
};

// Draw card button
drawCardBtn.onclick = () => {
  if (currentTurnId !== playerId) {
    alert("It's not your turn.");
    return;
  }

  if (!gameStarted) {
    alert("Game has not started.");
    return;
  }

  drawCardForPlayer(playerId, 1);
  logActivity(`${playerName} drew a card.`);
  // After drawing, player turn usually ends unless a card is played.
  currentTurnId = nextPlayerId();
  updateTurn(currentTurnId);
};

// Chat sending on button and Enter key
function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  const message = `${playerName}: ${msg}`;
  db.ref(`rooms/${roomId}/chat`).push(message);
  chatInput.value = "";
}

sendChatBtn.onclick = sendChatMessage;
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendChatMessage();
  }
});

// Listen for chat updates
db.ref(`rooms/${roomId}/chat`).on("child_added", snap => {
  postChat(snap.val());
});

// Activity log helper: listen for discard pile changes to log moves
db.ref(`rooms/${roomId}/discard`).on("value", snap => {
  const card = snap.val();
  if (!card) return;
  logActivity(`Discard pile updated: ${card.color} ${card.value}`);
});

// Prevent illegal moves by validating card play in playCard function

