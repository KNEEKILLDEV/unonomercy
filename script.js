// script.js

// ---------------- Firebase Initialization ----------------
// (Use your own config here)
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  databaseURL:
    "https://unonomercy-66ba7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.firebasedestorage.app",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let roomRef = db.collection("rooms").doc("room1"); // placeholder

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
const chatInput    = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatLog");
const activityLog  = document.getElementById("activityLog");
const playerHand   = document.getElementById("playerHand");
const opponents    = document.getElementById("opponents");
const discardDiv   = document.getElementById("discardPile");
const drawCardBtn  = document.getElementById("drawCardBtn");
const unoBtn       = document.getElementById("unoBtn");
const restartBtn   = document.getElementById("restartBtn");
const createBtn    = document.getElementById("createRoomBtn");
const joinBtn      = document.getElementById("joinRoomBtn");
const startBtn     = document.getElementById("startGameBtn");

const nameCreate   = document.getElementById("playerNameInput");
const nameJoin     = document.getElementById("playerNameInputJoin");
const roomInput    = document.getElementById("roomCodeInput");
const maxPlayers   = document.getElementById("maxPlayersInput");

const createSection = document.getElementById("create-section");
const joinSection   = document.getElementById("join-section");

// ---------------- Helper Functions ----------------

// Fisher-Yates shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Build a standard UNO deck
function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const values = [
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "skip", "reverse", "+2"
  ];
  let newDeck = [];
  for (let color of colors) {
    newDeck.push({ color, value: "0" });
    for (let i = 1; i <= 9; i++) {
      newDeck.push({ color, value: i.toString() });
      newDeck.push({ color, value: i.toString() });
    }
    for (let special of ["skip", "reverse", "+2"]) {
      newDeck.push({ color, value: special });
      newDeck.push({ color, value: special });
    }
  }
  for (let i = 0; i < 4; i++) {
    newDeck.push({ color: "wild", value: "wild" });
    newDeck.push({ color: "wild", value: "+4" });
  }
  shuffle(newDeck);
  return newDeck;
}

// Render the current player's hand
function renderHand() {
  playerHand.innerHTML = "";

  hand.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = `card ${card.color} ${card.value}`;
    cardEl.textContent =
      card.value === "+4"
        ? "+4"
        : card.value === "wild"
        ? "Wild"
        : card.value;

    // Only attach onclick if it's truly this player's turn
    if (canPlayCard) {
      cardEl.style.cursor = "pointer";
      cardEl.onclick = () => tryPlayCard(card);
    } else {
      cardEl.style.cursor = "not-allowed";
      cardEl.onclick = null;
    }

    playerHand.appendChild(cardEl);
  });
}

// Render all opponents
function renderOpponents() {
  opponents.innerHTML = "";
  players
    .filter(p => p.id !== playerId)
    .forEach(p => {
      const div = document.createElement("div");
      div.className = "player";
      if (p.id === roomData.currentPlayer) div.classList.add("current");
      div.innerHTML = `
        <div class="player-name">${p.name}</div>
        <div>${p.handCount || 0} cards</div>
      `;
      opponents.appendChild(div);
    });
}

// Render the top of the discard pile
function renderDiscardPile() {
  discardDiv.innerHTML = "";
  if (discardPile.length === 0) return;
  const top = discardPile[discardPile.length - 1];
  const el = document.createElement("div");
  el.className = `card ${top.color} ${top.value}`;
  el.textContent =
    top.value === "+4" ? "+4" : top.value === "wild" ? "Wild" : top.value;
  discardDiv.appendChild(el);
}

// Append a chat message
function appendChatMessage(sender, text) {
  const msg = document.createElement("div");
  msg.textContent = `${sender}: ${text}`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Append an activity log entry
function appendActivityLog(message) {
  const entry = document.createElement("div");
  entry.textContent = message;
  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;
}

// Decide if a card is legal to play
function canPlay(card) {
  if (stackCount > 0) {
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
  return (
    card.color === currentColor ||
    card.value === currentValue ||
    card.color === "wild"
  );
}

// Attempt to play a card
function tryPlayCard(card) {
  if (!canPlayCard) return;
  if (!canPlay(card)) return alert("Cannot play this card now!");

  if (card.color === "wild") {
    showColorPicker(card);
  } else {
    playCard(card, null);
  }
}

// Create and show the wild‐color modal with a red “×”
function showColorPicker(card) {
  const overlay = document.createElement("div");
  overlay.className = "modal";

  overlay.innerHTML = `
    <div class="modal-content">
      <span class="modal-close">&times;</span>
      <h3>Select a Color</h3>
      <div class="color-options">
        <button class="color-btn" data-color="red"    style="background:red;"></button>
        <button class="color-btn" data-color="green"  style="background:green;"></button>
        <button class="color-btn" data-color="blue"   style="background:blue;"></button>
        <button class="color-btn" data-color="yellow" style="background:yellow;"></button>
      </div>
    </div>
  `;

  // Make the close (×) button red and top-right
  overlay.querySelector(".modal-close").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  // Each color button picks that color
  overlay.querySelectorAll(".color-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const chosenColor = btn.dataset.color;
      playCard(card, chosenColor);
      document.body.removeChild(overlay);
    });
  });

  document.body.appendChild(overlay);
}

