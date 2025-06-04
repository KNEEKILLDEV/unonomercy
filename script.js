// Firebase config & init
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  databaseURL: "https://unonomercy-66ba7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.firebasedestorage.app",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const createRoomForm = document.getElementById("createRoomForm");
const joinRoomForm = document.getElementById("joinRoomForm");

const lobbyDiv = document.getElementById("lobby");
const gameArea = document.getElementById("gameArea");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const yourNameDisplay = document.getElementById("yourNameDisplay");
const currentPlayerDisplay = document.getElementById("currentPlayerDisplay");
const playerCountSpan = document.getElementById("playerCount");
const maxPlayersDisplay = document.getElementById("maxPlayersDisplay");
const creatorDisplay = document.getElementById("creatorDisplay");

const startGameBtn = document.getElementById("startGameBtn");
const restartGameBtn = document.getElementById("restartGameBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const yourHandDiv = document.getElementById("yourHand");
const opponentList = document.getElementById("opponentList");

const drawCardBtn = document.getElementById("drawCardBtn");
const callUnoBtn = document.getElementById("callUnoBtn");

const topCardDiv = document.getElementById("topCard");
const currentColorSpan = document.getElementById("currentColor");

const chatInput = document.getElementById("chatInput");
const chatLog = document.getElementById("chatLog");
const activityLog = document.getElementById("activityLog");

const colorModal = document.getElementById("colorModal");
const closeModalBtn = document.getElementById("closeModalBtn");

let roomRef = null;
let unsubscribe = null;
let playerName = "";
let playerIndex = -1;
let maxPlayers = 0;
let creatorName = null;
let gameStarted = false;
let gameDirection = 1; // 1 or -1

// Utility: generate random 6-char room code
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Utility: shuffle array
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// Create a new deck of UNO cards
function createDeck() {
  const colors = ["red", "green", "blue", "yellow"];
  const values = [
    "0","1","2","3","4","5","6","7","8","9",
    "skip","skip",
    "reverse","reverse",
    "+2","+2"
  ];
  let deck = [];

  // Add colored cards
  colors.forEach(color => {
    values.forEach(val => {
      deck.push(color + " " + val);
    });
  });

  // Add Wild cards
  for (let i = 0; i < 4; i++) {
    deck.push("wild");
    deck.push("wild +4");
  }
  return shuffle(deck);
}

// JOIN ROOM LOGIC
joinRoomForm.addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("joinName").value.trim();
  const roomCode = document.getElementById("roomCode").value.trim().toUpperCase();

  if (!name || !roomCode) return alert("Fill all fields");

  playerName = name;
  roomRef = db.collection("rooms").doc(roomCode);

  const doc = await roomRef.get();

  if (!doc.exists) {
    return alert("Room not found");
  }

  const data = doc.data();

  if (data.players.length >= data.maxPlayers) {
    return alert("Room full");
  }

  if (data.gameStarted) {
    return alert("Game already started");
  }

  // Add player
  const players = data.players;
  if (players.find(p => p.name === playerName)) {
    alert("Name already taken in room");
    return;
  }

  players.push({ name: playerName, hand: [], unoCalled: false });

  await roomRef.update({ players });

  playerIndex = players.findIndex(p => p.name === playerName);
  maxPlayers = data.maxPlayers;
  creatorName = data.creator || players[0].name;

  joinRoom(roomCode);
});

// CREATE ROOM LOGIC
createRoomForm.addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("createName").value.trim();
  let maxP = parseInt(document.getElementById("maxPlayers").value);

  if (!name) return alert("Enter your name");
  if (!maxP || maxP < 2 || maxP > 10) return alert("Max players must be 2 to 10");

  playerName = name;
  maxPlayers = maxP;
  const roomCode = generateRoomCode();

  roomRef = db.collection("rooms").doc(roomCode);

  const deck = createDeck();

  const roomData = {
    players: [{ name: playerName, hand: [], unoCalled: false }],
    maxPlayers,
    creator: playerName,
    deck,
    discardPile: [],
    currentPlayer: 0,
    currentColor: null,
    gameStarted: false,
    direction: 1,
    pendingDraw: 0,
    pendingSkip: false,
    logs: [],
    chat: []
  };

  await roomRef.set(roomData);

  playerIndex = 0;
  creatorName = playerName;

  joinRoom(roomCode);
});

