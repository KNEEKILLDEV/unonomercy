// script.js

// ======================= FIREBASE CONFIG & INITIALIZATION =======================
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

// ======================= GLOBAL STATE =======================
let currentRoomId   = null;
let playerId        = null;
let playerName      = null;
let pendingWildCard = null;   // for wild/wild4 until color chosen
let isCreator       = false;
let gameStateUnsub  = null;
let chatUnsub       = null;

// ======================= DOM ELEMENT REFERENCES =======================
const lobby              = document.getElementById('lobby');
const container          = document.getElementById('container');

const createForm         = document.getElementById('createForm');
const joinForm           = document.getElementById('joinForm');
const lobbyMessage       = document.getElementById('lobbyMessage');

const roomCodeDisplay    = document.getElementById('roomCodeDisplay');
const yourNameDisplay    = document.getElementById('yourNameDisplay');
const playerCountDisplay = document.getElementById('playerCountDisplay');
const maxPlayersDisplay  = document.getElementById('maxPlayersDisplay');

const opponentsList      = document.getElementById('opponentsList');
const discardPileEl      = document.getElementById('discardPile');
const playerHand         = document.getElementById('playerHand');

const drawCardBtn        = document.getElementById('drawCardBtn');
const callUnoBtn         = document.getElementById('callUnoBtn');
const leaveRoomBtn       = document.getElementById('leaveRoomBtn');
const startGameBtn       = document.getElementById('startGameBtn');
const restartGameBtn     = document.getElementById('restartGameBtn');

const chatLog            = document.getElementById('chatLog');
const chatInput          = document.getElementById('chatInput');
const sendChatBtn        = document.getElementById('sendChatBtn');

const activityLog        = document.getElementById('activityLog');

const colorModal         = document.getElementById('colorModal');
const colorButtons       = document.querySelectorAll('.colorBtn');
const closeModalBtn      = document.querySelector('.closeModalBtn');

const turnIndicator      = document.getElementById('turnIndicator');

// ======================= UTILITY FUNCTIONS =======================

// Generate a 5‑character uppercase room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Generate an 8‑character player ID
function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

// Fisher–Yates shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// When deck runs low, reshuffle old discards (except top) back into deck
function reshuffleDiscardIntoDeck(deck, discardPile) {
  if (!Array.isArray(discardPile) || discardPile.length <= 1) return deck;
  const top = discardPile.pop();
  let extras = discardPile.slice();
  extras = shuffle(extras);
  discardPile.length = 0;
  discardPile.push(top);
  return extras;
}

// Append a single string to the activity log panel
function logActivity(message) {
  const p = document.createElement('p');
  p.textContent = message;
  activityLog.appendChild(p);
  activityLog.scrollTop = activityLog.scrollHeight;
}