// Send the chosen card into Firestore via a transaction
function playCard(card, chosenColor) {
  roomRef.transaction(room => {
    if (!room) return;
    if (room.currentPlayer !== playerId) return;

    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;

    if (room.stackCount > 0) {
      if (
        room.stackType === "+2" &&
        !(card.value === "+2" && (card.color === room.currentColor || card.color === "wild"))
      ) return;
      if (
        room.stackType === "+4" &&
        !(card.value === "+4" && card.color === "wild")
      ) return;
    } else {
      if (
        !(card.color === room.currentColor ||
          card.value === room.currentValue ||
          card.color === "wild")
      ) return;
    }

    const playerHandArr = room.players[idx].hand;
    const cardIdx = playerHandArr.findIndex(
      c => c.color === card.color && c.value === card.value
    );
    if (cardIdx === -1) return;

    playerHandArr.splice(cardIdx, 1);
    room.players[idx].handCount = playerHandArr.length;

    if (!room.discardPileBackup) room.discardPileBackup = [];
    room.discardPileBackup.push(...room.discardPile.slice(0, -1));
    room.discardPile = room.discardPile.slice(-1);
    room.discardPile.push({
      color: card.color,
      value: card.value,
      chosenColor: chosenColor || null,
    });

    room.currentColor = card.color === "wild" ? chosenColor : card.color;
    room.currentValue = card.value;

    if (room.players[idx].unoCalled) room.players[idx].unoCalled = false;

    if (card.value === "reverse") room.direction *= -1;

    if (card.value === "+2" || card.value === "+4") {
      room.stackCount  = (room.stackCount || 0) + (card.value === "+2" ? 2 : 4);
      room.stackType   = card.value;
    } else {
      room.stackCount  = 0;
      room.stackType   = null;
    }

    if (room.players[idx].hand.length === 0) {
      room.winner        = playerId;
      room.currentPlayer = null;
      room.status        = "ended";
    } else {
      let nextIndex = (room.seatOrder.indexOf(playerId) +
                       room.direction +
                       room.seatOrder.length) %
                      room.seatOrder.length;
      if (card.value === "skip") {
        nextIndex = (nextIndex + room.direction + room.seatOrder.length) %
                    room.seatOrder.length;
      }
      room.currentPlayer = room.seatOrder[nextIndex];
    }

    return room;
  });
}