async function joinRoom(roomCode) {
  lobbyDiv.classList.add("hidden");
  gameArea.classList.remove("hidden");

  roomCodeDisplay.textContent = roomCode;
  yourNameDisplay.textContent = playerName;
  creatorDisplay.textContent = creatorName;
  maxPlayersDisplay.textContent = maxPlayers;

  // Show start button only for creator and if game not started
  startGameBtn.style.display = (playerName === creatorName) ? "inline-block" : "none";
  restartGameBtn.style.display = "none";

  // Subscribe to room updates
  if (unsubscribe) unsubscribe();
  unsubscribe = roomRef.onSnapshot(doc => {
    const data = doc.data();
    if (!data) return;

    maxPlayers = data.maxPlayers;
    creatorName = data.creator;
    gameStarted = data.gameStarted;
    playerCountSpan.textContent = data.players.length;
    maxPlayersDisplay.textContent = maxPlayers;
    creatorDisplay.textContent = creatorName;

    updateGame(data);
  });
}

function updateGame(data) {
  // Update logs and chat
  updateLog(activityLog, data.logs);
  updateLog(chatLog, data.chat);

  // Update current player
  currentPlayerDisplay.textContent = data.players[data.currentPlayer]?.name || "None";

  // Update direction
  gameDirection = data.direction;

  // Update current color
  currentColorSpan.textContent = data.currentColor || "-";

  // Update your hand and opponents
  const players = data.players;
  const me = players[playerIndex];

  if (!me) return; // player left or not in room?

  // Show your hand cards
  yourHandDiv.innerHTML = "";
  me.hand.forEach(card => {
    const c = createCardElement(card);
    c.addEventListener("click", () => tryPlayCard(card));
    yourHandDiv.appendChild(c);
  });

  // Opponents
  opponentList.innerHTML = "";
  players.forEach((p, i) => {
    if (i === playerIndex) return;

    let nameText = p.name;
    if (data.currentPlayer === i) nameText += " (Playing)";
    if (p.hand.length === 1 && !p.unoCalled) nameText += " - UNO!";

    const li = document.createElement("li");
    li.textContent = `${nameText} - ${p.hand.length} cards`;
    opponentList.appendChild(li);
  });

  // Show top card in discard pile
  const topCard = data.discardPile.length ? data.discardPile[data.discardPile.length - 1] : null;
  topCardDiv.innerHTML = "";
  if (topCard) {
    const topCardEl = createCardElement(topCard);
    topCardDiv.appendChild(topCardEl);
  }

  // Show start button only if creator and game not started
  startGameBtn.style.display = (playerName === creatorName && !gameStarted) ? "inline-block" : "none";
  restartGameBtn.style.display = (playerName === creatorName && gameStarted) ? "inline-block" : "none";

  // Enable or disable buttons based on turn
  const isMyTurn = (data.currentPlayer === playerIndex);
  drawCardBtn.disabled = !isMyTurn || data.pendingDraw > 0 || data.pendingSkip;
  callUnoBtn.disabled = !isMyTurn || me.unoCalled || me.hand.length !== 1;

  // Auto-advance if pendingDraw or skip and it's your turn? No, handled by game state
}

function createCardElement(cardStr) {
  // cardStr examples: "red 3", "wild", "wild +4", "blue skip"
  const cardDiv = document.createElement("div");
  cardDiv.classList.add("card");

  if (cardStr.startsWith("wild")) {
    cardDiv.classList.add("wild");
    cardDiv.textContent = cardStr.toUpperCase();
  } else {
    const [color, value] = cardStr.split(" ");
    cardDiv.classList.add(color);
    if (value === "+2") cardDiv.textContent = "+2";
    else if (value === "skip") cardDiv.textContent = "SKIP";
    else if (value === "reverse") cardDiv.textContent = "REVERSE";
    else cardDiv.textContent = value;
  }
  return cardDiv;
}

async function tryPlayCard(card) {
  if (!roomRef) return;

  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();

  if (!data.gameStarted) return alert("Game has not started");
  if (data.currentPlayer !== playerIndex) return alert("Not your turn");

  const me = data.players[playerIndex];
  if (!me.hand.includes(card)) return alert("You don't have that card");

  // Check if card can be played on topCard & currentColor
  const topCard = data.discardPile.length ? data.discardPile[data.discardPile.length - 1] : null;
  let currentColor = data.currentColor;

  // Wild can always be played (except if pendingDraw > 0 and not wild +4)
  if (data.pendingDraw > 0 && !(card.startsWith("wild"))) {
    alert("You must draw or play a wild card when there are pending draws");
    return;
  }

  if (!isValidPlay(card, topCard, currentColor)) {
    alert("Invalid card to play");
    return;
  }

  // Remove card from hand
  const newHand = me.hand.filter(c => c !== card);

  // Update discard pile, current color (wild needs color picker)
  let newDiscard = [...data.discardPile, card];
  let newColor = currentColor;

  // If card is wild, prompt for color
  if (card.startsWith("wild")) {
    openColorModal().then(async selectedColor => {
      if (!selectedColor) return;

      newColor = selectedColor;

      // Prepare new game state after playing card
      await processCardEffect(card, data, playerIndex, newDiscard, newColor, newHand);
    });
  } else {
    await processCardEffect(card, data, playerIndex, newDiscard, newColor, newHand);
  }
}