// Append one chat message to the chat panel
function appendChatMessage({ playerName, message }) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${playerName}:</strong> ${message}`;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Show a red validation message in the lobby area
function showLobbyMessage(msg) {
  lobbyMessage.textContent = msg;
}

// Build a fresh UNO deck (108 cards) and shuffle it
function generateDeck() {
  const colors = ['red', 'yellow', 'green', 'blue'];
  const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
  let deck = [];

  // One “0” of each color, two of each other value
  colors.forEach(color => {
    deck.push({ color, value: '0' });
    values.slice(1).forEach(val => {
      deck.push({ color, value: val });
      deck.push({ color, value: val });
    });
  });

  // Four “wild” and four “wild4”
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild4' });
  }

  return shuffle(deck);
}

// Check if a card can be played on top of the current topCard & color
function canPlayCard(card, topCard, currentColor) {
  return (
    card.color === 'wild' ||
    card.color === currentColor ||
    card.value === topCard.value
  );
}

// ======================= LOBBY: CREATE & JOIN HANDLERS =======================

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameVal    = document.getElementById('createName').value.trim();
  const maxPlayers = parseInt(document.getElementById('maxPlayers').value, 10);

  // Simple validation
  if (!nameVal || isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    showLobbyMessage("Enter valid name and 2–10 players.");
    return;
  }

  playerName = nameVal;
  playerId   = generatePlayerId();
  isCreator  = true;
  const roomCode = generateRoomCode();
  currentRoomId  = roomCode;

  // Build initial deck + players object
  const deck = generateDeck();
  const roomRef = db.collection('rooms').doc(roomCode);

  await roomRef.set({
    creator: playerId,
    maxPlayers,
    players: { [playerId]: { name: playerName, hand: [], calledUno: false } },
    gameState: 'waiting',        // waiting → started → ended
    currentTurn: null,
    discardPile: [],
    currentColor: null,
    direction: 1,                // 1 = normal, -1 = reversed
    activityLog: [],
    deck
  });

  lobby.classList.add('hidden');
  container.classList.remove('hidden');
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

  playerName     = nameVal;
  playerId       = generatePlayerId();
  isCreator      = false;
  currentRoomId  = codeVal;

  // Add this player to the players object (no initial hand yet)
  await roomRef.update({
    [`players.${playerId}`]: { name: playerName, hand: [], calledUno: false }
  });

  lobby.classList.add('hidden');
  container.classList.remove('hidden');
  subscribeToRoom(currentRoomId);
});

// ======================= SUBSCRIBE TO ROOM UPDATES & CHAT =======================
function subscribeToRoom(roomCode) {
  const roomRef = db.collection('rooms').doc(roomCode);

  // Unsubscribe prior if any
  if (gameStateUnsub) gameStateUnsub();
  if (chatUnsub) chatUnsub();

  // Listen to room document
  gameStateUnsub = roomRef.onSnapshot(doc => {
    if (!doc.exists) {
      alert("Room closed.");
      leaveRoom();
      return;
    }
    const data = doc.data();
    updateGameUI(data);
  });

  // Listen to chat subcollection
  chatUnsub = roomRef.collection('chatLog')
    .orderBy('timestamp')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          appendChatMessage(change.doc.data());
        }
      });
    });
}

// ======================= UPDATE MAIN GAME UI =======================
function updateGameUI(data) {
  // Always show current room code & your name
  roomCodeDisplay.textContent    = currentRoomId;
  yourNameDisplay.textContent    = playerName;
  const playerIds = Object.keys(data.players);
  playerCountDisplay.textContent = playerIds.length;
  maxPlayersDisplay.textContent  = data.maxPlayers;

  // Show whose turn it is (or blank)
  if (data.currentTurn) {
    turnIndicator.textContent = `${data.players[data.currentTurn].name}'s Turn`;
  } else {
    turnIndicator.textContent = '';
  }

  // Show/hide Start & Restart depending on creator + gameState
  startGameBtn.style.display   = (data.creator === playerId && data.gameState === 'waiting') ? 'inline-block' : 'none';
  restartGameBtn.style.display = (data.creator === playerId && data.gameState === 'ended')  ? 'inline-block' : 'none';

  // Render opponents list (excluding self)
  opponentsList.innerHTML = '';
  playerIds.forEach(pid => {
    if (pid === playerId) return;
    const li = document.createElement('li');
    li.textContent = `${data.players[pid].name} (${data.players[pid].hand.length})`;
    opponentsList.appendChild(li);
  });

  // -------- Discard Pile --------
  const discardArr = Array.isArray(data.discardPile) ? data.discardPile : [];
  const topCard    = discardArr.length ? discardArr[discardArr.length - 1] : null;
  if (topCard) {
    discardPileEl.textContent = topCard.value.toUpperCase();
    // If it’s actually a wild on top, use the currentColor; otherwise use topCard.color
    const displayColor = (topCard.color === 'wild') ? data.currentColor : topCard.color;
    discardPileEl.className = `card ${displayColor}`;
  } else {
    discardPileEl.textContent = '';
    discardPileEl.className = 'card';
  }

  // -------- Player’s Hand --------
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

  // -------- Activity Log --------
  activityLog.innerHTML = '';
  (Array.isArray(data.activityLog) ? data.activityLog : []).forEach(entry => {
    logActivity(entry);
  });
}

// ======================= START / RESTART / LEAVE ROOM =======================
startGameBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();
  const playerIds = Object.keys(data.players);

  // Must have at least 2 players
  if (playerIds.length < 2) {
    alert("Need at least 2 players to start.");
    return;
  }
  if (data.gameState !== 'waiting') {
    alert("Game already started or ended.");
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

  // Find first non‑wild to start face‑up
  let firstCard;
  do {
    firstCard = deck.shift();
    deck.push(firstCard);
  } while (firstCard.color === 'wild');

  const currentColor = firstCard.color;
  const currentTurn  = playerIds[0];

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
    activityLog: []
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
    // Last player leaving: delete room entirely
    await roomRef.delete();
  } else {
    await roomRef.update({ players: updatedPlayers });
    // If the leaving player was currentTurn, pass turn to next
    if (data.currentTurn === playerId) {
      const playerIds = Object.keys(updatedPlayers);
      const idx = (playerIds.indexOf(playerId) === -1) ? 0 : playerIds.indexOf(playerId);
      const nextTurnId = playerIds[(idx + data.direction + playerIds.length) % playerIds.length];
      await roomRef.update({ currentTurn: nextTurnId });
    }
  }

  if (gameStateUnsub) gameStateUnsub();
  if (chatUnsub) chatUnsub();

  currentRoomId = null;
  playerId = null;
  playerName = null;
  pendingWildCard = null;
  isCreator = false;

  container.classList.add('hidden');
  lobby.classList.remove('hidden');
  resetGameUI();
});

