// script.js

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

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let playerName = "";
let playerId = "";
let roomId = "";
let gameState = null;

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
const playerHand = document.getElementById("playerHand");
const discardPile = document.getElementById("discardPile");
const opponentsContainer = document.getElementById("opponentsContainer");
const activityLog = document.getElementById("activityLog");
const chatMessages = document.getElementById("chatMessages");

function generateId() {
  return Math.random().toString(36).substring(2, 10);
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

function createCardElement(card) {
  const div = document.createElement("div");
  div.className = `card ${card.color}`;
  div.textContent = card.value;

  // For special cards, add extra text outside
  if (["Skip", "Reverse", "+2", "Wild", "+4"].includes(card.value)) {
    div.classList.add("special-text");
    div.setAttribute("data-text", card.value);
  }

  div.onclick = () => {
    if (!gameState) return;
    if (gameState.turn.id !== playerId) {
      logActivity("It's not your turn!");
      return;
    }
    if (!canPlayCard(card)) {
      logActivity("You cannot play that card now!");
      return;
    }
    playCard(card);
  };
  return div;
}

function canPlayCard(card) {
  if (!gameState) return false;
  const topCard = gameState.discard;
  // Wild cards can always be played
  if (card.color === "wild") return true;
  // Match color or value
  if (card.color === topCard.color || card.value === topCard.value) return true;
  return false;
}

function renderHand(cards) {
  playerHand.innerHTML = "";
  cards.forEach(card => playerHand.appendChild(createCardElement(card)));
}

function renderOpponents(players) {
  opponentsContainer.innerHTML = "";
  Object.entries(players).forEach(([id, player]) => {
    if (id !== playerId) {
      const div = document.createElement("div");
      div.className = "opponent";
      div.textContent = `${player.name} - ${player.hand ? player.hand.length : 0} cards`;
      opponentsContainer.appendChild(div);
    }
  });
}

function renderDiscard(card) {
  discardPile.innerHTML = "";
  discardPile.appendChild(createCardElement(card));
}

function createDeck() {
  const colors = ["red", "green", "blue", "yellow"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse", "+2"];
  const deck = [];
  for (let color of colors) {
    for (let value of values) {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    }
  }
  const wilds = ["Wild", "+4"];
  for (let i = 0; i < 4; i++) {
    wilds.forEach(value => deck.push({ color: "wild", value }));
  }
  return deck.sort(() => Math.random() - 0.5);
}

function dealCards(deck, players) {
  Object.keys(players).forEach(pid => {
    players[pid].hand = deck.splice(0, 7);
  });
  return deck;
}

function updateGameState(snapshot) {
  gameState = snapshot.val();
  if (!gameState) return;

  // Render UI
  if (gameState.players && gameState.players[playerId]) {
    renderHand(gameState.players[playerId].hand || []);
  }
  renderDiscard(gameState.discard);
  renderOpponents(gameState.players);
  turnLabel.textContent = gameState.turn ? gameState.turn.name : "";

  // Update activity log - keep only latest 50 logs to avoid UI overload
  activityLog.innerHTML = "";
  if (gameState.log) {
    const logs = Object.values(gameState.log);
    logs.slice(-50).forEach(logActivity);
  }
}

function playCard(card) {
  // Remove card from player hand
  const playerHandRef = db.ref(`rooms/${roomId}/players/${playerId}/hand`);
  playerHandRef.once("value").then(snap => {
    let hand = snap.val() || [];
    const index = hand.findIndex(c => c.color === card.color && c.value === card.value);
    if (index === -1) {
      logActivity("Card not found in your hand!");
      return;
    }
    hand.splice(index, 1);

    // Update discard pile and player hand atomically
    const updates = {};
    updates[`rooms/${roomId}/discard`] = card;
    updates[`rooms/${roomId}/players/${playerId}/hand`] = hand;

    // Move turn to next player
    updates[`rooms/${roomId}/turn`] = getNextPlayer(gameState);

    // Add to activity log
    const logRef = db.ref(`rooms/${roomId}/log`);
    logRef.push(`${playerName} played ${card.color} ${card.value}`);

    // Commit updates
    db.ref().update(updates);
  });
}

function getNextPlayer(state) {
  const playerIds = Object.keys(state.players);
  let currentIndex = playerIds.findIndex(id => id === state.turn.id);
  let nextIndex = (currentIndex + 1) % playerIds.length;

  // Skip players without cards? (optional logic)
  // You can extend this logic for special cards effect.

  return {
    id: playerIds[nextIndex],
    name: state.players[playerIds[nextIndex]].name
  };
}

createRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId = roomInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!playerName || !roomId || !maxPlayers) {
    alert("Please enter valid name, room ID, and max players");
    return;
  }
  playerId = generateId();
  const deck = createDeck();
  const players = {};
  players[playerId] = { name: playerName, hand: [] };
  const discard = deck.pop();
  dealCards(deck, players);
  db.ref(`rooms/${roomId}`).set({
    players,
    deck,
    discard,
    turn: { id: playerId, name: playerName },
    maxPlayers,
    chat: [],
    log: []
  });
  roomNameLabel.textContent = roomId;
  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
};

joinRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId = roomInput.value.trim();
  if (!playerName || !roomId) {
    alert("Please enter valid name and room ID");
    return;
  }
  playerId = generateId();
  const playerRef = db.ref(`rooms/${roomId}/players/${playerId}`);

  // Add player with empty hand first
  playerRef.set({ name: playerName, hand: [] }).then(() => {
    // Draw 7 cards from deck
    db.ref(`rooms/${roomId}/deck`).once("value").then(deckSnap => {
      let deck = deckSnap.val() || [];
      if (deck.length < 7) {
        alert("Not enough cards in deck to join");
        return;
      }
      let hand = deck.splice(0, 7);
      // Update hand and deck atomically
      const updates = {};
      updates[`rooms/${roomId}/players/${playerId}/hand`] = hand;
      updates[`rooms/${roomId}/deck`] = deck;
      db.ref().update(updates);

      // Update UI
      roomNameLabel.textContent = roomId;
      lobbyDiv.style.display = "none";
      gameDiv.style.display = "block";
    });
  });
};

drawCardBtn.onclick = () => {
  if (!gameState || gameState.turn.id !== playerId) {
    logActivity("It's not your turn to draw.");
    return;
  }
  db.ref(`rooms/${roomId}/deck`).once("value").then(deckSnap => {
    let deck = deckSnap.val() || [];
    if (deck.length === 0) {
      logActivity("No cards left in deck to draw.");
      return;
    }
    const card = deck.shift();

    db.ref(`rooms/${roomId}/players/${playerId}/hand`).once("value").then(handSnap => {
      let hand = handSnap.val() || [];
      hand.push(card);

      // Update hand and deck
      const updates = {};
      updates[`rooms/${roomId}/players/${playerId}/hand`] = hand;
      updates[`rooms/${roomId}/deck`] = deck;

      // Move turn to next player
      updates[`rooms/${roomId}/turn`] = getNextPlayer(gameState);

      // Log activity
      db.ref(`rooms/${roomId}/log`).push(`${playerName} drew a card`);

      db.ref().update(updates);
    });
  });
};

sendChatBtn.onclick = () => {
  sendChatMessage();
};

chatInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !roomId) return;
  const chatRef = db.ref(`rooms/${roomId}/chat`);
  chatRef.push({ sender: playerName, message: msg });
  chatInput.value = "";
}

// Listen for game updates
db.ref(`rooms/${roomId}`).on("value", snapshot => {
  if (!snapshot.exists()) return;
  updateGameState(snapshot);
});

// Listen for chat messages
db.ref(`rooms/${roomId}/chat`).on("child_added", snapshot => {
  const chat = snapshot.val();
  if (!chat) return;
  postChat(`${chat.sender}: ${chat.message}`);
});

// Listen for activity log
db.ref(`rooms/${roomId}/log`).on("child_added", snapshot => {
  const log = snapshot.val();
  if (!log) return;
  logActivity(log);
});
