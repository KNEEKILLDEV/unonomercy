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

//
// HTML Elements
//
const lobby = document.getElementById("lobby");
const createRoomForm = document.getElementById("createRoomForm");
const createNameInput = document.getElementById("createName");
const maxPlayersInput = document.getElementById("maxPlayers");
const joinRoomForm = document.getElementById("joinRoomForm");
const joinNameInput = document.getElementById("joinName");
const roomCodeInput = document.getElementById("roomCode");

const gameArea = document.getElementById("gameArea");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const yourNameDisplay = document.getElementById("yourNameDisplay");
const creatorDisplay = document.getElementById("creatorDisplay");
const playerCountSpan = document.getElementById("playerCountSpan");
const maxPlayersDisplay = document.getElementById("maxPlayersDisplay");
const currentPlayerDisplay = document.getElementById("currentPlayerDisplay");
const currentColorSpan = document.getElementById("currentColorSpan");
const startGameBtn = document.getElementById("startGameBtn");
const restartGameBtn = document.getElementById("restartGameBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const opponentList = document.getElementById("opponentList");
const yourHandDiv = document.getElementById("yourHand");

const drawCardBtn = document.getElementById("drawCardBtn");
const callUnoBtn = document.getElementById("callUnoBtn");

const discardPileContainer = document.getElementById("topCard");

const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

const activityLog = document.getElementById("activityLog");

const colorModal = document.getElementById("colorModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const colorButtonsContainer = document.getElementById("colorButtonsContainer");

//
// Variables
//
let roomRef = null;
let unsubscribeRoom = null;
let unsubscribePlayers = null;
let roomCode = "";
let playerName = "";
let playerIndex = -1;
let maxPlayers = 0;
let creatorName = "";
let gameStarted = false;

//
// Utility functions
//
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function updateLog(container, entries) {
  container.innerHTML = "";
  entries.forEach((entry) => {
    const p = document.createElement("p");
    if (typeof entry === "string") p.textContent = entry;
    else p.textContent = `${entry.name}: ${entry.message}`;
    container.appendChild(p);
  });
  container.scrollTop = container.scrollHeight;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function cardToText(card) {
  if (!card) return "";
  if (card.type === "wild") return "Wild";
  if (card.type === "wild_draw4") return "Wild +4";
  return card.color.charAt(0).toUpperCase() + card.color.slice(1) + " " + card.value;
}

function createCardElement(card, clickable = false) {
  const div = document.createElement("div");
  div.classList.add("card");
  if (card.type === "wild" || card.type === "wild_draw4") {
    div.classList.add("wild");
  } else {
    div.classList.add(card.color);
  }
  div.textContent = cardToText(card);
  if (clickable) div.style.cursor = "pointer";
  return div;
}

//
// Room join/create logic
//

// Create room
createRoomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  playerName = createNameInput.value.trim();
  maxPlayers = parseInt(maxPlayersInput.value);
  if (!playerName || maxPlayers < 2 || maxPlayers > 10) {
    alert("Please enter valid name and max players between 2 and 10.");
    return;
  }
  roomCode = generateRoomCode();
  roomRef = db.collection("rooms").doc(roomCode);

  const roomData = {
    code: roomCode,
    creator: playerName,
    maxPlayers: maxPlayers,
    players: [
      {
        name: playerName,
        hand: [],
        unoCalled: false,
        hasLeft: false,
      },
    ],
    currentPlayer: 0,
    direction: 1,
    currentColor: null,
    discardPile: [],
    deck: [],
    gameStarted: false,
    chat: [],
    logs: [`Room created by ${playerName}`],
  };

  await roomRef.set(roomData);
  setupGame(roomData);
  subscribeToRoom();
  showGameArea();
});

// Join room
joinRoomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  playerName = joinNameInput.value.trim();
  roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!playerName || !roomCode) {
    alert("Enter valid name and room code.");
    return;
  }
  roomRef = db.collection("rooms").doc(roomCode);
  const doc = await roomRef.get();
  if (!doc.exists) {
    alert("Room not found.");
    return;
  }
  const roomData = doc.data();
  if (roomData.gameStarted) {
    alert("Game already started.");
    return;
  }
  if (roomData.players.find((p) => p.name === playerName && !p.hasLeft)) {
    alert("Name already taken in this room.");
    return;
  }
  // Check max players limit and available spots
  const activePlayers = roomData.players.filter((p) => !p.hasLeft);
  if (activePlayers.length >= roomData.maxPlayers) {
    alert("Room full.");
    return;
  }

  // Add player or reuse a slot from a player who left
  let players = [...roomData.players];
  // Find first left player slot
  let reusedIndex = players.findIndex((p) => p.hasLeft);
  if (reusedIndex >= 0) {
    players[reusedIndex] = {
      name: playerName,
      hand: [],
      unoCalled: false,
      hasLeft: false,
    };
  } else {
    players.push({
      name: playerName,
      hand: [],
      unoCalled: false,
      hasLeft: false,
    });
  }

  await roomRef.update({ players });
  setupGame({ ...roomData, players });
  subscribeToRoom();
  showGameArea();
});

