// Initialize Firebase (make sure firebase scripts are included in your HTML)
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  databaseURL: "https://unonomercy-66ba7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.firebasestorage.app",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentPlayerId = null;
let currentRoomId = null;
let currentTurn = null;
let direction = 1;
let playersOrder = [];
let hands = {};
let deck = [];
let discardPile = [];

// DOM elements
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const drawCardBtn = document.getElementById('drawCardBtn');
const roomInput = document.getElementById('roomInput');
const maxPlayersInput = document.getElementById('maxPlayersInput');
const playerHandDiv = document.getElementById('playerHand');
const discardPileDiv = document.getElementById('discardPile');
const turnLabel = document.getElementById('turnLabel');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

// Generate random player ID (for demo, in prod use auth)
function generatePlayerId() {
  return 'player_' + Math.floor(Math.random() * 1000000);
}

currentPlayerId = generatePlayerId();

createRoomBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!roomId || !maxPlayers || maxPlayers < 2) {
    alert("Enter valid Room ID and minimum 2 players");
    return;
  }

  currentRoomId = roomId;

  // Create room object
  const roomData = {
    maxPlayers,
    players: {
      [currentPlayerId]: { id: currentPlayerId }
    },
    gameStarted: false
  };

  await db.ref(`rooms/${roomId}`).set(roomData);

  lobbyDiv.style.display = 'none';
  gameDiv.style.display = 'block';

  listenToRoom();
};

joinRoomBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) {
    alert("Enter Room ID to join");
    return;
  }

  const roomSnap = await db.ref(`rooms/${roomId}`).get();
  if (!roomSnap.exists()) {
    alert("Room does not exist");
    return;
  }

  const roomData = roomSnap.val();
  if (Object.keys(roomData.players).length >= roomData.maxPlayers) {
    alert("Room is full");
    return;
  }

  currentRoomId = roomId;

  // Add player to room
  await db.ref(`rooms/${roomId}/players/${currentPlayerId}`).set({ id: currentPlayerId });

  lobbyDiv.style.display = 'none';
  gameDiv.style.display = 'block';

  listenToRoom();
};

// Deck and game logic
const COLORS = ['red', 'green', 'blue', 'yellow'];
const SPECIAL_CARDS = ['skip', 'reverse', 'draw2'];
const WILD_CARDS = ['wild', 'wilddraw4', 'discardall', 'swap7', 'pass0'];

function createDeck() {
  let deck = [];
  COLORS.forEach(color => {
    deck.push({ color, type: 'number', value: 0 });
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, type: 'number', value: i });
      deck.push({ color, type: 'number', value: i });
    }
    SPECIAL_CARDS.forEach(sp => {
      deck.push({ color, type: sp });
      deck.push({ color, type: sp });
    });
  });
  for (let i = 0; i < 4; i++) {
    WILD_CARDS.forEach(wc => deck.push({ color: 'wild', type: wc }));
  }
  return shuffle(deck);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function startGame(room) {
  deck = createDeck();
  discardPile = [];
  direction = 1;
  playersOrder = Object.keys(room.players);
  hands = {};
  playersOrder.forEach(p => {
    hands[p] = deck.splice(0, 7);
  });
  discardPile.push(deck.pop());
  currentTurn = playersOrder[0];

  db.ref(`rooms/${currentRoomId}`).update({
    gameStarted: true,
    deck,
    discardPile,
    direction,
    playersOrder,
    hands,
    turn: currentTurn
  });
}

function nextTurn() {
  let currentIndex = playersOrder.indexOf(currentTurn);
  currentIndex = (currentIndex + direction + playersOrder.length) % playersOrder.length;
  currentTurn = playersOrder[currentIndex];
  db.ref(`rooms/${currentRoomId}/turn`).set(currentTurn);
}

function canPlayCard(card, topCard) {
  if (card.color === 'wild') return true;
  if (card.color === topCard.color) return true;
  if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;
  if (card.type === topCard.type && card.type !== 'number') return true;
  return false;
}

function playCard(cardIndex) {
  if (currentTurn !== currentPlayerId) {
    alert("Not your turn!");
    return;
  }
  const hand = hands[currentPlayerId];
  const card = hand[cardIndex];
  const topCard = discardPile[discardPile.length - 1];

  if (!canPlayCard(card, topCard)) {
    alert("You can't play this card!");
    return;
  }

  hand.splice(cardIndex, 1);
  discardPile.push(card);

  applyCardEffect(card);

  db.ref(`rooms/${currentRoomId}/hands/${currentPlayerId}`).set(hand);
  db.ref(`rooms/${currentRoomId}/discardPile`).set(discardPile);

  if (hand.length === 0) {
    alert(`${currentPlayerId} wins!`);
    db.ref(`rooms/${currentRoomId}/gameStarted`).set(false);
    return;
  }

  nextTurn();
}

