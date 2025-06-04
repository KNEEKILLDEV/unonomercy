// Initialize Firebase
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

const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');

const roomCodeText = document.getElementById('roomCodeDisplay');
const yourNameText = document.getElementById('yourNameDisplay');
const currentPlayerText = document.getElementById('currentTurnDisplay');
const playerCountText = document.getElementById('playerCountDisplay');
const maxPlayersText = document.getElementById('maxPlayersDisplay');
const yourHand = document.getElementById('playerHand');
const currentColorText = document.getElementById('currentColorDisplay');

const createRoomForm = document.getElementById('createRoomForm');
const joinRoomForm = document.getElementById('joinRoomForm');

const startGameBtn = document.getElementById('startGameBtn');
const restartGameBtn = document.getElementById('restartGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

const drawCardBtn = document.getElementById('drawCardBtn');
const callUnoBtn = document.getElementById('callUnoBtn');

const opponentsList = document.getElementById('opponentsList');

const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

const activityLog = document.getElementById('activityLog');

const colorModal = document.getElementById('colorModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const colorButtons = document.querySelectorAll('.color-btn');

let currentRoomId = null;
let playerId = null;
let playerName = null;
let playerHandCards = [];
let gameStateUnsubscribe = null;
let chatUnsubscribe = null;

let pendingWildCard = null; // Store info about wild card needing color choice

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Generate random player ID
function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

// ======================= ROOM CREATION & JOIN =======================

createRoomForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  playerName = document.getElementById('createName').value.trim();
  const maxPlayers = parseInt(document.getElementById('maxPlayers').value);

  if (!playerName || maxPlayers < 2 || maxPlayers > 10) {
    alert('Please enter valid name and max players between 2 and 10');
    return;
  }

  const roomCode = generateRoomCode();

  const roomRef = db.collection('rooms').doc(roomCode);

  // Create deck for game start
  const deck = generateDeck();

  // Create room with initial data
  await roomRef.set({
    maxPlayers,
    players: {},
    gameState: 'waiting', // waiting, started, ended
    currentTurn: null,
    discardPile: [],
    currentColor: null,
    direction: 1, // 1 = clockwise, -1 = counterclockwise
    activityLog: [],
    chatLog: [],
    deck,
  });

  playerId = generatePlayerId();
  const playerData = {
    name: playerName,
    hand: [],
    calledUno: false,
  };

  await roomRef.update({
    [`players.${playerId}`]: playerData,
  });

  currentRoomId = roomCode;
  showGameArea();
  subscribeToRoom(roomCode);
});

joinRoomForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  playerName = document.getElementById('joinName').value.trim();
  const roomCode = document.getElementById('joinRoomCode').value.trim().toUpperCase();

  if (!playerName || !roomCode) {
    alert('Please enter a valid name and room code');
    return;
  }

  const roomRef = db.collection('rooms').doc(roomCode);
  const roomDoc = await roomRef.get();

  if (!roomDoc.exists) {
    alert('Room not found');
    return;
  }

  const roomData = roomDoc.data();

  if (Object.keys(roomData.players).length >= roomData.maxPlayers) {
    alert('Room is full');
    return;
  }

  playerId = generatePlayerId();

  const playerData = {
    name: playerName,
    hand: [],
    calledUno: false,
  };

  await roomRef.update({
    [`players.${playerId}`]: playerData,
  });

  currentRoomId = roomCode;
  showGameArea();
  subscribeToRoom(roomCode);
});

function showGameArea() {
  lobby.classList.add('hidden');
  gameArea.classList.remove('hidden');
}

function resetGameArea() {
  playerHandCards = [];
  yourHand.innerHTML = '';
  opponentsList.innerHTML = '';
  chatLog.innerHTML = '';
  activityLog.innerHTML = '';
  currentPlayerText.textContent = '';
  playerCountText.textContent = '';
  maxPlayersText.textContent = '';
  currentColorText.textContent = '';
  roomCodeText.textContent = '';
  yourNameText.textContent = '';
}

// ======================= DECK & GAME LOGIC =======================

// Generate full Uno deck array
// Each card: { color: 'red|green|blue|yellow|wild', value: '0'-'9', 'skip', 'reverse', 'draw2', 'wild', 'wild4' }
function generateDeck() {
  const colors = ['red', 'green', 'blue', 'yellow'];
  const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];

  let deck = [];

  // For each color:
  colors.forEach(color => {
    // One 0 card per color
    deck.push({ color, value: '0' });
    // Two of each 1-9 and special cards
    values.slice(1).forEach(value => {
      deck.push({ color, value });
      deck.push({ color, value });
    });
  });

  // Wild cards - 4 wild, 4 wild draw four
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild4' });
  }

  return shuffle(deck);
}

