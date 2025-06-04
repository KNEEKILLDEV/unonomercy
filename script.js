// script.js
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

// GLOBALS
let roomRef = null;
let playerName = "";
let playerId = "";
let currentPlayer = "";
let maxPlayers = 4;
let roomCode = "";
let isRoomCreator = false;
let unsubscribeSnapshot = null;

// DOM Elements
const lobby = document.getElementById("lobby");
const gameArea = document.getElementById("gameArea");
const createRoomForm = document.getElementById("createRoomForm");
const joinRoomForm = document.getElementById("joinRoomForm");
const playerHand = document.getElementById("playerHand");
const topCard = document.getElementById("topCard");
const currentColorDisplay = document.getElementById("currentColorDisplay");
const opponentsList = document.getElementById("opponentsList");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const yourNameDisplay = document.getElementById("yourNameDisplay");
const currentTurnDisplay = document.getElementById("currentTurnDisplay");
const playerCountDisplay = document.getElementById("playerCountDisplay");
const maxPlayersDisplay = document.getElementById("maxPlayersDisplay");
const drawCardBtn = document.getElementById("drawCardBtn");
const callUnoBtn = document.getElementById("callUnoBtn");
const startGameBtn = document.getElementById("startGameBtn");
const restartGameBtn = document.getElementById("restartGameBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const chatLog = document.getElementById("chatLog");
const activityLog = document.getElementById("activityLog");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const colorModal = document.getElementById("colorModal");
const closeModalBtn = document.getElementById("closeModalBtn");

// HELPER FUNCTIONS
function logActivity(message) {
  const p = document.createElement("p");
  p.textContent = message;
  activityLog.appendChild(p);
  activityLog.scrollTop = activityLog.scrollHeight;
}

function updateChat(message) {
  const p = document.createElement("p");
  p.textContent = message;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateUI(roomData) {
  // TODO: fill in with logic to update UI like topCard, player hand, etc.
}

// ROOM CREATION
createRoomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  playerName = document.getElementById("createName").value.trim();
  maxPlayers = parseInt(document.getElementById("maxPlayers").value);
  playerId = generateId();
  roomCode = generateRoomCode();
  isRoomCreator = true;

  const roomDoc = db.collection("rooms").doc(roomCode);
  await roomDoc.set({
    creator: playerId,
    maxPlayers: maxPlayers,
    players: [{ id: playerId, name: playerName, hand: [] }],
    currentTurn: playerId,
    gameStarted: false,
    topCard: null,
    currentColor: null,
    direction: 1,
    chat: [],
    activity: [],
    deck: generateShuffledDeck(),
    discardPile: []
  });

  roomRef = roomDoc;
  setupGameListeners();
  switchToGameUI();
});

// JOIN ROOM
joinRoomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  playerName = document.getElementById("joinName").value.trim();
  roomCode = document.getElementById("joinRoomCode").value.trim().toUpperCase();
  playerId = generateId();
  isRoomCreator = false;

  const roomDoc = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomDoc.get();
  if (!roomSnap.exists) {
    alert("Room does not exist.");
    return;
  }

  const data = roomSnap.data();
  if (data.players.find(p => p.name === playerName)) {
    alert("Name already taken in this room.");
    return;
  }
  if (data.players.length >= data.maxPlayers) {
    alert("Room is full.");
    return;
  }

  await roomDoc.update({
    players: firebase.firestore.FieldValue.arrayUnion({
      id: playerId,
      name: playerName,
      hand: []
    })
  });

  roomRef = roomDoc;
  setupGameListeners();
  switchToGameUI();
});

// UI & Game Setup
function switchToGameUI() {
  lobby.classList.add("hidden");
  gameArea.classList.remove("hidden");
  roomCodeDisplay.textContent = roomCode;
  yourNameDisplay.textContent = playerName;
  maxPlayersDisplay.textContent = maxPlayers;
  startGameBtn.disabled = !isRoomCreator;
  restartGameBtn.disabled = !isRoomCreator;
}

function generateId() {
  return '_' + Math.random().toString(36).substr(2, 9);
}

function generateRoomCode() {
  return Math.random().toString(36).substr(2, 4).toUpperCase();
}

function generateShuffledDeck() {
  const colors = ["red", "green", "blue", "yellow"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "+2"];
  let deck = [];

  colors.forEach(color => {
    values.forEach(value => {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "+4" });
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Listeners
function setupGameListeners() {
  unsubscribeSnapshot = roomRef.onSnapshot((doc) => {
    const data = doc.data();
    if (!data) return;
    updateUI(data);
  });
}

// Game Buttons
startGameBtn.addEventListener("click", async () => {
  const doc = await roomRef.get();
  const data = doc.data();
  if (!isRoomCreator || data.gameStarted) return;

  const deck = [...data.deck];
  const players = data.players.map(player => {
    const hand = deck.splice(0, 7);
    return { ...player, hand };
  });

  let topCard;
  do {
    topCard = deck.shift();
  } while (topCard.color === "wild" && (topCard.value === "+4" || topCard.value === "wild"));

  await roomRef.update({
    gameStarted: true,
    players,
    deck,
    discardPile: [topCard],
    topCard,
    currentColor: topCard.color
  });
});

restartGameBtn.addEventListener("click", async () => {
  if (!isRoomCreator) return;
  const doc = await roomRef.get();
  const data = doc.data();
  const deck = generateShuffledDeck();
  await roomRef.update({
    gameStarted: false,
    deck,
    discardPile: [],
    topCard: null,
    currentColor: null,
    players: data.players.map(p => ({ id: p.id, name: p.name, hand: [] }))
  });
});

leaveRoomBtn.addEventListener("click", async () => {
  if (!roomRef) return;
  const doc = await roomRef.get();
  const data = doc.data();
  const updatedPlayers = data.players.filter(p => p.id !== playerId);
  await roomRef.update({ players: updatedPlayers });
  unsubscribeSnapshot && unsubscribeSnapshot();
  location.reload();
});

drawCardBtn.addEventListener("click", async () => {
  const doc = await roomRef.get();
  const data = doc.data();
  const deck = [...data.deck];
  const players = [...data.players];
  const playerIndex = players.findIndex(p => p.id === playerId);

  const card = deck.shift();
  players[playerIndex].hand.push(card);
  await roomRef.update({ players, deck });
});

callUnoBtn.addEventListener("click", () => {
  logActivity(`${playerName} calls UNO!`);
});

sendChatBtn.addEventListener("click", async () => {
  const text = chatInput.value.trim();
  if (text === "") return;
  const doc = await roomRef.get();
  const data = doc.data();
  const chat = [...data.chat, `${playerName}: ${text}`];
  await roomRef.update({ chat });
  chatInput.value = "";
});

// Modal Color Selection (Hook logic in UI update)
closeModalBtn.addEventListener("click", () => {
  colorModal.classList.add("hidden");
});
document.querySelectorAll(".color-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const color = btn.getAttribute("data-color");
    colorModal.classList.add("hidden");
    await roomRef.update({ currentColor: color });
  });
});
