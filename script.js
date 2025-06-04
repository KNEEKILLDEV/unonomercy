// script.js

// 1) Firebase config & initialize
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  databaseURL: "https://unonomercy-66ba7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.appspot.com",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 2) DOM references
const playerNameInput    = document.getElementById("playerNameInput");
const roomInput          = document.getElementById("roomInput");
const maxPlayersInput    = document.getElementById("maxPlayersInput");
const createRoomBtn      = document.getElementById("createRoomBtn");
const joinRoomBtn        = document.getElementById("joinRoomBtn");
const drawCardBtn        = document.getElementById("drawCardBtn");
const sendChatBtn        = document.getElementById("sendChatBtn");
const chatInput          = document.getElementById("chatInput");

const lobbyDiv           = document.getElementById("lobby");
const gameDiv            = document.getElementById("game");
const roomNameLabel      = document.getElementById("roomNameLabel");
const turnLabel          = document.getElementById("turnLabel");
const playerHandDiv      = document.getElementById("playerHand");
const discardPileDiv     = document.getElementById("discardPile");
const opponentsContainer = document.getElementById("opponentsContainer");
const activityLogUL      = document.getElementById("activityLog");
const chatMessagesDiv    = document.getElementById("chatMessages");

// 3) Global state
let playerName = "";
let playerId   = "";
let roomId     = "";
let gameState  = null;

// 4) Utility: generate random ID
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// 5) Log activity entry
function logActivity(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  activityLogUL.appendChild(li);
  activityLogUL.scrollTop = activityLogUL.scrollHeight;
}

// 6) Post chat message
function postChat(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  chatMessagesDiv.appendChild(div);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// 7) Create card element for UI
function createCardElement(card) {
  const div = document.createElement("div");
  div.className = `card ${card.color}`;
  div.textContent = card.value;

  // Special card text
  if (["Skip","Reverse","+2","Wild","+4"].includes(card.value)) {
    div.classList.add("special-text");
    div.setAttribute("data-text", card.value);
  }

  div.onclick = () => attemptPlayCard(card);
  return div;
}

// 8) Render player's hand
function renderHand(cards) {
  playerHandDiv.innerHTML = "";
  if (!cards) return;
  cards.forEach(card => playerHandDiv.appendChild(createCardElement(card)));
}

// 9) Render opponents list
function renderOpponents(players) {
  opponentsContainer.innerHTML = "";
  Object.entries(players).forEach(([id, player]) => {
    if (id === playerId) return;
    const div = document.createElement("div");
    div.className = "opponent";
    div.textContent = `${player.name} — ${player.hand.length} cards`;
    if (gameState.turn.id === id) {
      div.classList.add("current-turn");
    }
    opponentsContainer.appendChild(div);
  });
}

// 10) Render top of discard pile
function renderDiscard(card) {
  discardPileDiv.innerHTML = "";
  if (!card) return;
  const topCard = createCardElement(card);
  topCard.onclick = null; // disable click
  discardPileDiv.appendChild(topCard);
}

// 11) Build and shuffle deck
function createDeck() {
  const colors = ["red","green","blue","yellow"];
  const values = ["0","1","2","3","4","5","6","7","8","9","Skip","Reverse","+2"];
  const deck = [];
  colors.forEach(color => {
    values.forEach(value => {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    });
  });
  const wilds = ["Wild","+4"];
  for (let i = 0; i < 4; i++) {
    wilds.forEach(value => deck.push({ color: "wild", value }));
  }
  return deck.sort(() => Math.random() - 0.5);
}

// 12) Deal 7 cards to each player in “players”
function dealCards(deck, players) {
  Object.keys(players).forEach(pid => {
    players[pid].hand = deck.splice(0, 7);
  });
  return deck;
}

// 13) Check if a card can be played
function canPlayCard(card) {
  if (!gameState) return false;
  const top = gameState.discard;
  if (!top) return true;
  if (card.color === "wild") return true;
  if (card.color === top.color) return true;
  if (card.value === top.value) return true;
  return false;
}

// 14) Determine next player for turn
function getNextPlayer() {
  const list = Object.keys(gameState.players);
  const idx  = list.indexOf(gameState.turn.id);
  const next = (idx + 1) % list.length;
  return { id: list[next], name: gameState.players[list[next]].name };
}

// 15) Attempt to play a card
function attemptPlayCard(card) {
  if (!gameState) return;
  if (gameState.turn.id !== playerId) {
    alert("Not your turn!");
    return;
  }
  if (!canPlayCard(card)) {
    alert("Illegal move!");
    return;
  }

  // Handle wild (+4) color choice
  let chosenColor = card.color;
  if (card.color === "wild") {
    let color = prompt("Choose a color: red, green, blue, yellow").toLowerCase();
    while (!["red","green","blue","yellow"].includes(color)) {
      color = prompt("Invalid. Choose: red, green, blue, yellow").toLowerCase();
    }
    chosenColor = color;
    card = { color: "wild", value: card.value, chosenColor };
  }

  // Remove that card from player's hand in DB
  const handRef = db.ref(`rooms/${roomId}/players/${playerId}/hand`);
  handRef.once("value").then(handSnap => {
    let hand = handSnap.val() || [];
    const idx = hand.findIndex(c => c.color===card.color && c.value===card.value);
    if (idx === -1) {
      logActivity("Error: card not found in hand.");
      return;
    }
    hand.splice(idx, 1);
    handRef.set(hand);

    // Update discard in DB
    db.ref(`rooms/${roomId}/discard`).set(card);

    // Apply special effects
    if (card.value === "Skip") {
      let next1 = getNextPlayer();
      let next2 = db.ref(`rooms/${roomId}/turn`).once("value").then(snap => {
        const n = next1;
        db.ref(`rooms/${roomId}/turn`).set(getNextPlayer());
      });
    } else if (card.value === "Reverse") {
      // For simplicity: treat Reverse as skip when 2 players
      // Otherwise flip direction flag (not implemented here since basic loop)
      const next = getNextPlayer();
      db.ref(`rooms/${roomId}/turn`).set(next);
    } else if (card.value === "+2") {
      const next = getNextPlayer();
      drawCardsFor(next.id, 2);
      db.ref(`rooms/${roomId}/turn`).set(getNextPlayer());
    } else if (card.value === "+4") {
      const next = getNextPlayer();
      drawCardsFor(next.id, 4);
      db.ref(`rooms/${roomId}/turn`).set(getNextPlayer());
    } else {
      // Normal card: next player
      const next = getNextPlayer();
      db.ref(`rooms/${roomId}/turn`).set(next);
    }

    // Log the play
    db.ref(`rooms/${roomId}/log`).push(`${playerName} played ${card.color} ${card.value}`);
  });
}

// 16) Draw specified number of cards
function drawCardsFor(pid, count) {
  const deckRef = db.ref(`rooms/${roomId}/deck`);
  deckRef.once("value").then(deckSnap => {
    let deck = deckSnap.val() || [];
    if (deck.length === 0) {
      logActivity("Deck is empty.");
      return;
    }
    const drawn = deck.splice(0, count);
    deckRef.set(deck);

    const handRef = db.ref(`rooms/${roomId}/players/${pid}/hand`);
    handRef.once("value").then(handSnap => {
      let hand = handSnap.val() || [];
      hand.push(...drawn);
      handRef.set(hand);
      db.ref(`rooms/${roomId}/log`).push(`${gameState.players[pid].name} drew ${count} cards`);
    });
  });
}

// 17) Draw a single card via button
drawCardBtn.onclick = () => {
  if (!gameState) return;
  if (gameState.turn.id !== playerId) {
    logActivity("Not your turn to draw!");
    return;
  }
  drawCardsFor(playerId, 1);
  const next = getNextPlayer();
  db.ref(`rooms/${roomId}/turn`).set(next);
};

// 18) Send chat on button or Enter
sendChatBtn.onclick = sendChatMessage;
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendChatMessage();
});
function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !roomId) return;
  db.ref(`rooms/${roomId}/chat`).push(`${playerName}: ${msg}`);
  chatInput.value = "";
}