function isValidPlay(card, topCard, currentColor) {
  if (!topCard) return true; // If no card yet

  if (card.startsWith("wild")) return true;

  const [cardColor, cardVal] = card.split(" ");
  if (!cardColor) return false;

  // Top card color or value must match OR current color must match
  let [topColor, topVal] = topCard.split(" ");
  if (topCard.startsWith("wild")) {
    topColor = currentColor;
  }

  return (cardColor === currentColor) || (cardColor === topColor) || (cardVal === topVal);
}

// Open modal for color selection, returns promise of color string
function openColorModal() {
  return new Promise(resolve => {
    colorModal.classList.remove("hidden");

    function onSelect(e) {
      const color = e.target.dataset.color;
      closeModalBtn.removeEventListener("click", onClose);
      colorModal.removeEventListener("click", onOutsideClick);
      colorButtons.forEach(b => b.removeEventListener("click", onSelect));
      colorModal.classList.add("hidden");
      resolve(color);
    }

    function onClose() {
      closeModalBtn.removeEventListener("click", onClose);
      colorModal.removeEventListener("click", onOutsideClick);
      colorButtons.forEach(b => b.removeEventListener("click", onSelect));
      colorModal.classList.add("hidden");
      resolve(null);
    }

    function onOutsideClick(e) {
      if (e.target === colorModal) onClose();
    }

    const colorButtons = [...document.querySelectorAll(".color-btn")];
    colorButtons.forEach(btn => btn.addEventListener("click", onSelect));
    closeModalBtn.addEventListener("click", onClose);
    colorModal.addEventListener("click", onOutsideClick);
  });
}

async function processCardEffect(card, data, currentPlayer, newDiscard, newColor, newHand) {
  const players = [...data.players];

  // Update current player's hand
  players[currentPlayer].hand = newHand;
  players[currentPlayer].unoCalled = false;

  let nextPlayer = currentPlayer;
  let direction = data.direction;
  let pendingDraw = 0;
  let skipNext = false;

  // Clear pending skip and draw unless new cards impose new ones
  let newPendingDraw = 0;
  let newPendingSkip = false;

  // Check card effects:
  if (card === "wild") {
    // No draw or skip, just set color and next player
    newPendingDraw = 0;
    newPendingSkip = false;
  } else if (card === "wild +4") {
    // Next player draws 4 and skips turn
    newPendingDraw = 4;
    newPendingSkip = true;
  } else {
    const [color, value] = card.split(" ");

    if (value === "+2") {
      newPendingDraw = 2;
      newPendingSkip = true;
    } else if (value === "skip") {
      newPendingSkip = true;
    } else if (value === "reverse") {
      direction = -direction;
      if (players.length === 2) {
        // Reverse acts like skip if 2 players
        newPendingSkip = true;
      }
    }
  }

  // Compute next player index based on direction and skips/draws
  function getNextPlayerIndex(curr, dir, skip) {
    let next = curr;
    for (let i = 0; i <= (skip ? 1 : 0); i++) {
      next += dir;
      if (next < 0) next = players.length - 1;
      if (next >= players.length) next = 0;
    }
    return next;
  }

  nextPlayer = getNextPlayerIndex(currentPlayer, direction, newPendingSkip);

  // If pending draw > 0, next player draws cards and skips turn
  if (newPendingDraw > 0) {
    // Add cards to next player's hand
    const deck = [...data.deck];
    let drawCards = [];

    for (let i = 0; i < newPendingDraw; i++) {
      if (deck.length === 0) {
        // reshuffle discard except top card
        const discard = [...newDiscard];
        const top = discard.pop();
        deck.push(...shuffle(discard));
        newDiscard = [top];
      }
      drawCards.push(deck.pop());
    }

    players[nextPlayer].hand = players[nextPlayer].hand.concat(drawCards);

    // Update deck
    await roomRef.update({ deck });

    // Player gets penalized for not calling UNO if he has one card after draw? That logic can be later.

  }

  // Check if player just emptied hand -> game over
  let gameEnded = false;
  let winnerName = null;

  if (players[currentPlayer].hand.length === 0) {
    gameEnded = true;
    winnerName = players[currentPlayer].name;
  }

  // Update logs
  const newLogs = [...data.logs];
  newLogs.push(`${players[currentPlayer].name} played ${card} (Color: ${newColor})`);

  if (newPendingDraw > 0) {
    newLogs.push(`${players[nextPlayer].name} draws ${newPendingDraw} card(s) and skips turn`);
  }
  if (newPendingSkip && newPendingDraw === 0) {
    newLogs.push(`${players[nextPlayer].name} is skipped`);
  }
  if (gameEnded) {
    newLogs.push(`🎉 ${winnerName} has won the game!`);
  }

  // Update Firestore
  await roomRef.update({
    players,
    discardPile: newDiscard,
    currentColor: newColor,
    currentPlayer: gameEnded ? currentPlayer : nextPlayer,
    direction,
    pendingDraw: 0,
    pendingSkip: false,
    logs: newLogs,
    gameStarted: gameEnded ? false : true,
  });
}

