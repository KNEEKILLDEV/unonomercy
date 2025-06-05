// script.js

// ======================= FIREBASE CONFIG AND INITIALIZATION =======================

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

// ======================= GLOBAL VARIABLES =======================

let currentRoomId = null;
let playerId = null;
let playerName = null;
let pendingWildCard = null;
let isCreator = false;
let gameStateUnsubscribe = null;
let chatUnsubscribe = null;

// ======================= DOM ELEMENTS =======================

const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const yourNameDisplay = document.getElementById('yourNameDisplay');
const playerCountDisplay = document.getElementById('playerCountDisplay');
const maxPlayersDisplay = document.getElementById('maxPlayersDisplay');

const opponentsList = document.getElementById('opponentsList');
const discardPileEl = document.getElementById('discardPile');
const playerHand = document.getElementById('playerHand');

const drawCardBtn = document.getElementById('drawCardBtn');
const callUnoBtn = document.getElementById('callUnoBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const startGameBtn = document.getElementById('startGameBtn');
const restartGameBtn = document.getElementById('restartGameBtn');

const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

const activityLog = document.getElementById('activityLog');

const colorModal = document.getElementById('colorModal');
const colorButtons = document.querySelectorAll('.colorBtn');
const closeModalBtn = document.querySelector('.closeModalBtn');

const turnIndicator = document.getElementById('turnIndicator');

const createForm = document.getElementById('createForm');
const joinForm = document.getElementById('joinForm');
const lobbyMessage = document.getElementById('lobbyMessage');

// ======================= UTILITY FUNCTIONS =======================

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function reshuffleDiscardIntoDeck(deck, discardPile) {
  if (discardPile.length <= 1) return deck;
  const top = discardPile.pop();
  let extras = discardPile.slice();
  extras = shuffle(extras);
  discardPile.length = 0;
  discardPile.push(top);
  return extras;
}

function logActivity(message) {
  const p = document.createElement('p');
  p.textContent = message;
  activityLog.appendChild(p);
  activityLog.scrollTop = activityLog.scrollHeight;
}

function appendChatMessage({ playerName, message }) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${playerName}:</strong> ${message}`;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function showLobbyMessage(msg) {
  lobbyMessage.textContent = msg;
}

// ======================= DECK & GAME SETUP =======================

function generateDeck() {
  const colors = ['red', 'yellow', 'green', 'blue'];
  const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
  let deck = [];

  colors.forEach(color => {
    deck.push({ color, value: '0' });
    values.slice(1).forEach(val => {
      deck.push({ color, value: val });
      deck.push({ color, value: val });
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild4' });
  }

  return shuffle(deck);
}

function canPlayCard(card, topCard, currentColor) {
  return (
    card.color === 'wild' ||
    card.color === currentColor ||
    card.value === topCard.value
  );
}

// ======================= CREATE & JOIN ROOM =======================

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameVal = document.getElementById('createName').value.trim();
  const maxPlayers = parseInt(document.getElementById('maxPlayers').value, 10);
  if (!nameVal || isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    showLobbyMessage("Enter valid name and 2–10 players.");
    return;
  }

  playerName = nameVal;
  playerId = generatePlayerId();
  isCreator = true;
  const roomCode = generateRoomCode();
  currentRoomId = roomCode;

  const deck = generateDeck();
  const roomRef = db.collection('rooms').doc(roomCode);
  await roomRef.set({
    creator: playerId,
    maxPlayers,
    players: { [playerId]: { name: playerName, hand: [], calledUno: false } },
    gameState: 'waiting',
    currentTurn: null,
    discardPile: [],
    currentColor: null,
    direction: 1,
    activityLog: [],
    deck,
    chatLog: []
  });

  showGameArea();
  subscribeToRoom(roomCode);
});

joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameVal = document.getElementById('joinName').value.trim();
  const codeVal = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!nameVal || !codeVal) {
    showLobbyMessage("Enter valid name and room code.");
    return;
  }

  const roomRef = db.collection('rooms').doc(codeVal);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) {
    showLobbyMessage("Room not found.");
    return;
  }

  const data = roomDoc.data();
  const playerCount = Object.keys(data.players).length;
  if (playerCount >= data.maxPlayers) {
    showLobbyMessage("Room is full.");
    return;
  }

  playerName = nameVal;
  playerId = generatePlayerId();
  isCreator = false;
  currentRoomId = codeVal;

  await roomRef.update({
    [`players.${playerId}`]: { name: playerName, hand: [], calledUno: false }
  });

  showGameArea();
  subscribeToRoom(currentRoomId);
});

function showGameArea() {
  lobby.classList.add('hidden');
  gameArea.classList.remove('hidden');
}

// ======================= SUBSCRIBE TO ROOM CHANGES =======================

function subscribeToRoom(roomCode) {
  const roomRef = db.collection('rooms').doc(roomCode);

  if (gameStateUnsubscribe) gameStateUnsubscribe();
  if (chatUnsubscribe) chatUnsubscribe();

  gameStateUnsubscribe = roomRef.onSnapshot(doc => {
    if (!doc.exists) {
      alert("Room closed.");
      leaveRoom();
      return;
    }
    const data = doc.data();
    updateGameUI(data);
  });

  chatUnsubscribe = roomRef.collection('chatLog').orderBy('timestamp')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          appendChatMessage(change.doc.data());
        }
      });
    });
}

// ======================= UPDATE GAME UI =======================

function updateGameUI(data) {
  roomCodeDisplay.textContent = currentRoomId;
  yourNameDisplay.textContent = playerName;

  const playerIds = Object.keys(data.players);
  playerCountDisplay.textContent = playerIds.length;
  maxPlayersDisplay.textContent = data.maxPlayers;

  if (data.currentTurn) {
    turnIndicator.textContent = `${data.players[data.currentTurn].name}'s Turn`;
  } else {
    turnIndicator.textContent = '';
  }

  startGameBtn.style.display = (data.creator === playerId && data.gameState === 'waiting') ? 'inline-block' : 'none';
  restartGameBtn.style.display = (data.creator === playerId && data.gameState === 'ended') ? 'inline-block' : 'none';

  opponentsList.innerHTML = '';
  playerIds.forEach(pid => {
    if (pid === playerId) return;
    const li = document.createElement('li');
    li.textContent = `${data.players[pid].name} (${data.players[pid].hand.length})`;
    opponentsList.appendChild(li);
  });

  // --- DISCARD PILE UPDATE ---
  const topCard = data.discardPile[data.discardPile.length - 1];
  if (topCard) {
    discardPileEl.textContent = topCard.value.toUpperCase();
    // If topCard.color is 'wild', use currentColor; otherwise use topCard.color
    const displayColor = (topCard.color === 'wild') ? data.currentColor : topCard.color;
    // Overwrite className so it's always "card <color>"
    discardPileEl.className = `card ${displayColor}`;
  } else {
    // No cards yet
    discardPileEl.textContent = '';
    discardPileEl.className = 'card';
  }

  // Render player hand
  const myHand = data.players[playerId]?.hand || [];
  playerHand.innerHTML = '';
  myHand.forEach(card => {
    const cardEl = document.createElement('div');
    const cardColorClass = (card.color === 'wild') ? 'wild' : card.color;
    cardEl.className = `card ${cardColorClass}`;
    cardEl.textContent = card.value.toUpperCase();
    cardEl.addEventListener('click', () => handlePlayCard(card));
    playerHand.appendChild(cardEl);
  });

  // Activity log
  activityLog.innerHTML = '';
  data.activityLog.forEach(entry => {
    logActivity(entry);
  });
}

