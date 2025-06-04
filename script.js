<script>
// === FIREBASE CONFIGURATION ===
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

// === DOM ELEMENTS ===
const playerNameInput = document.getElementById("playerNameInput");
const roomInput = document.getElementById("roomInput");
const maxPlayersInput = document.getElementById("maxPlayersInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const drawCardBtn = document.getElementById("drawCardBtn");
const unoBtn = document.getElementById("unoBtn");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatInput = document.getElementById("chatInput");
const restartBtn = document.getElementById("restartBtn");
const colorModal = document.getElementById("colorModal");
const colorOptions = document.querySelectorAll(".color-option");
const joinMsg = document.getElementById("joinMsg");

const lobbyDiv = document.getElementById("lobby");
const gameDiv = document.getElementById("game");
const roomNameLabel = document.getElementById("roomNameLabel");
const turnLabel = document.getElementById("turnLabel");
const playerHandDiv = document.getElementById("playerHand");
const discardPileDiv = document.getElementById("discardPile");
const opponentsContainer = document.getElementById("opponentsContainer");
const spectatorsContainer = document.getElementById("spectatorsContainer");
const activityLogUL = document.getElementById("activityLog");
const chatMessagesDiv = document.getElementById("chatMessages");
const gameOverBanner = document.getElementById("gameOverBanner");
const winnerText = document.getElementById("winnerText");

// === STATE ===
let playerName = "";
let playerId = "";
let roomId = "";
let gameState = null;
let pendingWild = null;
let unoTimeout = null;
let turnTimer = null;

// === RECONNECT IF POSSIBLE ===
window.addEventListener("load", () => {
  const savedRoom = localStorage.getItem("uno_roomId");
  const savedPlayer = localStorage.getItem("uno_playerId");
  const savedName = localStorage.getItem("uno_playerName");
  if (savedRoom && savedPlayer && savedName) {
    roomId = savedRoom;
    playerId = savedPlayer;
    playerName = savedName;
    lobbyDiv.style.display = "none";
    gameDiv.style.display = "block";
    roomNameLabel.textContent = roomId;
    initializeGameListener();
    initializeChatListener();
    initializeBackupCleanup();
  }
});

// === JOIN ROOM ===
joinRoomBtn.addEventListener("click", async () => {
  const name = playerNameInput.value.trim();
  const rname = roomInput.value.trim().toLowerCase();
  if (!name || !rname) return alert("Enter your name and room name.");
  playerName = name;
  roomId = rname;
  playerId = generateId();

  const roomRef = db.ref(`rooms/${roomId}`);
  const snapshot = await roomRef.once("value");
  const room = snapshot.val();

  if (room && room.gameStarted && !(room.players && room.players[playerId])) {
    // Join as spectator
    await db.ref(`rooms/${roomId}/spectators/${playerId}`).set({ name });
    joinMsg.textContent = "You joined as a spectator because the game has already started.";
  } else {
    // Join as player
    await db.ref(`rooms/${roomId}/players/${playerId}`).set({
      name,
      hand: [],
      calledUNO: false,
      connected: true
    });
  }

  localStorage.setItem("uno_roomId", roomId);
  localStorage.setItem("uno_playerId", playerId);
  localStorage.setItem("uno_playerName", playerName);

  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
  roomNameLabel.textContent = roomId;
  initializeGameListener();
  initializeChatListener();
  initializeBackupCleanup();
});

// === CREATE ROOM ===
createRoomBtn.addEventListener("click", async () => {
  const name = playerNameInput.value.trim();
  const rname = roomInput.value.trim().toLowerCase();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!name || !rname || isNaN(maxPlayers)) return alert("Please enter your name, room, and max players.");

  playerName = name;
  roomId = rname;
  playerId = generateId();

  // Create deck and shuffle
  let deck = createDeck();
  deck = shuffleDeck(deck);

  // Initialize players object
  const players = {};
  players[playerId] = {
    name,
    hand: [],
    calledUNO: false,
    connected: true
  };

  // Deal 7 cards to the creator player
  for (let i = 0; i < 7; i++) {
    players[playerId].hand.push(deck.pop());
  }

  // Initialize seat order
  const seatOrder = [playerId];

  // Initialize discard pile with first card (non-wild action)
  let discard = null;
  while (deck.length > 0) {
    const card = deck.pop();
    if (!card.isWild && !["skip", "reverse", "draw2"].includes(card.type)) {
      discard = card;
      break;
    } else {
      deck.unshift(card);
    }
  }

  await db.ref(`rooms/${roomId}`).set({
    players,
    seatOrder,
    deck,
    discard,
    direction: 1,
    gameStarted: true,
    turn: { id: playerId, name },
    log: {},
    spectators: {},
    maxPlayers
  });

  localStorage.setItem("uno_roomId", roomId);
  localStorage.setItem("uno_playerId", playerId);
  localStorage.setItem("uno_playerName", playerName);

  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
  roomNameLabel.textContent = roomId;
  initializeGameListener();
  initializeChatListener();
  initializeBackupCleanup();
});