// Draw a card instead of playing
function drawCard() {
  if (!canPlayCard) return alert("Not your turn to draw!");

  roomRef.transaction(room => {
    if (!room) return;
    if (room.currentPlayer !== playerId) return;

    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;

    if (!room.deck || room.deck.length === 0) {
      if (room.discardPileBackup && room.discardPileBackup.length > 0) {
        room.deck = room.discardPileBackup;
        shuffle(room.deck);
        room.discardPileBackup = [];
      } else {
        return;
      }
    }

    const card = room.deck.pop();
    room.players[idx].hand.push(card);
    room.players[idx].handCount = room.players[idx].hand.length;

    let nextIndex = (room.seatOrder.indexOf(playerId) +
                     room.direction +
                     room.seatOrder.length) %
                    room.seatOrder.length;
    room.currentPlayer = room.seatOrder[nextIndex];

    if (room.stackCount > 0) {
      room.stackCount = 0;
      room.stackType  = null;
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
    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;
    if (room.players[idx].hand.length !== 1)
      return alert("You need exactly one card to call UNO!");
    room.players[idx].unoCalled = true;
    return room;
  });
}

// Send a chat message
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
  roomRef.collection("chat")
    .orderBy("timestamp")
    .limit(200)
    .onSnapshot(snapshot => {
      chatMessages.innerHTML = "";
      snapshot.forEach(doc => {
        const { sender, message } = doc.data();
        appendChatMessage(sender, message);
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

// Log an activity entry
function logActivity(message) {
  const logRef = roomRef.collection("activityLog");
  logRef.add({
    message,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Listen for activity log updates
function listenActivityLog() {
  roomRef.collection("activityLog")
    .orderBy("timestamp")
    .limit(200)
    .onSnapshot(snapshot => {
      activityLog.innerHTML = "";
      snapshot.forEach(doc => appendActivityLog(doc.data().message));
      if (snapshot.size > 200) {
        let batch = db.batch();
        snapshot.docs
          .slice(0, snapshot.size - 200)
          .forEach(doc => batch.delete(doc.ref));
        batch.commit();
      }
    });
}

// Listen to room‐level changes
function listenRoom() {
  roomRef.onSnapshot(doc => {
    roomData = doc.data();
    if (!roomData) return;

    // Immediately hide “Create” & “Join” sections
    createSection.classList.add("hidden");
    joinSection.classList.add("hidden");
    document.getElementById("game-area").classList.remove("hidden");

    document.getElementById("roomCodeDisplay").textContent = doc.id;
    document.getElementById("playerNameDisplay").textContent = playerName;
    document.getElementById("currentPlayerDisplay").textContent =
      roomData.currentPlayer === playerId ? "You" : roomData.currentPlayer;

    document.getElementById("playerCountDisplay").textContent = (roomData.players || []).length;
    document.getElementById("maxPlayersDisplay").textContent   = roomData.maxPlayers || 0;

    players     = roomData.players || [];
    seatOrder   = roomData.seatOrder || [];
    direction   = roomData.direction || 1;
    discardPile = roomData.discardPile || [];
    deck        = roomData.deck || [];
    currentColor = roomData.currentColor;
    currentValue = roomData.currentValue;

    const me = players.find(p => p.id === playerId);
    if (me) {
      hand      = me.hand || [];
      unoCalled = me.unoCalled || false;
    } else {
      hand = [];
    }

    canPlayCard = (roomData.currentPlayer === playerId && roomData.status === "started");

    renderHand();
    renderOpponents();
    renderDiscardPile();

    // Only the creator (roomData.creatorId) may see Start Game if status === "waiting"
    if (roomData.status === "waiting" && playerId === roomData.creatorId) {
      startBtn.classList.remove("hidden");
    } else {
      startBtn.classList.add("hidden");
    }

    // Once started, always hide the button
    if (roomData.status === "started") {
      startBtn.classList.add("hidden");
    }

    drawCardBtn.disabled = !canPlayCard;
    unoBtn.disabled      = !canPlayCard || unoCalled || hand.length !== 2;

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
  playerName = nameCreate.value.trim();
  if (!playerName) return alert("Enter your name");

  let maxInput = parseInt(maxPlayers.value, 10);
  if (isNaN(maxInput)) maxInput = 10;
  if (maxInput < 2 || maxInput > 10) {
    return alert("Max players must be between 2 and 10");
  }

  const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  playerId = Math.random().toString(36).substring(2, 15);

  await db.collection("rooms").doc(newRoomId).set({
    creatorId: playerId,         // ❗ Store the creator’s ID
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
  playerName = nameJoin.value.trim();
  if (!playerName) return alert("Enter your name");

  const joinRoomId = roomInput.value.trim().toUpperCase();
  if (!joinRoomId) return alert("Enter room code");

  roomRef = db.collection("rooms").doc(joinRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return alert("Room does not exist!");

  roomData = roomDoc.data();
  const maxAllowed = roomData.maxPlayers || 10;
  if ((roomData.players || []).length >= maxAllowed) {
    return alert("Room is full!");
  }

  if (!roomData.players.some(p => p.name === playerName)) {
    playerId = Math.random().toString(36).substring(2, 15);
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
    const existing = roomData.players.find(p => p.name === playerName);
    playerId = existing.id;
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

  let newDeck = createDeck();

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

  let firstCard;
  do {
    firstCard = newDeck.shift();
  } while (firstCard.color === "wild" || firstCard.value === "+4");

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
createBtn.onclick     = createRoom;
joinBtn.onclick       = joinRoom;
startBtn.onclick      = startGame;
restartBtn.onclick    = () => {
  if (confirm("Restart game? This will reset the room.")) {
    roomRef.delete();
    document.getElementById("game-area").classList.add("hidden");
    createSection.classList.remove("hidden");
    joinSection.classList.remove("hidden");
  }
};