// Fisher-Yates shuffle
function shuffle(array) {
  let currentIndex = array.length, randomIndex;

  while(currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// ======================= GAME START =======================

startGameBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;

  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;

  const roomData = roomDoc.data();
  const players = roomData.players;

  if (Object.keys(players).length < 2) {
    alert('Need at least 2 players to start');
    return;
  }

  if (roomData.gameState !== 'waiting') {
    alert('Game already started');
    return;
  }

  // Shuffle deck (already shuffled on create) and deal 7 cards each
  let deck = [...roomData.deck];
  const playerIds = Object.keys(players);

  let updatedPlayers = {};
  playerIds.forEach(pid => {
    updatedPlayers[pid] = {
      ...players[pid],
      hand: deck.splice(0,7),
      calledUno: false,
    };
  });

  // Start discard pile with top non-wild card from deck
  let topCardIndex = deck.findIndex(card => card.color !== 'wild');
  if (topCardIndex === -1) {
    alert('No valid starting card found in deck!');
    return;
  }
  const topCard = deck.splice(topCardIndex,1)[0];

  // Set initial current color to top card color
  const currentColor = topCard.color;

  // Set first player to first in list
  const currentTurn = playerIds[0];

  // Update Firestore with game start info
  await roomRef.update({
    players: updatedPlayers,
    deck,
    discardPile: [topCard],
    currentColor,
    currentTurn,
    gameState: 'started',
    direction: 1,
    activityLog: [`Game started. First card: ${topCard.color} ${topCard.value}`],
  });
});

// ======================= SUBSCRIBE TO ROOM UPDATES =======================

function subscribeToRoom(roomCode) {
  const roomRef = db.collection('rooms').doc(roomCode);

  if (gameStateUnsubscribe) gameStateUnsubscribe();
  if (chatUnsubscribe) chatUnsubscribe();

  gameStateUnsubscribe = roomRef.onSnapshot((doc) => {
    if (!doc.exists) {
      alert('Room has been closed.');
      leaveRoom();
      return;
    }
    const data = doc.data();
    updateGame(data);
  });

  chatUnsubscribe = roomRef.collection('chat').orderBy('timestamp')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          appendChatMessage(change.doc.data());
        }
      });
    });
}

// ======================= UPDATE UI =======================

function updateGame(data) {
  roomCodeText.textContent = currentRoomId;
  yourNameText.textContent = playerName;
  currentPlayerText.textContent = data.currentTurn ? data.players[data.currentTurn]?.name || '' : '';
  playerCountText.textContent = Object.keys(data.players).length;
  maxPlayersText.textContent = data.maxPlayers;

  // Update your hand
  if (data.players[playerId]) {
    playerHandCards = data.players[playerId].hand || [];
    renderPlayerHand();
  }

  // Update opponents list
  renderOpponents(data.players);

  // Update current color
  currentColorText.textContent = data.currentColor || 'None';

  // Update discard pile top card
  renderTopCard(data.discardPile[data.discardPile.length - 1]);

  // Update activity log
  if (data.activityLog) {
    activityLog.textContent = data.activityLog.join('\n');
    activityLog.scrollTop = activityLog.scrollHeight;
  }
}

