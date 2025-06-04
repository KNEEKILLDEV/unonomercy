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
let pendingWildCard = null; // Holds data for wild card color selection
let gameStateUnsubscribe = null;
let chatUnsubscribe = null;

// ======================= DOM ELEMENTS =======================

const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const yourNameDisplay = document.getElementById('yourNameDisplay');
const currentTurnDisplay = document.getElementById('currentTurnDisplay');
const playerCountDisplay = document.getElementById('playerCountDisplay');
const maxPlayersDisplay = document.getElementById('maxPlayersDisplay');

const opponentsList = document.getElementById('opponentsList');
const discardPileEl = document.getElementById('discardPile');
const currentColorDisplay = document.getElementById('currentColorDisplay');
const playerHand = document.getElementById('playerHand');

const drawCardBtn = document.getElementById('drawCardBtn');
const callUnoBtn = document.getElementById('callUnoBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

const activityLog = document.getElementById('activityLog');

const colorModal = document.getElementById('colorModal');
const colorButtons = document.querySelectorAll('.colorBtn');
const closeModalBtn = document.querySelector('.closeModalBtn');

// ======================= UTILITY FUNCTIONS =======================

// Generate a random room code (5 characters)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Generate a random player ID
function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

// Fisher-Yates shuffle for an array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Reshuffle discard pile into deck (except top card) when deck runs out
function reshuffleDiscardIntoDeck(deck, discardPile) {
  if (discardPile.length <= 1) return deck;
  const topDiscard = discardPile.pop();
  const reshuffleCards = shuffle(discardPile.slice());
  discardPile.length = 0;
  discardPile.push(topDiscard);
  return reshuffleCards;
}

// Log activity in the UI
function logActivity(message) {
  const p = document.createElement('p');
  p.textContent = message;
  activityLog.appendChild(p);
  activityLog.scrollTop = activityLog.scrollHeight;
}

// Add chat message to UI
function appendChatMessage({ playerName, message }) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${playerName}:</strong> ${message}`;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Show error message in lobby
function showLobbyMessage(msg) {
  const lobbyMsg = document.getElementById('lobbyMessage');
  lobbyMsg.textContent = msg;
}

// ======================= DECK & GAME LOGIC =======================

// Build full UNO deck array
function generateDeck() {
  const colors = ['red', 'yellow', 'green', 'blue'];
  const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
  let deck = [];

  colors.forEach(color => {
    deck.push({ color, value: '0' });
    for (let i = 0; i < 2; i++) {
      values.slice(1).forEach(val => {
        deck.push({ color, value: val });
      });
    }
  });

  // Add wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild4' });
  }

  return shuffle(deck);
}

// Check if a card can be played on the current top card
function canPlayCard(card, topCard, currentColor) {
  return (
    card.color === 'wild' ||
    card.color === currentColor ||
    card.value === topCard.value
  );
}

// ======================= LOBBY: CREATE AND JOIN ROOM =======================

document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('createName').value.trim();
  const maxPlayers = parseInt(document.getElementById('maxPlayers').value);

  if (!nameInput || isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    showLobbyMessage("Enter valid name and max players (2-10).");
    return;
  }

  playerName = nameInput;
  playerId = generatePlayerId();
  const roomCode = generateRoomCode();
  currentRoomId = roomCode;

  // Initial deck for game
  const deck = generateDeck();

  const roomRef = db.collection('rooms').doc(roomCode);
  await roomRef.set({
    maxPlayers,
    players: {
      [playerId]: { name: playerName, hand: [], calledUno: false }
    },
    gameState: 'waiting', // waiting, started, ended
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

document.getElementById('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('joinName').value.trim();
  const codeInput = document.getElementById('joinCode').value.trim().toUpperCase();

  if (!nameInput || !codeInput) {
    showLobbyMessage("Enter valid name and room code.");
    return;
  }

  const roomRef = db.collection('rooms').doc(codeInput);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) {
    showLobbyMessage("Room not found.");
    return;
  }

  const roomData = roomDoc.data();
  const playerCount = Object.keys(roomData.players).length;
  if (playerCount >= roomData.maxPlayers) {
    showLobbyMessage("Room is full.");
    return;
  }

  playerName = nameInput;
  playerId = generatePlayerId();
  currentRoomId = codeInput;

  await roomRef.update({
    [`players.${playerId}`]: { name: playerName, hand: [], calledUno: false }
  });

  showGameArea();
  subscribeToRoom(currentRoomId);
});

// Show the game UI and hide lobby
function showGameArea() {
  lobby.classList.add('hidden');
  gameArea.classList.remove('hidden');
}

// ======================= SUBSCRIBE TO ROOM DATA & CHAT =======================

function subscribeToRoom(roomCode) {
  const roomRef = db.collection('rooms').doc(roomCode);

  if (gameStateUnsubscribe) gameStateUnsubscribe();
  if (chatUnsubscribe) chatUnsubscribe();

  gameStateUnsubscribe = roomRef.onSnapshot(doc => {
    const data = doc.data();
    if (!data) {
      alert("Room closed.");
      leaveRoom();
      return;
    }
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
  // Room info
  roomCodeDisplay.textContent = currentRoomId;
  yourNameDisplay.textContent = playerName;
  const playerIds = Object.keys(data.players);
  playerCountDisplay.textContent = playerIds.length;
  maxPlayersDisplay.textContent = data.maxPlayers;
  currentTurnDisplay.textContent = data.currentTurn ? data.players[data.currentTurn].name : '—';
  currentColorDisplay.textContent = data.currentColor || '—';

  // Render opponents
  opponentsList.innerHTML = '';
  playerIds.forEach(pid => {
    if (pid === playerId) return;
    const li = document.createElement('li');
    li.textContent = `${data.players[pid].name} (${data.players[pid].hand.length})`;
    opponentsList.appendChild(li);
  });

  // Render discard pile top card
  const topCard = data.discardPile[data.discardPile.length - 1];
  if (topCard) {
    discardPileEl.textContent = topCard.value.toUpperCase();
    discardPileEl.className = `card ${topCard.color}`;
  } else {
    discardPileEl.textContent = '';
    discardPileEl.className = 'card';
  }

  // Render player hand
  const myHand = data.players[playerId]?.hand || [];
  playerHand.innerHTML = '';
  myHand.forEach((card, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.color}`;
    cardEl.textContent = card.value.toUpperCase();
    cardEl.addEventListener('click', () => handlePlayCard(card));
    playerHand.appendChild(cardEl);
  });

  // Render activity log
  activityLog.innerHTML = '';
  data.activityLog.forEach(entry => {
    logActivity(entry);
  });
}