//
// Show/hide UI
//
function showGameArea() {
  lobby.classList.add("hidden");
  gameArea.classList.remove("hidden");
  roomCodeDisplay.textContent = roomCode;
  yourNameDisplay.textContent = playerName;
}

function hideGameArea() {
  lobby.classList.remove("hidden");
  gameArea.classList.add("hidden");
  unsubscribeRoom?.();
  roomRef = null;
  playerIndex = -1;
  playerName = "";
  roomCode = "";
  maxPlayers = 0;
  creatorName = "";
  gameStarted = false;
  opponentList.innerHTML = "";
  yourHandDiv.innerHTML = "";
  discardPileContainer.innerHTML = "";
  chatLog.innerHTML = "";
  activityLog.innerHTML = "";
}

//
// Subscribe to room updates
//
function subscribeToRoom() {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = roomRef.onSnapshot((doc) => {
    if (!doc.exists) {
      alert("Room was deleted.");
      hideGameArea();
      return;
    }
    const data = doc.data();

    maxPlayers = data.maxPlayers;
    creatorName = data.creator;
    maxPlayersDisplay.textContent = maxPlayers;
    creatorDisplay.textContent = creatorName;

    // Find player index
    playerIndex = data.players.findIndex((p) => p.name === playerName && !p.hasLeft);
    if (playerIndex === -1) {
      alert("You were removed or left the room.");
      hideGameArea();
      return;
    }

    // Update room info
    playerCountSpan.textContent = data.players.filter((p) => !p.hasLeft).length;
    currentPlayerDisplay.textContent = data.players[data.currentPlayer]?.name || "-";
    currentColorSpan.textContent = data.currentColor ? capitalize(data.currentColor) : "-";
    gameStarted = data.gameStarted;

    // Enable start button only for creator before game start
    startGameBtn.style.display = gameStarted ? "none" : playerName === creatorName ? "inline-block" : "none";
    restartGameBtn.style.display = gameStarted ? "inline-block" : "none";

    // Show chat and logs
    updateLog(chatLog, data.chat || []);
    updateLog(activityLog, data.logs || []);

    // Update opponents list (exclude self)
    opponentList.innerHTML = "";
    data.players.forEach((p, i) => {
      if (i !== playerIndex && !p.hasLeft) {
        const li = document.createElement("li");
        li.textContent = `${p.name} - Cards: ${p.hand.length}${p.unoCalled ? " (UNO!)" : ""}`;
        opponentList.appendChild(li);
      }
    });

    // Update player's hand
    yourHandDiv.innerHTML = "";
    if (gameStarted) {
      const playerHand = data.players[playerIndex]?.hand || [];
      playerHand.forEach((card, idx) => {
        const cardEl = createCardElement(card, true);
        cardEl.addEventListener("click", () => playCard(idx));
        yourHandDiv.appendChild(cardEl);
      });
    }

    // Update discard pile display with color for wild cards
    discardPileContainer.innerHTML = "";
    if (data.discardPile.length > 0) {
      const topCard = data.discardPile[data.discardPile.length - 1];
      const cardEl = createCardElement(topCard, false);
      if ((topCard.type === "wild" || topCard.type === "wild_draw4") && data.currentColor) {
        cardEl.classList.add("discard-wild");
        cardEl.classList.add(data.currentColor);
      }
      discardPileContainer.appendChild(cardEl);
    }

    // Enable or disable draw and callUNO buttons based on turn
    const isMyTurn = data.currentPlayer === playerIndex && gameStarted;
    drawCardBtn.disabled = !isMyTurn;
    callUnoBtn.disabled = !isMyTurn;

  });
}

//
// Game mechanics
//

startGameBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();

  if (playerName !== data.creator) {
    alert("Only creator can start the game.");
    return;
  }
  if (data.players.filter((p) => !p.hasLeft).length < 2) {
    alert("Need at least 2 players to start.");
    return;
  }

  if (data.gameStarted) {
    alert("Game already started.");
    return;
  }

  // Initialize deck and hands
  let deck = createDeck();
  deck = shuffle(deck);

  // Deal 7 cards per player (only active players)
  let players = [...data.players];
  const activePlayers = players.filter((p) => !p.hasLeft);

  activePlayers.forEach((p) => (p.hand = [])); // clear hands

  for (let i = 0; i < 7; i++) {
    activePlayers.forEach((player) => {
      const card = deck.pop();
      player.hand.push(card);
    });
  }

  // Replace in original players array (keep inactive players as is)
  let apIndex = 0;
  for (let i = 0; i < players.length; i++) {
    if (!players[i].hasLeft) {
      players[i].hand = activePlayers[apIndex].hand;
      players[i].unoCalled = false;
      apIndex++;
    } else {
      players[i].hand = [];
      players[i].unoCalled = false;
    }
  }

  // Place first card on discard pile (must not be wild+4 or wild)
  let firstCard;
  do {
    firstCard = deck.pop();
    deck.unshift(firstCard); // put back if invalid to bottom
    deck.splice(deck.length - 1, 1); // remove last popped card to prevent duplicates
  } while (
    firstCard.type === "wild" ||
    firstCard.type === "wild_draw4"
  );
  deck = deck.filter((c) => c !== firstCard);

  const discardPile = [firstCard];
  const currentColor = firstCard.color;

  await roomRef.update({
    deck,
    players,
    discardPile,
    currentColor,
    currentPlayer: 0,
    direction: 1,
    gameStarted: true,
    logs: [...(data.logs || []), "Game started."],
    chat: [],
  });
});

// Restart game
restartGameBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;
  const data = doc.data();
  if (playerName !== data.creator) {
    alert("Only creator can restart the game.");
    return;
  }
  // Reset hands, deck, discard, etc, like startGameBtn logic
  let deck = createDeck();
  deck = shuffle(deck);

  let players = [...data.players];
  const activePlayers = players.filter((p) => !p.hasLeft);

  activePlayers.forEach((p) => (p.hand = []));

  for (let i = 0; i < 7; i++) {
    activePlayers.forEach((player) => {
      const card = deck.pop();
      player.hand.push(card);
    });
  }

  let apIndex = 0;
  for (let i = 0; i < players.length; i++) {
    if (!players[i].hasLeft) {
      players[i].hand = activePlayers[apIndex].hand;
      players[i].unoCalled = false;
      apIndex++;
    } else {
      players[i].hand = [];
      players[i].unoCalled = false;
    }
  }

  let firstCard;
  do {
    firstCard = deck.pop();
    deck.unshift(firstCard);
    deck.splice(deck.length - 1, 1);
  } while (
    firstCard.type === "wild" ||
    firstCard.type === "wild_draw4"
  );
  deck = deck.filter((c) => c !== firstCard);

  const discardPile = [firstCard];
  const currentColor = firstCard.color;

  await roomRef.update({
    deck,
    players,
    discardPile,
    currentColor,
    currentPlayer: 0,
    direction: 1,
    gameStarted: true,
    logs: [...(data.logs || []), "Game restarted."],
    chat: [],
  });
});

// Leave room
leaveRoomBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;
  const data = doc.data();
  let players = [...data.players];
  if (playerIndex !== -1) {
    players[playerIndex].hasLeft = true;
    players[playerIndex].hand = [];
    players[playerIndex].unoCalled = false;
  }
  await roomRef.update({
    players,
    logs: [...(data.logs || []), `${playerName} left the room.`],
  });
  hideGameArea();
});

//
// Drawing card logic
//
drawCardBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;
  const data = doc.data();

  if (data.currentPlayer !== playerIndex) {
    alert("It's not your turn.");
    return;
  }

  let deck = [...data.deck];
  if (deck.length === 0) {
    // reshuffle discard pile except top card
    let discardPile = [...data.discardPile];
    let topCard = discardPile.pop();
    deck = shuffle(discardPile);
    discardPile = [topCard];
    await roomRef.update({ deck, discardPile });
  }

  let players = [...data.players];
  let card = deck.pop();
  players[playerIndex].hand.push(card);

  // After drawing a card, turn passes to next player
  let nextPlayer = getNextPlayer(data.currentPlayer, data.direction, players);
  await roomRef.update({
    deck,
    players,
    currentPlayer: nextPlayer,
    logs: [...(data.logs || []), `${playerName} drew a card.`],
  });
});