// ======================= START, RESTART, LEAVE =======================

startGameBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();
  const playerIds = Object.keys(data.players);

  if (playerIds.length < 2) {
    alert("Need at least 2 players to start.");
    return;
  }
  if (data.gameState !== 'waiting') {
    alert("Game already started.");
    return;
  }

  let deck = generateDeck();
  const updatedPlayers = {};
  playerIds.forEach(pid => {
    updatedPlayers[pid] = {
      ...data.players[pid],
      hand: deck.splice(0, 7),
      calledUno: false
    };
  });

  // Ensure first card is non‑wild
  let firstCard;
  do {
    firstCard = deck.shift();
    deck.push(firstCard);
  } while (firstCard.color === 'wild');

  const currentColor = firstCard.color;
  const currentTurn = playerIds[0];

  await roomRef.update({
    players: updatedPlayers,
    deck,
    discardPile: [firstCard],
    currentColor,
    currentTurn,
    gameState: 'started',
    direction: 1,
    activityLog: [`Game started. Top card: ${firstCard.color} ${firstCard.value}`]
  });
});

restartGameBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  if (data.gameState !== 'ended') {
    alert("Game not over yet.");
    return;
  }

  let deck = generateDeck();
  const updatedPlayers = {};
  Object.keys(data.players).forEach(pid => {
    updatedPlayers[pid] = {
      ...data.players[pid],
      hand: [],
      calledUno: false
    };
  });

  await roomRef.update({
    players: updatedPlayers,
    deck,
    discardPile: [],
    currentColor: null,
    currentTurn: null,
    gameState: 'waiting',
    direction: 1,
    activityLog: [],
    chatLog: []
  });
});