// ======================= START, RESTART, AND LEAVE GAME =======================

document.getElementById('startGameBtn').addEventListener('click', async () => {
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

  // Shuffle deck and deal 7 cards each
  let deck = [...data.deck];
  const updatedPlayers = {};
  playerIds.forEach(pid => {
    updatedPlayers[pid] = {
      ...data.players[pid],
      hand: deck.splice(0, 7),
      calledUno: false
    };
  });

  // Find a non-wild card to start discard pile
  let firstCard;
  do {
    firstCard = deck.shift();
    deck.push(firstCard);
  } while (firstCard.color === 'wild');

  const currentColor = firstCard.color;
  const currentTurn = playerIds[0]; // first player in list

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

document.getElementById('restartGameBtn').addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  if (data.gameState !== 'ended') {
    alert("Game is not over yet.");
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
      const nextIndex = (playerIds.indexOf(playerId) + data.direction + playerIds.length) % playerIds.length;
      const nextTurnId = playerIds[nextIndex];
      await roomRef.update({ currentTurn: nextTurnId });
    }
  }

  if (gameStateUnsubscribe) gameStateUnsubscribe();
  if (chatUnsubscribe) chatUnsubscribe();

  currentRoomId = null;
  playerId = null;
  playerName = null;
  pendingWildCard = null;

  resetGameArea();

  lobby.classList.remove('hidden');
  gameArea.classList.add('hidden');
});

function resetGameArea() {
  opponentsList.innerHTML = '';
  discardPileEl.textContent = '';
  discardPileEl.className = 'card';
  currentColorDisplay.textContent = '';
  playerHand.innerHTML = '';
  chatLog.innerHTML = '';
  activityLog.innerHTML = '';
  roomCodeDisplay.textContent = '';
  yourNameDisplay.textContent = '';
  currentTurnDisplay.textContent = '';
  playerCountDisplay.textContent = '';
  maxPlayersDisplay.textContent = '';
}

// ======================= PLAY CARD FUNCTION INCLUDING SPECIAL LOGIC =======================