// === COLOR PICKING FOR WILD CARDS ===
colorOptions.forEach(option => {
  option.addEventListener("click", () => {
    if (!pendingWild) return;
    const chosenColor = option.dataset.color;
    pendingWild.chosenColor = chosenColor;
    colorModal.style.display = "none";
    playCard(pendingWild);
    pendingWild = null;
  });
});

// === DRAW CARD BUTTON ===
drawCardBtn.addEventListener("click", () => {
  if (!gameState) return;
  const currentTurn = gameState.turn;
  if (currentTurn.id !== playerId) {
    alert("It's not your turn!");
    return;
  }
  drawCard(playerId);
  drawCardBtn.disabled = true;
});

// === UNO BUTTON ===
unoBtn.addEventListener("click", () => {
  if (!gameState) return;
  const player = gameState.players[playerId];
  if (!player) return;
  if (player.hand.length === 1) {
    callUno(playerId);
    unoBtn.disabled = true;
  } else {
    alert("You must have exactly one card to call UNO.");
  }
});

// === CHAT SEND BUTTON ===
sendChatBtn.addEventListener("click", () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  sendChatMessage(playerName, msg);
  chatInput.value = "";
});

// === RESTART BUTTON ===
restartBtn.addEventListener("click", async () => {
  if (!roomId) return;
  await db.ref(`rooms/${roomId}`).remove();
  location.reload();
});

// === GAME LISTENER ===
function initializeGameListener() {
  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.on("value", (snapshot) => {
    const roomData = snapshot.val();
    if (!roomData) {
      alert("Room closed or does not exist.");
      location.reload();
      return;
    }
    gameState = roomData;
    renderGame();
  });
}

// === CHAT LISTENER ===
function initializeChatListener() {
  const chatRef = db.ref(`rooms/${roomId}/chat`);
  chatRef.on("child_added", (snapshot) => {
    const chatMsg = snapshot.val();
    if (!chatMsg) return;
    addChatMessage(chatMsg.name, chatMsg.message);
  });
}

// === BACKUP CLEANUP ===
function initializeBackupCleanup() {
  window.addEventListener("beforeunload", () => {
    if (!roomId || !playerId) return;
    db.ref(`rooms/${roomId}/players/${playerId}/connected`).set(false);
  });
}

// === CREATE DECK ===
function createDeck() {
  const colors = ["red", "green", "blue", "yellow"];
  const types = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"];
  const deck = [];

  for (const color of colors) {
    // One 0 card per color
    deck.push({ color, type: "0", isWild: false });

    // Two of each 1-9, skip, reverse, draw2 per color
    for (const type of types.slice(1)) {
      deck.push({ color, type, isWild: false });
      deck.push({ color, type, isWild: false });
    }
  }

  // Add wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: null, type: "wild", isWild: true });
    deck.push({ color: null, type: "wild_draw4", isWild: true });
  }

  return deck;
}