// 19) Initialize game listener
function initializeGameListener() {
  if (!roomId) return;
  db.ref(`rooms/${roomId}`).off();
  db.ref(`rooms/${roomId}`).on("value", snap => {
    const game = snap.val();
    if (!game || !game.players || !game.players[playerId]) return;
    gameState = game;
    roomNameLabel.textContent = roomId;
    turnLabel.textContent = `Turn: ${game.turn.name}`;
    renderHand(game.players[playerId].hand || []);
    renderDiscard(game.discard);
    renderOpponents(game.players);
    activityLogUL.innerHTML = "";
    if (game.log) {
      Object.values(game.log).forEach(entry => logActivity(entry));
    }
  });
}

// 20) Initialize chat listener
function initializeChatListener() {
  if (!roomId) return;
  db.ref(`rooms/${roomId}/chat`).off();
  db.ref(`rooms/${roomId}/chat`).on("child_added", snap => {
    postChat(snap.val());
  });
}

// 21) Initialize log listener (redundant if handled in game listener)

// 22) Create room workflow
createRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId     = roomInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!playerName || !roomId || !maxPlayers) {
    alert("Enter name, room ID, and max players.");
    return;
  }
  playerId = generateId();

  const deck = createDeck();
  const discard = deck.pop();
  const players = {};
  players[playerId] = { name: playerName, hand: [] };
  const dealtDeck = dealCards(deck, players);

  db.ref(`rooms/${roomId}`).set({
    players,
    deck: dealtDeck,
    discard,
    turn: { id: playerId, name: playerName },
    maxPlayers,
    chat: [],
    log: []
  });

  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
  initializeGameListener();
  initializeChatListener();
};

// 23) Join room workflow
joinRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId     = roomInput.value.trim();
  if (!playerName || !roomId) {
    alert("Enter name and room ID.");
    return;
  }
  playerId = generateId();

  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.transaction(room => {
    if (!room) return;
    if (!room.players) room.players = {};
    if (Object.keys(room.players).length >= room.maxPlayers) return; 
    if (!room.deck || room.deck.length < 7) return;

    const hand = room.deck.splice(0, 7);
    room.players[playerId] = { name: playerName, hand };
    return room;
  }, (error, committed) => {
    if (!committed) {
      alert("Cannot join (room full or not enough cards).");
      return;
    }
    lobbyDiv.style.display = "none";
    gameDiv.style.display = "block";
    initializeGameListener();
    initializeChatListener();
  });
};