async function handlePlayCard(card) {
  if (!currentRoomId || !playerId) return;

  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  // Ensure game is started and it's player's turn
  if (data.gameState !== 'started') {
    alert("Game has not started yet.");
    return;
  }
  if (data.currentTurn !== playerId) {
    alert("It's not your turn.");
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

  // Remove card from hand
  hand.splice(cardIndex, 1);
  let updatedPlayers = { ...data.players };
  updatedPlayers[playerId] = { ...playerData, hand, calledUno: false };

  // Add to discard pile
  const newDiscardPile = [...data.discardPile, card];

  // Prepare variables for next turn
  const playerIds = Object.keys(data.players);
  const currentIndex = playerIds.indexOf(playerId);
  let direction = data.direction;
  let nextTurnId = null;
  let activityEntry = `${playerData.name} played ${card.color} ${card.value}`;

  // Special card handling
  switch (card.value) {
    case 'skip':
      nextTurnId = playerIds[(currentIndex + 2 * direction + playerIds.length) % playerIds.length];
      activityEntry += ` - skipped next player`;
      break;

    case 'reverse':
      if (playerIds.length === 2) {
        // Acts as skip if 2 players
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
      // Draw 2 cards for next player
      let deck = [...data.deck];
      if (deck.length < 2) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
      const drawn2 = deck.splice(0, 2);
      updatedPlayers[nextTurnId] = {
        ...data.players[nextTurnId],
        hand: [...data.players[nextTurnId].hand, ...drawn2]
      };
      // Skip that player's turn
      nextTurnId = playerIds[(playerIds.indexOf(nextTurnId) + direction + playerIds.length) % playerIds.length];
      await roomRef.update({ deck });
      break;

    case 'wild':
      // Wait for color pick
      pendingWildCard = {
        data, roomRef, updatedPlayers, newDiscardPile,
        playerId, card, activityEntry, playerIds,
        currentIndex, direction
      };
      colorModal.classList.remove('hidden');
      return; // exit, wait for color choice

    case 'wild4':
      // Wait for color pick and 4-card draw next
      pendingWildCard = {
        data, roomRef, updatedPlayers, newDiscardPile,
        playerId, card, activityEntry, playerIds,
        currentIndex, direction
      };
      colorModal.classList.remove('hidden');
      return;

    default:
      // Normal card => next player's turn
      nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
      break;
  }

  // Update Firestore with changes
  await roomRef.update({
    players: updatedPlayers,
    discardPile: newDiscardPile,
    currentColor: card.color === 'wild' ? data.currentColor : card.color,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(activityEntry)
  });
}

// Called after player picks a color for wild cards
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
    // Next player draws 4 and skip
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
    updatedActivityEntry += `, ${data.players[nextTurnId].name} draws 4`;

    // Draw 4 for next player
    let deck = [...data.deck];
    if (deck.length < 4) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
    const drawn4 = deck.splice(0, 4);
    updatedPlayers[nextTurnId] = {
      ...data.players[nextTurnId],
      hand: [...data.players[nextTurnId].hand, ...drawn4]
    };

    await roomRef.update({ deck });

    // Skip that player's turn
    nextTurnId = playerIds[(playerIds.indexOf(nextTurnId) + direction + playerIds.length) % playerIds.length];
  } else {
    // Regular wild => next player's turn
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
  }

  // Write all updates to Firestore
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

// ======================= DRAW CARD FUNCTION =======================

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

// ======================= CALL UNO FUNCTION =======================

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

// ======================= LEAVE ROOM FUNCTION =======================

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
      const idx = playerIds.indexOf(playerId) === -1 ? 0 : playerIds.indexOf(playerId);
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

  resetGameArea();
  lobby.classList.remove('hidden');
  gameArea.classList.add('hidden');
});

function resetGameArea() {
  opponentsList.innerHTML = '';
  discardPileEl.textContent = '';
  discardPileEl.className = 'card';
  currentColorDisplay.textContent = '';
  playerHand.innerHTML = '';
  chatLog.innerHTML = '';
  activityLog.innerHTML = '';
  roomCodeDisplay.textContent = '';
  yourNameDisplay.textContent = '';
  currentTurnDisplay.textContent = '';
  playerCountDisplay.textContent = '';
  maxPlayersDisplay.textContent = '';
}