// === SHUFFLE DECK ===
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// === RENDER GAME ===
function renderGame() {
  // Show current turn
  turnLabel.textContent = `Turn: ${gameState.turn ? gameState.turn.name : "N/A"}`;

  // Show discard pile
  discardPileDiv.innerHTML = "";
  if (gameState.discard) {
    const card = createCardElement(gameState.discard);
    discardPileDiv.appendChild(card);
  }

  // Show player hand
  const player = gameState.players[playerId];
  playerHandDiv.innerHTML = "";
  if (player) {
    player.hand.forEach((card, idx) => {
      const cardEl = createCardElement(card);
      cardEl.addEventListener("click", () => onCardClick(card, idx));
      playerHandDiv.appendChild(cardEl);
    });
  }

  // Show opponents
  opponentsContainer.innerHTML = "";
  for (const pid of gameState.seatOrder) {
    if (pid === playerId) continue;
    const p = gameState.players[pid];
    if (!p) continue;
    const oppDiv = document.createElement("div");
    oppDiv.className = "opponent";
    oppDiv.textContent = `${p.name} (${p.hand.length} cards)`;
    opponentsContainer.appendChild(oppDiv);
  }

  // Show spectators
  spectatorsContainer.innerHTML = "";
  for (const sid in gameState.spectators) {
    const spec = gameState.spectators[sid];
    const specDiv = document.createElement("div");
    specDiv.textContent = `Spectator: ${spec.name}`;
    spectatorsContainer.appendChild(specDiv);
  }

  // Show log messages
  activityLogUL.innerHTML = "";
  if (gameState.log) {
    const keys = Object.keys(gameState.log);
    keys.sort((a, b) => parseInt(a) - parseInt(b));
    keys.forEach((key) => {
      const li = document.createElement("li");
      li.textContent = gameState.log[key];
      activityLogUL.appendChild(li);
    });
  }

  // Show UNO button enabled or disabled
  if (player && player.hand.length === 1 && !player.calledUNO) {
    unoBtn.disabled = false;
  } else {
    unoBtn.disabled = true;
  }

  // Draw Card button enabled only if player's turn
  drawCardBtn.disabled = !(gameState.turn && gameState.turn.id === playerId);

  // Check for game over
  for (const pid in gameState.players) {
    if (gameState.players[pid].hand.length === 0) {
      showGameOver(gameState.players[pid].name);
      return;
    }
  }

  gameOverBanner.style.display = "none";
}

// === SHOW GAME OVER ===
function showGameOver(winnerName) {
  winnerText.textContent = `Game Over! Winner: ${winnerName}`;
  gameOverBanner.style.display = "block";
  drawCardBtn.disabled = true;
  unoBtn.disabled = true;
  sendChatBtn.disabled = true;
  restartBtn.disabled = false;
}

// === CREATE CARD ELEMENT ===
function createCardElement(card) {
  const div = document.createElement("div");
  div.className = "card";
  if (card.isWild) {
    div.textContent = card.type === "wild_draw4" ? "Wild +4" : "Wild";
    div.style.backgroundColor = card.chosenColor || "black";
    div.style.color = "white";
  } else {
    div.textContent = `${card.color} ${card.type}`;
    div.style.backgroundColor = card.color;
    div.style.color = "white";
  }
  return div;
}

// === CARD CLICK HANDLER ===
function onCardClick(card, cardIndex) {
  if (!gameState || !gameState.turn) return;
  if (gameState.turn.id !== playerId) {
    alert("It's not your turn!");
    return;
  }
  if (canPlayCard(card, gameState.discard)) {
    if (card.isWild) {
      // Show color picker modal
      pendingWild = { ...card, cardIndex };
      colorModal.style.display = "block";
    } else {
      playCard({ ...card, cardIndex });
    }
  } else {
    alert("You can't play that card.");
  }
}

// === CAN PLAY CARD ===
function canPlayCard(card, topCard) {
  if (!topCard) return true;
  if (card.isWild) return true;
  if (card.color === topCard.color) return true;
  if (card.type === topCard.type) return true;
  return false;
}

// === PLAY CARD ===
async function playCard({ color, type, isWild, chosenColor, cardIndex }) {
  if (!gameState) return;
  const player = gameState.players[playerId];
  if (!player) return;

  const hand = [...player.hand];
  const cardToPlay = hand[cardIndex];

  // Validate card to play is actually the one clicked
  if (!cardToPlay || cardToPlay.color !== color || cardToPlay.type !== type) {
    alert("Invalid card.");
    return;
  }

  // Remove card from player's hand
  hand.splice(cardIndex, 1);

  // Update game state in Firebase
  const updates = {};
  updates[`rooms/${roomId}/players/${playerId}/hand`] = hand;
  updates[`rooms/${roomId}/discard`] = isWild ? { color: chosenColor, type, isWild } : { color, type, isWild };
  updates[`rooms/${roomId}/players/${playerId}/calledUNO`] = false;

  // Handle special card effects (skip, reverse, draw2, wild_draw4)
  let nextTurnId = getNextPlayerId();
  let nextTurnName = gameState.players[nextTurnId]?.name || "";

  let newDirection = gameState.direction;
  let newDeck = [...gameState.deck];
  let logEntry = `${playerName} played ${isWild ? (type === "wild_draw4" ? "Wild Draw 4" : "Wild") : color + " " + type}`;

  if (type === "skip") {
    nextTurnId = getNextPlayerId(nextTurnId);
    nextTurnName = gameState.players[nextTurnId]?.name || "";
    logEntry += " and skipped next player.";
  } else if (type === "reverse") {
    newDirection = gameState.direction * -1;
    logEntry += " and reversed direction.";
  } else if (type === "draw2") {
    // Next player draws 2 cards
    const drawCards = drawCardsFor(nextTurnId, 2);
    logEntry += ` and forced ${nextTurnName} to draw 2 cards.`;
  } else if (type === "wild_draw4") {
    // Next player draws 4 cards
    const drawCards = drawCardsFor(nextTurnId, 4);
    logEntry += ` and forced ${nextTurnName} to draw 4 cards.`;
  }

  // If no skip or special logic changed next player, proceed normally
  if (![ "skip", "wild_draw4", "draw2" ].includes(type)) {
    nextTurnId = getNextPlayerId();
    nextTurnName = gameState.players[nextTurnId]?.name || "";
  }

  updates[`rooms/${roomId}/turn`] = { id: nextTurnId, name: nextTurnName };
  updates[`rooms/${roomId}/direction`] = newDirection;
  updates[`rooms/${roomId}/deck`] = newDeck;

  // Add log
  const logKey = Date.now();
  updates[`rooms/${roomId}/log/${logKey}`] = logEntry;

  await db.ref().update(updates);
}