function applyCardEffect(card) {
  switch (card.type) {
    case 'skip':
      nextTurn();
      break;
    case 'reverse':
      direction *= -1;
      break;
    case 'draw2':
      nextTurn();
      drawCardsForPlayer(currentTurn, 2);
      break;
    case 'wilddraw4':
      nextTurn();
      drawCardsForPlayer(currentTurn, 4);
      break;
    case 'discardall':
      hands[currentTurn] = [];
      db.ref(`rooms/${currentRoomId}/hands/${currentTurn}`).set([]);
      break;
    case 'swap7':
      swapHands();
      break;
    case 'pass0':
      pass0Effect();
      break;
  }
}

function drawCardsForPlayer(playerId, count) {
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) reshuffleDeck();
    const card = deck.pop();
    hands[playerId].push(card);
  }
  db.ref(`rooms/${currentRoomId}/hands/${playerId}`).set(hands[playerId]);
  db.ref(`rooms/${currentRoomId}/deck`).set(deck);
}

function reshuffleDeck() {
  const top = discardPile.pop();
  deck = shuffle(discardPile);
  discardPile = [top];
  db.ref(`rooms/${currentRoomId}/deck`).set(deck);
  db.ref(`rooms/${currentRoomId}/discardPile`).set(discardPile);
}

function swapHands() {
  const swappedHands = {};
  for (let i = 0; i < playersOrder.length; i++) {
    let nextIndex = (i + 1) % playersOrder.length;
    swappedHands[playersOrder[nextIndex]] = hands[playersOrder[i]];
  }
  hands = swappedHands;
  playersOrder.forEach(p => {
    db.ref(`rooms/${currentRoomId}/hands/${p}`).set(hands[p]);
  });
}

function pass0Effect() {
  const passedCards = {};
  playersOrder.forEach(p => {
    passedCards[p] = hands[p].shift();
  });
  playersOrder.forEach((p, i) => {
    const nextIndex = (i + 1) % playersOrder.length;
    hands[playersOrder[nextIndex]].push(passedCards[p]);
  });
  playersOrder.forEach(p => {
    db.ref(`rooms/${currentRoomId}/hands/${p}`).set(hands[p]);
  });
}

drawCardBtn.onclick = () => {
  if (currentTurn !== currentPlayerId) {
    alert("Not your turn!");
    return;
  }
  if (deck.length === 0) reshuffleDeck();
  const card = deck.pop();
  hands[currentPlayerId].push(card);
  db.ref(`rooms/${currentRoomId}/hands/${currentPlayerId}`).set(hands[currentPlayerId]);
  db.ref(`rooms/${currentRoomId}/deck`).set(deck);
  nextTurn();
};

function renderHand(cards) {
  playerHandDiv.innerHTML = '';
  cards.forEach((card, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.style.backgroundColor = card.color === 'wild' ? 'black' : card.color;
    cardDiv.style.color = card.color === 'yellow' ? 'black' : 'white';

    if (card.type === 'number') cardDiv.innerText = card.value;
    else cardDiv.innerText = card.type.toUpperCase();

    cardDiv.onclick = () => playCard(index);
    playerHandDiv.appendChild(cardDiv);
  });
}

function listenToRoom() {
  db.ref(`rooms/${currentRoomId}`).on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;

    if (!room.gameStarted && Object.keys(room.players).length === room.maxPlayers) {
      startGame(room);
      return;
    }

    if (!room.gameStarted) {
      turnLabel.innerText = `Waiting for players (${Object.keys(room.players).length}/${room.maxPlayers})`;
      return;
    }

    currentTurn = room.turn;
    playersOrder = room.playersOrder;
    hands = room.hands;
    deck = room.deck;
    discardPile = room.discardPile;
    direction = room.direction;

    turnLabel.innerText = `Current Turn: ${currentTurn}`;
    renderHand(hands[currentPlayerId]);

    discardPileDiv.innerHTML = '';
    if (discardPile && discardPile.length > 0) {
      const top = discardPile[discardPile.length - 1];
      const topDiv = document.createElement('div');
      topDiv.className = 'card';
      topDiv.style.backgroundColor = top.color === 'wild' ? 'black' : top.color;
      topDiv.style.color = top.color === 'yellow' ? 'black' : 'white';

      if (top.type === 'number') topDiv.innerText = top.value;
      else topDiv.innerText = top.type.toUpperCase();
      discardPileDiv.appendChild(topDiv);
    }
  });
}