// Single leaveRoomBtn listener
leaveRoomBtn.addEventListener('click', async () => {
  if (!currentRoomId || !playerId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  const updatedPlayers = { ...data.players };
  delete updatedPlayers[playerId];

  if (Object.keys(updatedPlayers).length === 0) {
    await roomRef.delete();
  } else {
    await roomRef.update({ players: updatedPlayers });
    if (data.currentTurn === playerId) {
      const playerIds = Object.keys(updatedPlayers);
      const idx = (playerIds.indexOf(playerId) === -1) ? 0 : playerIds.indexOf(playerId);
      const nextTurnId = playerIds[(idx + data.direction + playerIds.length) % playerIds.length];
      await roomRef.update({ currentTurn: nextTurnId });
    }
  }

  if (gameStateUnsubscribe) gameStateUnsubscribe();
  if (chatUnsubscribe) chatUnsubscribe();

  currentRoomId = null;
  playerId = null;
  playerName = null;
  pendingWildCard = null;
  isCreator = false;

  resetGameArea();
  lobby.classList.remove('hidden');
  gameArea.classList.add('hidden');
});

function resetGameArea() {
  opponentsList.innerHTML = '';
  discardPileEl.textContent = '';
  discardPileEl.className = 'card';
  playerHand.innerHTML = '';
  chatLog.innerHTML = '';
  activityLog.innerHTML = '';
  roomCodeDisplay.textContent = '';
  yourNameDisplay.textContent = '';
  playerCountDisplay.textContent = '';
  maxPlayersDisplay.textContent = '';
  turnIndicator.textContent = '';
}

// ======================= PLAY CARD FUNCTION INCLUDING SPECIAL LOGIC =======================

async function handlePlayCard(card) {
  if (!currentRoomId || !playerId) return;

  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  if (data.currentTurn !== playerId) {
    alert("It's not your turn.");
    return;
  }
  if (data.gameState !== 'started') {
    alert("Game not started yet.");
    return;
  }

  const playerData = data.players[playerId];
  const hand = [...playerData.hand];
  const cardIndex = hand.findIndex(c => c.color === card.color && c.value === card.value);
  if (cardIndex === -1) {
    alert("You don't have that card.");
    return;
  }

  const topCard = data.discardPile[data.discardPile.length - 1];
  const currentColor = data.currentColor;

  if (!canPlayCard(card, topCard, currentColor)) {
    alert("You can't play that card now.");
    return;
  }

  // Remove chosen card from player's hand
  hand.splice(cardIndex, 1);
  let updatedPlayers = { ...data.players };
  updatedPlayers[playerId] = { ...playerData, hand, calledUno: false };

  // Add that card to discard pile
  let newDiscardPile = [...data.discardPile, card];
  const playerIds = Object.keys(data.players);
  const currentIndex = playerIds.indexOf(playerId);
  let direction = data.direction;
  let nextTurnId = null;
  let activityEntry = `${playerData.name} played ${card.color} ${card.value}`;

  switch (card.value) {
    case 'skip':
      nextTurnId = playerIds[(currentIndex + 2 * direction + playerIds.length) % playerIds.length];
      activityEntry += ` - skipped next player`;
      break;

    case 'reverse':
      if (playerIds.length === 2) {
        nextTurnId = playerIds[(currentIndex + 2 * direction + playerIds.length) % playerIds.length];
        activityEntry += ` - reversed (acts as skip)`;
      } else {
        direction = -direction;
        nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
        activityEntry += ` - reversed direction`;
      }
      break;

    case 'draw2':
      nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
      activityEntry += ` - ${data.players[nextTurnId].name} draws 2`;
      let deck = [...data.deck];
      if (deck.length < 2) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
      const drawn2 = deck.splice(0, 2);
      updatedPlayers[nextTurnId] = {
        ...data.players[nextTurnId],
        hand: [...data.players[nextTurnId].hand, ...drawn2]
      };
      nextTurnId = playerIds[(playerIds.indexOf(nextTurnId) + direction + playerIds.length) % playerIds.length];
      await roomRef.update({ deck });
      break;

    case 'wild':
      pendingWildCard = {
        data, roomRef, updatedPlayers, newDiscardPile,
        playerId, card, activityEntry, playerIds,
        currentIndex, direction
      };
      colorModal.classList.remove('hidden');
      return;

    case 'wild4':
      pendingWildCard = {
        data, roomRef, updatedPlayers, newDiscardPile,
        playerId, card, activityEntry, playerIds,
        currentIndex, direction
      };
      colorModal.classList.remove('hidden');
      return;

    default:
      nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
      break;
  }

  await roomRef.update({
    players: updatedPlayers,
    discardPile: newDiscardPile,
    currentColor: (card.color === 'wild') ? data.currentColor : card.color,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(activityEntry)
  });
}

// ======================= FINISH WILD CARD PLAY =======================

async function finishWildCardPlay(chosenColor) {
  if (!pendingWildCard) return;
  const {
    data, roomRef, updatedPlayers, newDiscardPile,
    playerId, card, activityEntry, playerIds,
    currentIndex, direction
  } = pendingWildCard;

  let nextTurnId = null;
  let updatedActivityEntry = `${activityEntry} - color chosen: ${chosenColor}`;

  if (card.value === 'wild4') {
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
    updatedActivityEntry += `, ${data.players[nextTurnId].name} draws 4`;

    let deck = [...data.deck];
    if (deck.length < 4) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
    const drawn4 = deck.splice(0, 4);
    updatedPlayers[nextTurnId] = {
      ...data.players[nextTurnId],
      hand: [...data.players[nextTurnId].hand, ...drawn4]
    };
    await roomRef.update({ deck });

    nextTurnId = playerIds[(playerIds.indexOf(nextTurnId) + direction + playerIds.length) % playerIds.length];
  } else {
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
  }

  await roomRef.update({
    players: updatedPlayers,
    discardPile: newDiscardPile,
    currentColor: chosenColor,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(updatedActivityEntry)
  });

  pendingWildCard = null;
  colorModal.classList.add('hidden');
}

// ======================= COLOR BUTTON EVENT LISTENERS =======================

colorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const chosenColor = btn.getAttribute('data-color');
    finishWildCardPlay(chosenColor);
  });
});