function renderPlayerHand() {
  yourHand.innerHTML = '';
  playerHandCards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.color}`;
    cardEl.textContent = card.value.toUpperCase();

    // Disable clicking if not your turn or game not started
    cardEl.style.cursor = 'pointer';

    cardEl.addEventListener('click', () => playCard(index));

    yourHand.appendChild(cardEl);
  });
}

function renderOpponents(players) {
  opponentsList.innerHTML = '';
  Object.entries(players).forEach(([id, player]) => {
    if (id === playerId) return;
    const li = document.createElement('li');
    li.textContent = `${player.name} (${player.hand.length} cards)`;
    opponentsList.appendChild(li);
  });
}

function renderTopCard(card) {
  const topCardEl = document.getElementById('topCard');
  if (!card) {
    topCardEl.textContent = 'No cards';
    topCardEl.className = 'card';
    return;
  }
  topCardEl.textContent = card.value.toUpperCase();
  topCardEl.className = `card ${card.color}`;
}

// ======================= GAMEPLAY FUNCTIONS =======================

// Check if card can be played on top of discard pile card
function canPlayCard(card, topCard, currentColor) {
  return (
    card.color === currentColor || 
    card.value === topCard.value || 
    card.color === 'wild'
  );
}

// Play a card from player's hand by index
async function playCard(cardIndex) {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const roomData = roomDoc.data();

  if (roomData.gameState !== 'started') {
    alert('Game not started yet.');
    return;
  }

  if (roomData.currentTurn !== playerId) {
    alert("It's not your turn.");
    return;
  }

  const players = roomData.players;
  const playerData = players[playerId];
  const hand = playerData.hand;

  if (cardIndex < 0 || cardIndex >= hand.length) {
    alert('Invalid card.');
    return;
  }

  const cardToPlay = hand[cardIndex];
  const topCard = roomData.discardPile[roomData.discardPile.length -1];
  const currentColor = roomData.currentColor;

  if (!canPlayCard(cardToPlay, topCard, currentColor)) {
    alert('You cannot play this card.');
    return;
  }

  // Remove card from hand
  const newHand = [...hand];
  newHand.splice(cardIndex,1);

  // Add card to discard pile
  const newDiscardPile = [...roomData.discardPile, cardToPlay];

  // Activity log entry for play
  let activityEntry = `${playerData.name} played ${cardToPlay.color} ${cardToPlay.value}`;

  // Update players object with new hand
  let updatedPlayers = { ...players };
  updatedPlayers[playerId] = {
    ...playerData,
    hand: newHand,
    calledUno: newHand.length === 1 ? false : playerData.calledUno, // Reset calledUno if not exactly one card
  };

  // Calculate next turn info
  const playerIds = Object.keys(players);
  const currentIndex = playerIds.indexOf(playerId);
  let direction = roomData.direction;
  let nextIndex = null;

  // Helper to get next player index with wraparound
  function getNextIndex(idx, dir) {
    let len = playerIds.length;
    let next = (idx + dir + len) % len;
    return next;
  }

  // Initialize variables to update below
  let nextTurnId = null;
  let nextColor = cardToPlay.color === 'wild' ? null : cardToPlay.color;

  // Check for special card effects
  if (cardToPlay.color === 'wild') {
    // For wild cards, show modal to pick color
    pendingWildCard = {
      roomData,
      roomRef,
      updatedPlayers,
      newDiscardPile,
      playerId,
      cardToPlay,
      activityEntry,
      playerIds,
      currentIndex,
      direction,
    };
    // Show color modal
    colorModal.classList.remove('hidden');
    return; // Wait for color choice to proceed
  }

  // For non-wild cards:

  switch(cardToPlay.value) {
    case 'skip':
      activityEntry += ` - skipped next player`;
      nextIndex = getNextIndex(currentIndex, direction);
      // Skip next player by advancing turn index twice
      nextTurnId = playerIds[getNextIndex(nextIndex, direction)];
      break;

    case 'reverse':
      activityEntry += ` - reversed turn order`;
      direction = direction * -1;
      // If 2 players only, reverse acts like skip (next player loses turn)
      if (playerIds.length === 2) {
        nextIndex = getNextIndex(currentIndex, direction);
        nextTurnId = playerIds[getNextIndex(nextIndex, direction)];
      } else {
        nextTurnId = playerIds[getNextIndex(currentIndex, direction)];
      }
      break;

    case 'draw2':
      activityEntry += ` - next player draws 2 cards and skips turn`;
      nextIndex = getNextIndex(currentIndex, direction);
      nextTurnId = playerIds[getNextIndex(nextIndex, direction)];

      // Give next player 2 cards
      let deck = [...roomData.deck];
      if (deck.length < 2) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);

      let drawnCards = deck.splice(0, 2);

      updatedPlayers[nextTurnId] = {
        ...players[nextTurnId],
        hand: [...players[nextTurnId].hand, ...drawnCards],
      };

      // Update deck after drawing cards
      await roomRef.update({ deck });
      break;

    default:
      // Normal card played, next player turn normally
      nextTurnId = playerIds[getNextIndex(currentIndex, direction)];
      break;
  }

  if (!nextTurnId) {
    // Default fallback (shouldn't happen)
    nextTurnId = playerIds[getNextIndex(currentIndex, direction)];
  }

  // Update Firestore with all new data
  await roomRef.update({
    players: updatedPlayers,
    discardPile: newDiscardPile,
    currentColor: nextColor,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(activityEntry),
  });
}

// Reshuffle discard pile (except top card) into deck if deck runs out
function reshuffleDiscardIntoDeck(deck, discardPile) {
  if (deck.length > 0) return deck; // still have cards

  // Take all but last discard card, shuffle and return as new deck
  const topDiscard = discardPile[discardPile.length - 1];
  let reshuffleCards = discardPile.slice(0, discardPile.length - 1);
  reshuffleCards = shuffle(reshuffleCards);

  return reshuffleCards;
}

// Called after player picks color for wild cards
async function finishWildCardPlay(chosenColor) {
  if (!pendingWildCard) return;

  const {
    roomData,
    roomRef,
    updatedPlayers,
    newDiscardPile,
    playerId,
    cardToPlay,
    activityEntry,
    playerIds,
    currentIndex,
    direction,
  } = pendingWildCard;

  let nextTurnId = null;

  // Update activity with chosen color
  let updatedActivityEntry = `${activityEntry} - color chosen: ${chosenColor}`;

  // For wild4 cards: next player draws 4 and loses turn
  if (cardToPlay.value === 'wild4') {
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];

    // Draw 4 cards for next player
    let deck = [...roomData.deck];
    if (deck.length < 4) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);

    let drawnCards = deck.splice(0, 4);

    updatedPlayers[nextTurnId] = {
      ...roomData.players[nextTurnId],
      hand: [...roomData.players[nextTurnId].hand, ...drawnCards],
    };

    await roomRef.update({ deck });

    // Skip next player's turn by advancing turn another step
    nextTurnId = playerIds[(playerIds.indexOf(nextTurnId) + direction + playerIds.length) % playerIds.length];

  } else {
    // Wild card (no draw) - just next player's turn
    nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
  }

  // Update Firestore with all info
  await roomRef.update({
    players: updatedPlayers,
    discardPile: newDiscardPile,
    currentColor: chosenColor,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(updatedActivityEntry),
  });

  pendingWildCard = null;
  colorModal.classList.add('hidden');
}

// Event listener for color buttons in modal
colorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const chosenColor = btn.getAttribute('data-color');
    finishWildCardPlay(chosenColor);
  });
});

closeModalBtn.addEventListener('click', () => {
  colorModal.classList.add('hidden');
  pendingWildCard = null;
});

// Draw card from deck and add to player's hand
drawCardBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const roomData = roomDoc.data();

  if (roomData.currentTurn !== playerId) {
    alert("It's not your turn.");
    return;
  }

  let deck = [...roomData.deck];
  let discardPile = [...roomData.discardPile];
  if (deck.length === 0) {
    deck = reshuffleDiscardIntoDeck(deck, discardPile);
  }

  if (deck.length === 0) {
    alert('No cards left to draw!');
    return;
  }

  // Draw one card
  const drawnCard = deck.shift();

  // Add card to player's hand
  let updatedPlayers = { ...roomData.players };
  updatedPlayers[playerId] = {
    ...roomData.players[playerId],
    hand: [...roomData.players[playerId].hand, drawnCard],
  };

  // Advance turn to next player (after drawing)
  const playerIds = Object.keys(roomData.players);
  const currentIndex = playerIds.indexOf(playerId);
  const nextIndex = (currentIndex + roomData.direction + playerIds.length) % playerIds.length;
  const nextTurnId = playerIds[nextIndex];

  await roomRef.update({
    players: updatedPlayers,
    deck,
    currentTurn: nextTurnId,
    activityLog: firebase.firestore.FieldValue.arrayUnion(`${roomData.players[playerId].name} drew a card and ended their turn`),
  });
});

// ======================= CALL UNO BUTTON =======================

callUnoBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const roomData = roomDoc.data();

  const playerData = roomData.players[playerId];
  if (!playerData) return;

  if (playerData.hand.length === 1) {
    // Player calls UNO
    const updatedPlayers = { ...roomData.players };
    updatedPlayers[playerId] = {
      ...playerData,
      calledUno: true,
    };
    await roomRef.update({
      players: updatedPlayers,
      activityLog: firebase.firestore.FieldValue.arrayUnion(`${playerData.name} called UNO!`),
    });
  } else {
    alert("You can only call UNO when you have exactly one card!");
  }
});

// ======================= CHAT =======================

sendChatBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const text = chatInput.value.trim();
  if (!text) return;

  const chatRef = db.collection('rooms').doc(currentRoomId).collection('chat');
  await chatRef.add({
    playerId,
    playerName,
    message: text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });

  chatInput.value = '';
});

function appendChatMessage({ playerName, message }) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${playerName}:</strong> ${message}`;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ======================= LEAVE ROOM =======================

leaveRoomBtn.addEventListener('click', async () => {
  if (!currentRoomId || !playerId) return;

  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;

  const roomData = roomDoc.data();

  // Remove player from players list
  const updatedPlayers = { ...roomData.players };
  delete updatedPlayers[playerId];

  // If no players left, delete room
  if (Object.keys(updatedPlayers).length === 0) {
    await roomRef.delete();
  } else {
    // Update room players
    await roomRef.update({ players: updatedPlayers });

    // If it was this player's turn, move turn to next player
    if (roomData.currentTurn === playerId) {
      const playerIds = Object.keys(updatedPlayers);
      let idx = playerIds.indexOf(playerId);
      if (idx === -1) idx = 0;
      const nextTurnId = playerIds[(idx + roomData.direction + playerIds.length) % playerIds.length];
      await roomRef.update({ currentTurn: nextTurnId });
    }
  }

  // Unsubscribe listeners
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
