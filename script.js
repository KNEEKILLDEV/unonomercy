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
let roomRef = null;
let roomListener = null;
let playerName = "";
let playerIndex = -1;
let isCreator = false;
let roomId = "";
let gameState = null;

// DOM Elements
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const startGameBtn = document.getElementById("startGameBtn");
const restartGameBtn = document.getElementById("restartGameBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const drawCardBtn = document.getElementById("drawCardBtn");
const callUnoBtn = document.getElementById("callUnoBtn");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

const roomCodeText = document.getElementById("roomCodeText");
const yourNameText = document.getElementById("yourNameText");
const currentPlayerText = document.getElementById("currentPlayerText");
const playerCountText = document.getElementById("playerCountText");
const yourHand = document.getElementById("yourHand");
const opponentsArea = document.getElementById("opponentsArea");
const topCard = document.getElementById("topCard");
const currentColorText = document.getElementById("currentColorText");
const activityLog = document.getElementById("activityLog");
const chatLog = document.getElementById("chatLog");
const colorModal = document.getElementById("colorModal");
const closeModalBtn = document.getElementById("closeModalBtn");

// Create Room
createRoomBtn.onclick = async () => {
  playerName = document.getElementById("createName").value.trim();
  const maxPlayers = parseInt(document.getElementById("maxPlayers").value.trim());
  if (!playerName || isNaN(maxPlayers) || maxPlayers < 2) return alert("Invalid input");

  roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  roomRef = db.collection("rooms").doc(roomId);

  const roomData = {
    players: [{ name: playerName, hand: [], unoCalled: false }],
    creator: playerName,
    maxPlayers,
    gameStarted: false,
    deck: [],
    discardPile: [],
    currentPlayer: 0,
    currentColor: "",
    direction: 1,
    chat: [],
    logs: [],
  };

  await roomRef.set(roomData);
  isCreator = true;
  playerIndex = 0;
  joinRoom();
};

// Join Room
joinRoomBtn.onclick = async () => {
  playerName = document.getElementById("joinName").value.trim();
  roomId = document.getElementById("joinRoomCode").value.trim().toUpperCase();
  if (!playerName || !roomId) return alert("Invalid input");

  roomRef = db.collection("rooms").doc(roomId);
  const doc = await roomRef.get();
  if (!doc.exists) return alert("Room does not exist");

  const data = doc.data();
  if (data.players.length >= data.maxPlayers) return alert("Room full");
  if (data.gameStarted) return alert("Game already started");

  const players = data.players;
  players.push({ name: playerName, hand: [], unoCalled: false });
  await roomRef.update({ players });

  playerIndex = players.length - 1;
  isCreator = false;
  joinRoom();
};

function joinRoom() {
  document.getElementById("roomForms").classList.add("hidden");
  document.getElementById("gameArea").classList.remove("hidden");
  roomCodeText.textContent = roomId;
  yourNameText.textContent = playerName;

  if (roomListener) roomListener();
  roomListener = roomRef.onSnapshot(snapshot => {
    if (!snapshot.exists) return;
    gameState = snapshot.data();
    updateUI();
  });
}

function updateUI() {
  if (!gameState) return;

  currentPlayerText.textContent = gameState.players[gameState.currentPlayer]?.name || "";
  playerCountText.textContent = `${gameState.players.length}/${gameState.maxPlayers}`;
  currentColorText.textContent = gameState.currentColor;

  // Only creator sees start
  startGameBtn.style.display = isCreator && !gameState.gameStarted ? "inline-block" : "none";

  updateHand();
  updateOpponents();
  updateDiscard();
  updateLogs();
  updateChat();
}

function updateHand() {
  yourHand.innerHTML = "";
  const hand = gameState.players[playerIndex].hand;
  hand.forEach((card, idx) => {
    const div = document.createElement("div");
    div.className = `card ${card.color}`;
    div.textContent = card.value;
    div.onclick = () => playCard(card, idx);
    yourHand.appendChild(div);
  });
}

function updateOpponents() {
  opponentsArea.innerHTML = "";
  gameState.players.forEach((p, idx) => {
    if (idx === playerIndex) return;
    const div = document.createElement("div");
    div.innerHTML = `<b>${p.name}</b><br>${p.hand.length} cards`;
    opponentsArea.appendChild(div);
  });
}

function updateDiscard() {
  const top = gameState.discardPile[gameState.discardPile.length - 1];
  if (top) {
    topCard.className = `card ${gameState.currentColor}`;
    topCard.textContent = top.value;
  } else {
    topCard.textContent = "";
  }
}

function updateLogs() {
  activityLog.innerHTML = "";
  (gameState.logs || []).slice(-10).forEach(log => {
    const div = document.createElement("div");
    div.textContent = log;
    activityLog.appendChild(div);
  });
}

function updateChat() {
  chatLog.innerHTML = "";
  (gameState.chat || []).slice(-20).forEach(msg => {
    const div = document.createElement("div");
    div.textContent = msg;
    chatLog.appendChild(div);
  });
}

// Start Game
startGameBtn.onclick = async () => {
  if (!isCreator || gameState.gameStarted) return;

  const fullDeck = [];
  const colors = ["red", "yellow", "green", "blue"];
  colors.forEach(color => {
    for (let i = 0; i <= 9; i++) fullDeck.push({ color, value: i });
    ["Skip", "Reverse", "+2"].forEach(action => fullDeck.push({ color, value: action }));
  });
  for (let i = 0; i < 4; i++) {
    fullDeck.push({ color: "wild", value: "Wild" });
    fullDeck.push({ color: "wild", value: "+4" });
  }

  shuffle(fullDeck);
  const players = gameState.players.map(p => ({ ...p, hand: fullDeck.splice(0, 7) }));
  const discardPile = [fullDeck.pop()];
  const currentColor = discardPile[0].color;

  await roomRef.update({
    gameStarted: true,
    players,
    deck: fullDeck,
    discardPile,
    currentColor,
    logs: firebase.firestore.FieldValue.arrayUnion("Game started.")
  });
};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function playCard(card, idx) {
  if (!gameState.gameStarted || gameState.currentPlayer !== playerIndex) return;
  const top = gameState.discardPile.at(-1);
  const valid =
    card.color === gameState.currentColor ||
    card.value === top.value ||
    card.color === "wild";

  if (!valid) return;

  const player = gameState.players[playerIndex];
  const newHand = [...player.hand];
  newHand.splice(idx, 1);
  const newDiscard = [...gameState.discardPile, card];

  let updates = {
    [`players.${playerIndex}.hand`]: newHand,
    discardPile: newDiscard,
    logs: firebase.firestore.FieldValue.arrayUnion(`${player.name} played ${card.value}`)
  };

  if (card.color === "wild") {
    showColorModal(color => {
      updates.currentColor = color;
      finalizeCardPlay(card, updates);
    });
  } else {
    updates.currentColor = card.color;
    finalizeCardPlay(card, updates);
  }
}

function finalizeCardPlay(card, updates) {
  let next = (gameState.currentPlayer + gameState.direction + gameState.players.length) % gameState.players.length;
  if (card.value === "Reverse") gameState.direction *= -1;
  else if (card.value === "Skip") next = (next + 1) % gameState.players.length;
  else if (card.value === "+2") {
    const deck = [...gameState.deck];
    const cards = [deck.pop(), deck.pop()];
    updates[`players.${next}.hand`] = [...gameState.players[next].hand, ...cards];
    updates.deck = deck;
  }
  else if (card.value === "+4") {
    const deck = [...gameState.deck];
    const cards = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    updates[`players.${next}.hand`] = [...gameState.players[next].hand, ...cards];
    updates.deck = deck;
  }

  updates.currentPlayer = next;
  roomRef.update(updates);
}

function showColorModal(callback) {
  colorModal.style.display = "flex";
  const buttons = document.querySelectorAll(".color-btn");
  buttons.forEach(btn => {
    btn.onclick = () => {
      colorModal.style.display = "none";
      callback(btn.dataset.color);
    };
  });
}

closeModalBtn.onclick = () => {
  colorModal.style.display = "none";
};

// Draw Card
drawCardBtn.onclick = async () => {
  if (gameState.currentPlayer !== playerIndex) return;
  const deck = [...gameState.deck];
  const card = deck.pop();
  const player = gameState.players[playerIndex];
  const newHand = [...player.hand, card];
  await roomRef.update({
    [`players.${playerIndex}.hand`]: newHand,
    deck,
    currentPlayer: (gameState.currentPlayer + 1) % gameState.players.length,
    logs: firebase.firestore.FieldValue.arrayUnion(`${player.name} drew a card.`)
  });
};

// Chat
sendChatBtn.onclick = sendChat;
chatInput.onkeydown = e => e.key === "Enter" && sendChat();

function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatInput.value = "";
  roomRef.update({
    chat: firebase.firestore.FieldValue.arrayUnion(`${playerName}: ${msg}`)
  });
}

// Restart Game
restartGameBtn.onclick = async () => {
  if (!isCreator) return;
  await roomRef.update({
    gameStarted: false,
    deck: [],
    discardPile: [],
    currentPlayer: 0,
    direction: 1,
    currentColor: "",
    logs: firebase.firestore.FieldValue.arrayUnion("Game reset.")
  });
};

// Leave Room
leaveRoomBtn.onclick = async () => {
  const players = gameState.players.filter(p => p.name !== playerName);
  await roomRef.update({ players });
  location.reload();
};