function resetGameUI() {
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

// ======================= PLAY CARD + SPECIAL CARD LOGIC =======================
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

  const discardArr = Array.isArray(data.discardPile) ? data.discardPile : [];
  const topCard    = discardArr.length ? discardArr[discardArr.length - 1] : { color: null, value: null };
  const currentColor = data.currentColor;

  if (!canPlayCard(card, topCard, currentColor)) {
    alert("You can't play that card now.");
    return;
  }

  // Remove card from player's hand
  hand.splice(cardIndex, 1);
  let updatedPlayers = { ...data.players };
  updatedPlayers[playerId] = { ...playerData, hand, calledUno: false };

  // Add card to discard
  let newDiscardPile = [...discardArr, card];
  const playerIds = Object.keys(data.players);
  const currentIndex = playerIds.indexOf(playerId);
  let direction = data.direction;
  let nextTurnId = null;
  let activityEntry = `${playerData.name} played ${card.color} ${card.value}`;

  switch (card.value) {
    case 'skip':
      nextTurnId = playerIds[(currentIndex + 2 * direction + playerIds.length) % playerIds.length];
      activityEntry += ` – skipped next player`;
      break;

    case 'reverse':
      if (playerIds.length === 2) {
        nextTurnId = playerIds[(currentIndex + 2 * direction + playerIds.length) % playerIds.length];
        activityEntry += ` – reversed (acts as skip)`;
      } else {
        direction = -direction;
        nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
        activityEntry += ` – reversed direction`;
      }
      break;

    case 'draw2':
      nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
      activityEntry += ` – ${data.players[nextTurnId].name} draws 2`;

      let deck = Array.isArray(data.deck) ? [...data.deck] : [];
      if (deck.length < 2) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
      const drawn2 = deck.splice(0, Math.min(2, deck.length));

      updatedPlayers[nextTurnId] = {
        ...data.players[nextTurnId],
        hand: [...data.players[nextTurnId].hand, ...drawn2]
      };

      nextTurnId = playerIds[(playerIds.indexOf(nextTurnId) + direction + playerIds.length) % playerIds.length];
      await roomRef.update({ deck });
      break;

    case 'wild':
      // Wait for color selection
      pendingWildCard = {
        data, roomRef, updatedPlayers, newDiscardPile,
        playerId, card, activityEntry, playerIds,
        currentIndex, direction
      };
      colorModal.classList.remove('hidden');
      return;

    case 'wild4':
      // Wait for color selection + draw 4
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

  // If that play emptied the player’s hand → they win immediately
  if (hand.length === 0) {
    await roomRef.update({
      players: updatedPlayers,
      discardPile: newDiscardPile,
      currentColor: (card.color === 'wild') ? data.currentColor : card.color,
      currentTurn: null,
      gameState: 'ended',
      direction,
      activityLog: firebase.firestore.FieldValue.arrayUnion(`${activityEntry}. ${playerData.name} wins!`)
    });
    return;
  }

  // Otherwise, normal update
  await roomRef.update({
    players: updatedPlayers,
    discardPile: newDiscardPile,
    currentColor: (card.color === 'wild') ? data.currentColor : card.color,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(activityEntry)
  });
}

// ======================= FINISH WILD / WILD4 LOGIC =======================
async function finishWildCardPlay(chosenColor) {
  if (!pendingWildCard) return;

  const {
    data, roomRef, updatedPlayers, newDiscardPile,
    playerId, card, activityEntry, playerIds,
    currentIndex, direction
  } = pendingWildCard;

  let nextTurnId = null;
  let updatedActivityEntry = `${activityEntry} – color chosen: ${chosenColor}`;

  if (card.value === 'wild4') {
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
    updatedActivityEntry += `, ${data.players[nextTurnId].name} draws 4`;

    let deck = Array.isArray(data.deck) ? [...data.deck] : [];
    if (deck.length < 4) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
    const drawn4 = deck.splice(0, Math.min(4, deck.length));

    updatedPlayers[nextTurnId] = {
      ...data.players[nextTurnId],
      hand: [...data.players[nextTurnId].hand, ...drawn4]
    };
    await roomRef.update({ deck });

    nextTurnId = playerIds[(playerIds.indexOf(nextTurnId) + direction + playerIds.length) % playerIds.length];
  } else {
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
  }

  // If playing that wild emptied the player’s hand → they win
  const newHand = updatedPlayers[playerId].hand;
  if (newHand.length === 0) {
    await roomRef.update({
      players: updatedPlayers,
      discardPile: newDiscardPile,
      currentColor: chosenColor,
      currentTurn: null,
      gameState: 'ended',
      direction,
      activityLog: firebase.firestore.FieldValue.arrayUnion(`${updatedPlayers[playerId].name} wins!`)
    });
    pendingWildCard = null;
    colorModal.classList.add('hidden');
    return;
  }

  // Otherwise, normal update
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

// ======================= COLOR BUTTON / MODAL HANDLERS =======================
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

  let deck = Array.isArray(data.deck) ? [...data.deck] : [];
  let discardPile = Array.isArray(data.discardPile) ? [...data.discardPile] : [];

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