//
// Play card logic
//
async function playCard(cardIndex) {
  if (!roomRef) return;
  const doc = await roomRef.get();
  if (!doc.exists) return;
  const data = doc.data();

  if (data.currentPlayer !== playerIndex) {
    alert("It's not your turn.");
    return;
  }

  const player = data.players[playerIndex];
  const card = player.hand[cardIndex];

  if (!canPlayCard(card, data.currentColor, data.discardPile[data.discardPile.length - 1])) {
    alert("You can't play that card.");
    return;
  }

  let players = [...data.players];
  let deck = [...data.deck];
  let discardPile = [...data.discardPile];

  // Remove card from hand and add to discard pile
  players[playerIndex].hand.splice(cardIndex, 1);
  discardPile.push(card);

  let newColor = data.currentColor;
  let nextPlayer = data.currentPlayer;
  let direction = data.direction;
  let logs = [...(data.logs || [])];

  // Handle special cards
  if (card.type === "wild" || card.type === "wild_draw4") {
    // Open color picker modal
    openColorModal(async (chosenColor) => {
      newColor = chosenColor;
      logs.push(`${playerName} changed color to ${capitalize(chosenColor)}.`);

      if (card.type === "wild_draw4") {
        // next player draws 4 cards and skips turn
        nextPlayer = getNextPlayer(data.currentPlayer, direction, players);
        for (let i = 0; i < 4; i++) {
          if (deck.length === 0) deck = reshuffleDeck(deck, discardPile);
          players[nextPlayer].hand.push(deck.pop());
        }
        logs.push(`${players[nextPlayer].name} draws 4 cards and is skipped.`);
        nextPlayer = getNextPlayer(nextPlayer, direction, players);
      } else {
        nextPlayer = getNextPlayer(data.currentPlayer, direction, players);
      }

      await roomRef.update({
        players,
        discardPile,
        currentColor: newColor,
        currentPlayer: nextPlayer,
        logs,
      });
      closeColorModal();
    });
    return;
  } else if (card.type === "skip") {
    logs.push(`${playerName} played Skip. Next player is skipped.`);
    nextPlayer = getNextPlayer(data.currentPlayer, direction, players);
    nextPlayer = getNextPlayer(nextPlayer, direction, players);
  } else if (card.type === "reverse") {
    logs.push(`${playerName} played Reverse.`);
    direction = -direction;
    if (players.filter((p) => !p.hasLeft).length === 2) {
      // Reverse acts as skip if 2 players
      nextPlayer = getNextPlayer(data.currentPlayer, direction, players);
    } else {
      nextPlayer = getNextPlayer(data.currentPlayer, direction, players);
    }
  } else {
    nextPlayer = getNextPlayer(data.currentPlayer, direction, players);
  }

  await roomRef.update({
    players,
    discardPile,
    currentColor: newColor,
    currentPlayer: nextPlayer,
    direction,
    logs,
  });
}

//
// Helpers
//

function getNextPlayer(current, direction, players) {
  const count = players.length;
  let next = current;
  do {
    next = (next + direction + count) % count;
  } while (players[next].hasLeft);
  return next;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const deck = [];

  // Number cards
  colors.forEach((color) => {
    deck.push({ type: "number", color, value: 0 });
    for (let i = 1; i <= 9; i++) {
      deck.push({ type: "number", color, value: i });
      deck.push({ type: "number", color, value: i });
    }
    // Skip, Reverse, Draw2 (2 each)
    for (let i = 0; i < 2; i++) {
      deck.push({ type: "skip", color, value: null });
      deck.push({ type: "reverse", color, value: null });
      deck.push({ type: "draw2", color, value: null });
    }
  });

  // Wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ type: "wild", color: null, value: null });
    deck.push({ type: "wild_draw4", color: null, value: null });
  }

  return deck;
}

function canPlayCard(card, currentColor, topCard) {
  if (!card) return false;
  if (card.type === "wild" || card.type === "wild_draw4") return true;
  if (card.color === currentColor) return true;
  if (topCard && card.value === topCard.value) return true;
  return false;
}

function reshuffleDeck(deck, discardPile) {
  let topCard = discardPile.pop();
  let newDeck = shuffle(discardPile);
  discardPile.length = 0;
  discardPile.push(topCard);
  return newDeck;
}

//
// Color picker modal
//

function openColorModal(callback) {
  colorModal.style.display = "flex";

  function handleColorChoice(e) {
    const color = e.target.dataset.color;
    if (!color) return;
    callback(color);
    colorButtonsContainer.removeEventListener("click", handleColorChoice);
  }

  colorButtonsContainer.addEventListener("click", handleColorChoice);

  closeModalBtn.onclick = () => {
    colorModal.style.display = "none";
    colorButtonsContainer.removeEventListener("click", handleColorChoice);
  };
}

function closeColorModal() {
  colorModal.style.display = "none";
}

//
// Chat logic
//

sendChatBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const msg = chatInput.value.trim();
  if (!msg) return;

  const doc = await roomRef.get();
  if (!doc.exists) return;

  const data = doc.data();
  const newChat = [...(data.chat || []), { name: playerName, message: msg }];
  await roomRef.update({ chat: newChat });
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatBtn.click();
});

//
// Utility
//

// Fix for player rejoining to fill empty slots handled in join logic