// Start game: distribute 7 cards each from deck and start with 1 discard card
startGameBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();
  if (data.gameStarted) return alert("Game already started");

  const deck = [...data.deck];
  const players = [...data.players];

  // Deal 7 cards to each player
  for (let i = 0; i < players.length; i++) {
    const hand = [];
    for (let j = 0; j < 7; j++) {
      if (deck.length === 0) {
        alert("Deck empty while dealing");
        break;
      }
      hand.push(deck.pop());
    }
    players[i].hand = hand;
    players[i].unoCalled = false;
  }

  // Draw top card for discard (cannot be wild +4)
  let topCard = null;
  while (deck.length) {
    const card = deck.pop();
    if (card === "wild +4") {
      deck.unshift(card);
      continue;
    }
    topCard = card;
    break;
  }
  if (!topCard) {
    alert("Failed to draw starting card");
    return;
  }

  // Determine current color based on top card
  let currentColor = null;
  if (topCard.startsWith("wild")) currentColor = null;
  else currentColor = topCard.split(" ")[0];

  await roomRef.update({
    players,
    deck,
    discardPile: [topCard],
    currentPlayer: 0,
    currentColor,
    gameStarted: true,
    direction: 1,
    pendingDraw: 0,
    pendingSkip: false,
    logs: [`Game started. Top card: ${topCard}`],
    chat: [],
  });
});

// Restart game (creator only)
restartGameBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();
  if (!data.gameStarted) return alert("Game is not started");

  if (playerName !== creatorName) return alert("Only creator can restart");

  const deck = createDeck();
  const players = data.players.map(p => ({ name: p.name, hand: [], unoCalled: false }));

  await roomRef.update({
    players,
    deck,
    discardPile: [],
    currentPlayer: 0,
    currentColor: null,
    gameStarted: false,
    direction: 1,
    pendingDraw: 0,
    pendingSkip: false,
    logs: [],
    chat: [],
  });

  alert("Game reset. Start again.");
});

// Draw card logic
drawCardBtn.addEventListener("click", async () => {
  if (!roomRef) return;

  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();

  if (!data.gameStarted) return alert("Game not started");
  if (data.currentPlayer !== playerIndex) return alert("Not your turn");
  if (data.pendingDraw > 0) return alert("Must respond to pending draw with a valid card or skip");

  let deck = [...data.deck];
  const players = [...data.players];
  let hand = players[playerIndex].hand;

  if (deck.length === 0) {
    // reshuffle discard except top card
    const discard = [...data.discardPile];
    const top = discard.pop();
    deck = shuffle(discard);
    await roomRef.update({ deck, discardPile: [top] });
  }

  // Draw 1 card
  const cardDrawn = deck.pop();
  hand = hand.concat(cardDrawn);

  players[playerIndex].hand = hand;

  // Logs
  const newLogs = [...data.logs];
  newLogs.push(`${playerName} drew a card`);

  // Update Firestore, but do NOT skip turn
  await roomRef.update({
    players,
    deck,
    logs: newLogs,
  });
});

// Call UNO button
callUnoBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();
  const me = data.players[playerIndex];

  if (data.currentPlayer !== playerIndex) return alert("Not your turn");
  if (me.hand.length !== 1) return alert("You must have exactly 1 card to call UNO");
  if (me.unoCalled) return alert("UNO already called");

  const players = [...data.players];
  players[playerIndex].unoCalled = true;

  const newLogs = [...data.logs];
  newLogs.push(`${playerName} called UNO!`);

  await roomRef.update({
    players,
    logs: newLogs,
  });
});

// Chat send button
sendChatBtn.addEventListener("click", async () => {
  if (!roomRef) return;

  const msg = chatInput.value.trim();
  if (!msg) return;

  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();

  const newChat = [...data.chat];
  newChat.push({ name: playerName, message: msg });

  await roomRef.update({
    chat: newChat,
  });

  chatInput.value = "";
});

function updateLog(container, entries) {
  container.innerHTML = "";
  entries.forEach(entry => {
    const p = document.createElement("p");
    if (typeof entry === "string") p.textContent = entry;
    else p.textContent = `${entry.name}: ${entry.message}`;
    container.appendChild(p);
  });

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function shuffle(array) {
  // Fisher-Yates shuffle
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}