// === DRAW CARDS FOR PLAYER ===
function drawCardsFor(pid, count) {
  if (!gameState) return [];
  const deck = [...gameState.deck];
  const player = gameState.players[pid];
  if (!player) return [];
  const newHand = [...player.hand];
  const drawnCards = [];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      // Shuffle discard pile except top card into deck
      const discard = gameState.discard;
      let discardPile = [];
      for (const pid2 in gameState.players) {
        const p2 = gameState.players[pid2];
        discardPile = discardPile.concat(p2.hand);
      }
      discardPile = discardPile.filter(c => c !== discard);
      shuffleDeck(discardPile);
      deck.push(...discardPile);
    }
    const card = deck.pop();
    newHand.push(card);
    drawnCards.push(card);
  }

  // Update in Firebase
  db.ref(`rooms/${roomId}/players/${pid}/hand`).set(newHand);
  db.ref(`rooms/${roomId}/deck`).set(deck);
  return drawnCards;
}

// === DRAW CARD FUNCTION FOR SELF ===
function drawCard(pid) {
  if (!gameState) return;
  const deck = [...gameState.deck];
  const player = gameState.players[pid];
  if (!player) return;
  if (deck.length === 0) {
    alert("Deck is empty!");
    return;
  }
  const card = deck.pop();
  const newHand = [...player.hand, card];

  const updates = {};
  updates[`rooms/${roomId}/players/${pid}/hand`] = newHand;
  updates[`rooms/${roomId}/deck`] = deck;

  // Advance turn after draw
  const nextTurnId = getNextPlayerId();
  const nextTurnName = gameState.players[nextTurnId]?.name || "";
  updates[`rooms/${roomId}/turn`] = { id: nextTurnId, name: nextTurnName };

  db.ref().update(updates);
}

// === GET NEXT PLAYER ID ===
function getNextPlayerId(startId = null) {
  if (!gameState) return null;
  const order = gameState.seatOrder;
  const dir = gameState.direction || 1;
  const currentId = startId || (gameState.turn ? gameState.turn.id : null);
  if (!currentId) return order[0];
  let idx = order.indexOf(currentId);
  if (idx === -1) return order[0];
  idx = (idx + dir + order.length) % order.length;
  return order[idx];
}

// === CALL UNO ===
async function callUno(pid) {
  if (!gameState) return;
  await db.ref(`rooms/${roomId}/players/${pid}/calledUNO`).set(true);
  const logKey = Date.now();
  await db.ref(`rooms/${roomId}/log/${logKey}`).set(`${gameState.players[pid].name} called UNO!`);
}

// === SEND CHAT MESSAGE ===
async function sendChatMessage(name, message) {
  const chatRef = db.ref(`rooms/${roomId}/chat`);
  const msgObj = { name, message };
  await chatRef.push(msgObj);
}

// === ADD CHAT MESSAGE TO UI ===
function addChatMessage(name, message) {
  const msgDiv = document.createElement("div");
  msgDiv.textContent = `${name}: ${message}`;
  chatMessagesDiv.appendChild(msgDiv);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// === GENERATE RANDOM ID ===
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
</script>