closeModalBtn.addEventListener('click', () => {
  pendingWildCard = null;
  colorModal.classList.add('hidden');
});

// ======================= DRAW CARD BUTTON =======================

drawCardBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  if (data.currentTurn !== playerId) {
    alert("It's not your turn.");
    return;
  }

  let deck = [...data.deck];
  let discardPile = [...data.discardPile];
  if (deck.length === 0) {
    deck = reshuffleDiscardIntoDeck(deck, discardPile);
  }

  if (deck.length === 0) {
    alert('No cards left to draw!');
    return;
  }

  const drawnCard = deck.shift();
  const updatedPlayers = { ...data.players };
  updatedPlayers[playerId] = {
    ...data.players[playerId],
    hand: [...data.players[playerId].hand, drawnCard]
  };

  const playerIds = Object.keys(data.players);
  const currentIndex = playerIds.indexOf(playerId);
  const nextTurnId = playerIds[(currentIndex + data.direction + playerIds.length) % playerIds.length];

  await roomRef.update({
    players: updatedPlayers,
    deck,
    currentTurn: nextTurnId,
    activityLog: firebase.firestore.FieldValue.arrayUnion(`${data.players[playerId].name} drew a card and ended their turn`)
  });
});

// ======================= CALL UNO BUTTON =======================

callUnoBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  const playerData = data.players[playerId];
  if (!playerData) return;

  if (playerData.hand.length === 1) {
    const updatedPlayers = { ...data.players };
    updatedPlayers[playerId] = {
      ...playerData,
      calledUno: true
    };
    await roomRef.update({
      players: updatedPlayers,
      activityLog: firebase.firestore.FieldValue.arrayUnion(`${playerData.name} called UNO!`)
    });
  } else {
    alert("You can only call UNO when you have exactly one card!");
  }
});

// ======================= CHAT FUNCTIONALITY =======================

sendChatBtn.addEventListener('click', async () => {
  if (!currentRoomId || !playerId) return;
  const msg = chatInput.value.trim();
  if (!msg) return;

  const chatRef = db.collection('rooms').doc(currentRoomId).collection('chatLog');
  await chatRef.add({
    playerId,
    playerName,
    message: msg,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  chatInput.value = '';
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChatBtn.click();
  }
});
