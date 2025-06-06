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
let pendingWildCard = null;   // For wild/wild4 until color chosen
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
const challengeBtn       = document.getElementById('challengeBtn');
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

// ======================= AUDIO ELEMENT REFERENCES =======================
const sfxCardPlay  = document.getElementById('sfxCardPlay');
const sfxCardDraw  = document.getElementById('sfxCardDraw');
const sfxUnoCall   = document.getElementById('sfxUnoCall');
const sfxWin       = document.getElementById('sfxWin');
const sfxJoinRoom  = document.getElementById('sfxJoinRoom');

// Unlock audio on first interaction to prevent autoplay errors
document.body.addEventListener('touchstart', () => {
  [sfxCardPlay, sfxCardDraw, sfxUnoCall, sfxWin, sfxJoinRoom].forEach(audio => {
    if (audio) {
      audio.play().catch(() => {});
      audio.pause();
      audio.currentTime = 0;
    }
  });
}, { once: true });

// ======================= UTILITY FUNCTIONS =======================

// Generate a random 5-character uppercase room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Generate an 8-character player ID
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

// If deck runs low, reshuffle discard pile (except the top card) back into deck
function reshuffleDiscardIntoDeck(deck, discardPile) {
  if (!Array.isArray(discardPile) || discardPile.length <= 1) return deck;
  const top = discardPile.pop();
  let extras = discardPile.slice();
  extras = shuffle(extras);
  discardPile.length = 0;
  discardPile.push(top);
  return extras;
}

// Append a message to the activity log panel
function logActivity(message) {
  const p = document.createElement('p');
  p.textContent = message;
  activityLog.appendChild(p);
}

// Append a chat message to the chat panel
function appendChatMessage({ playerName, message }) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${playerName}:</strong> ${message}`;
  p.classList.add('newMessage');
  chatLog.appendChild(p);
  p.addEventListener('animationend', () => p.classList.remove('newMessage'), { once: true });
}

// Display a validation or error message in the lobby
function showLobbyMessage(msg) {
  lobbyMessage.textContent = msg;
}

// Build a standard UNO deck and shuffle it
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

// Determine if “card” can be played on top of “topCard” given currentColor and pending draws
function canPlayCard(card, topCard, currentColor, pendingDrawCount, pendingDrawType) {
  if (pendingDrawCount > 0) {
    return card.value === pendingDrawType;
  }
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

  if (!nameVal || isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    showLobbyMessage("Enter valid name and 2–10 players.");
    return;
  }

  playerName  = nameVal;
  playerId    = generatePlayerId();
  isCreator   = true;
  const roomCode = generateRoomCode();
  currentRoomId  = roomCode;

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
    pendingDrawCount: 0,
    pendingDrawType: null,
    pendingUnoChallenge: null
  });

  // Wrap play() in try/catch so exceptions don’t block room creation
  if (sfxJoinRoom) {
    sfxJoinRoom.currentTime = 0;
    try {
      await sfxJoinRoom.play();
    } catch {
      /* ignore any autoplay errors */
    }
  }

  lobby.classList.add('hidden');
  container.classList.remove('hidden');
  container.classList.add('slideIn');
  container.addEventListener('animationend', () => {
    container.classList.remove('slideIn');
  }, { once: true });

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

  playerName    = nameVal;
  playerId      = generatePlayerId();
  isCreator     = false;
  currentRoomId = codeVal;

  await roomRef.update({
    [`players.${playerId}`]: { name: playerName, hand: [], calledUno: false }
  });

  if (sfxJoinRoom) {
    sfxJoinRoom.currentTime = 0;
    try {
      await sfxJoinRoom.play();
    } catch {
      /* ignore autoplay errors */
    }
  }

  lobby.classList.add('hidden');
  container.classList.remove('hidden');
  container.classList.add('slideIn');
  container.addEventListener('animationend', () => {
    container.classList.remove('slideIn');
  }, { once: true });

  subscribeToRoom(currentRoomId);
});

// ======================= SUBSCRIBE TO ROOM UPDATES & CHAT =======================
function subscribeToRoom(roomCode) {
  const roomRef = db.collection('rooms').doc(roomCode);

  if (gameStateUnsub) gameStateUnsub();
  if (chatUnsub) chatUnsub();

  gameStateUnsub = roomRef.onSnapshot(doc => {
    if (!doc.exists) {
      alert("Room closed.");
      leaveRoom();
      return;
    }
    const data = doc.data();
    updateGameUI(data);
  });

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
  roomCodeDisplay.textContent    = currentRoomId;
  yourNameDisplay.textContent    = playerName;
  const playerIds = Object.keys(data.players);
  playerCountDisplay.textContent = playerIds.length;
  maxPlayersDisplay.textContent  = data.maxPlayers;

  // Show whose turn it is
  if (data.currentTurn) {
    turnIndicator.textContent = `${data.players[data.currentTurn].name}'s Turn`;
  } else {
    turnIndicator.textContent = '';
  }

  // Show/hide Start & Restart buttons
  startGameBtn.style.display   = (data.creator === playerId && data.gameState === 'waiting') ? 'inline-block' : 'none';
  restartGameBtn.style.display = (data.creator === playerId && data.gameState === 'ended')  ? 'inline-block' : 'none';

  // Render opponents list
  opponentsList.innerHTML = '';
  playerIds.forEach(pid => {
    if (pid === playerId) return;
    const li = document.createElement('li');
    li.textContent = `${data.players[pid].name} (${data.players[pid].hand.length})`;
    opponentsList.appendChild(li);
  });

  // Discard Pile
  const discardArr = Array.isArray(data.discardPile) ? data.discardPile : [];
  const topCard    = discardArr.length ? discardArr[discardArr.length - 1] : null;
  if (topCard) {
    discardPileEl.textContent = topCard.value.toUpperCase();
    const displayColor = (topCard.color === 'wild') ? data.currentColor : topCard.color;
    discardPileEl.className = `card ${displayColor}`;
    const newTopKey = topCard.color + topCard.value;
    if (discardPileEl.dataset.lastTop !== newTopKey) {
      discardPileEl.dataset.lastTop = newTopKey;
      discardPileEl.classList.add('newTop');
      discardPileEl.addEventListener('animationend', () => {
        discardPileEl.classList.remove('newTop');
      }, { once: true });
    }
  } else {
    discardPileEl.textContent = '';
    discardPileEl.className = 'card';
  }

  // Player’s Hand
  const myHand = data.players[playerId]?.hand || [];
  playerHand.innerHTML = '';
  myHand.forEach(card => {
    const cardEl = document.createElement('div');
    const cardColorClass = (card.color === 'wild') ? 'wild' : card.color;
    cardEl.className = `card ${cardColorClass}`;
    cardEl.textContent = card.value.toUpperCase();
    // Add both touchstart and click for responsiveness
    cardEl.addEventListener('touchstart', () => handlePlayCard(card));
    cardEl.addEventListener('click', () => handlePlayCard(card));
    playerHand.appendChild(cardEl);
  });

  // Activity Log
  activityLog.innerHTML = '';
  (Array.isArray(data.activityLog) ? data.activityLog : []).forEach(entry => {
    logActivity(entry);
  });

  // Show Challenge button only for UNO-no-mercy
  if (
    data.pendingUnoChallenge &&
    data.currentTurn === playerId &&
    data.currentTurn !== data.pendingUnoChallenge.offender &&
    data.gameState === 'started'
  ) {
    challengeBtn.style.display = 'inline-block';
  } else {
    challengeBtn.style.display = 'none';
  }
}

// ======================= START / RESTART / LEAVE ROOM =======================

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
    activityLog: [`Game started. Top card: ${firstCard.color} ${firstCard.value}`],
    pendingDrawCount: 0,
    pendingDrawType: null,
    pendingUnoChallenge: null
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
    pendingDrawCount: 0,
    pendingDrawType: null,
    pendingUnoChallenge: null
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
      const idx = playerIds.indexOf(playerId) === -1 ? 0 : playerIds.indexOf(playerId);
      const nextTurnId = playerIds[(idx + data.direction + playerIds.length) % playerIds.length];
      await roomRef.update({ currentTurn: nextTurnId });
    }
  }

  if (gameStateUnsub) gameStateUnsub();
  if (chatUnsub) chatUnsub();

  currentRoomId = null;
  playerId      = null;
  playerName    = null;
  pendingWildCard = null;
  isCreator     = false;

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
  challengeBtn.style.display = 'none';
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
  const handSnapshot = playerData.hand.slice();
  const colorBefore   = data.currentColor;

  const hand = [...playerData.hand];
  const cardIndex = hand.findIndex(c => c.color === card.color && c.value === card.value);
  if (cardIndex === -1) {
    alert("You don't have that card.");
    return;
  }

  const discardArr = Array.isArray(data.discardPile) ? data.discardPile : [];
  const topCard    = discardArr.length ? discardArr[discardArr.length - 1] : { color: null, value: null };
  const currentColor = data.currentColor;

  const pendingDrawCount = data.pendingDrawCount || 0;
  const pendingDrawType  = data.pendingDrawType;

  if (!canPlayCard(card, topCard, currentColor, pendingDrawCount, pendingDrawType)) {
    if (pendingDrawCount > 0) {
      alert(`You must draw ${pendingDrawCount} cards or stack another "${pendingDrawType}".`);
    } else {
      alert("You can't play that card now.");
    }
    return;
  }

  // Handle stacking scenario
  if (pendingDrawCount > 0 && (card.value === 'draw2' || card.value === 'wild4')) {
    if (card.value === pendingDrawType) {
      // For draw2 stacking, play sound now
      if (card.value === 'draw2' && sfxCardPlay) {
        sfxCardPlay.currentTime = 0;
        sfxCardPlay.play();
      }
      if (card.value === 'draw2') {
        const el = Array.from(playerHand.children).find(el =>
          el.textContent.toLowerCase() === card.value.toLowerCase() && el.classList.contains(card.color)
        );
        if (el) {
          el.classList.add('played');
          el.addEventListener('animationend', () => el.classList.remove('played'), { once: true });
        }
      }

      hand.splice(cardIndex, 1);
      let updatedPlayers = { ...data.players };
      updatedPlayers[playerId] = { ...playerData, hand, calledUno: false };

      let newDiscardPile = [...discardArr, card];
      const increment = (card.value === 'draw2') ? 2 : 4;
      const newPendingCount = pendingDrawCount + increment;

      const playerIds = Object.keys(data.players);
      const currentIndex = playerIds.indexOf(playerId);
      const nextTurnId = playerIds[(currentIndex + data.direction + playerIds.length) % playerIds.length];

      if (card.value === 'draw2') {
        await roomRef.update({
          players: updatedPlayers,
          discardPile: newDiscardPile,
          pendingDrawCount: newPendingCount,
          pendingDrawType: 'draw2',
          currentTurn: nextTurnId,
          activityLog: firebase.firestore.FieldValue.arrayUnion(
            `${playerData.name} stacked Draw 2. Pending draw: ${newPendingCount}.`
          )
        });
      } else {
        // Wild4 stacking: defer until color chosen
        pendingWildCard = {
          data, roomRef, updatedPlayers, newDiscardPile,
          playerId, card, activityEntry: `${playerData.name} stacked Wild +4`,
          playerIds, currentIndex, direction,
          handSnapshot, colorBefore,
          pendingDrawCount: newPendingCount,
          pendingDrawType: 'wild4',
          pendingUnoChallenge: data.pendingUnoChallenge
        };
        colorModal.classList.remove('hidden');
      }
      return;
    }
  }

  // Normal play when no pending draw
  if (card.value !== 'wild' && card.value !== 'wild4' && card.value !== 'draw2') {
    if (sfxCardPlay) {
      sfxCardPlay.currentTime = 0;
      sfxCardPlay.play();
    }
    const matchingCardEl = Array.from(playerHand.children).find(el =>
      el.textContent.toLowerCase() === card.value.toLowerCase() && el.classList.contains(card.color)
    );
    if (matchingCardEl) {
      matchingCardEl.classList.add('played');
      matchingCardEl.addEventListener('animationend', () => {
        matchingCardEl.classList.remove('played');
      }, { once: true });
    }
  }

  hand.splice(cardIndex, 1);
  let updatedPlayers = { ...data.players };
  updatedPlayers[playerId] = { ...playerData, hand, calledUno: false };

  let newDiscardPile = [...discardArr];
  if (card.value !== 'wild' && card.value !== 'wild4') {
    newDiscardPile = [...discardArr, card];
  }

  const playerIds = Object.keys(data.players);
  const currentIndex = playerIds.indexOf(playerId);
  let direction = data.direction;
  let nextTurnId = null;
  let activityEntry = `${playerData.name} played ${card.color} ${card.value}`;

  let updatedPendingUno = null;
  const newHandLength = hand.length;
  const hadCalledUno  = playerData.calledUno;
  if (newHandLength === 1 && hadCalledUno === false) {
    updatedPendingUno = { offender: playerId };
  }

  switch (card.value) {
    case 'skip':
      nextTurnId = playerIds[(currentIndex + 2 * direction + playerIds.length) % playerIds.length];
      activityEntry += ` – skipped next player`;
      break;

    case 'reverse':
      if (playerIds.length === 2) {
        nextTurnId = playerIds[(currentIndex + 2 * direction + playerIds.length) % playerIds.length];
        activityEntry += ` – reversed (acts as skip)`;
      } else {
        direction = -direction;
        nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
        activityEntry += ` – reversed direction`;
      }
      break;

    case 'draw2':
      nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
      const newPendingCount = 2;
      if (sfxCardPlay) {
        sfxCardPlay.currentTime = 0;
        sfxCardPlay.play();
      }
      await roomRef.update({
        players: updatedPlayers,
        discardPile: newDiscardPile,
        pendingDrawCount: newPendingCount,
        pendingDrawType: 'draw2',
        currentTurn: nextTurnId,
        direction,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${activityEntry}. Pending draw: ${newPendingCount}.`
        ),
        pendingUnoChallenge: updatedPendingUno
      });
      return;

    case 'wild':
      pendingWildCard = {
        data, roomRef, updatedPlayers, newDiscardPile,
        playerId, card, activityEntry, playerIds,
        currentIndex, direction,
        handSnapshot, colorBefore,
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: updatedPendingUno
      };
      colorModal.classList.remove('hidden');
      return;

    case 'wild4':
      pendingWildCard = {
        data, roomRef, updatedPlayers, newDiscardPile,
        playerId, card, activityEntry, playerIds,
        currentIndex, direction,
        handSnapshot, colorBefore,
        pendingDrawCount: 4,
        pendingDrawType: 'wild4',
        pendingUnoChallenge: updatedPendingUno
      };
      colorModal.classList.remove('hidden');
      return;

    default:
      nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
      break;
  }

  if (newHandLength === 0) {
    if (hadCalledUno === false) {
      let deck = Array.isArray(data.deck) ? [...data.deck] : [];
      if (deck.length < 2) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
      const drawn2Penalty = deck.splice(0, Math.min(2, deck.length));
      updatedPlayers[playerId] = {
        ...updatedPlayers[playerId],
        hand: [...updatedPlayers[playerId].hand, ...drawn2Penalty]
      };

      await roomRef.update({
        players: updatedPlayers,
        deck,
        currentTurn: playerId,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${playerData.name} tried to win without saying UNO and draws 2 as penalty.`
        ),
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: null
      });
      return;
    }

    await roomRef.update({
      players: updatedPlayers,
      discardPile: newDiscardPile,
      currentColor: (card.color === 'wild') ? data.currentColor : card.color,
      currentTurn: null,
      gameState: 'ended',
      direction,
      activityLog: firebase.firestore.FieldValue.arrayUnion(`${playerData.name} wins!`),
      pendingDrawCount: 0,
      pendingDrawType: null,
      pendingUnoChallenge: null
    });
    if (sfxWin) {
      sfxWin.currentTime = 0;
      sfxWin.play();
    }
    return;
  }

  await roomRef.update({
    players: updatedPlayers,
    discardPile: newDiscardPile,
    currentColor: (card.color === 'wild') ? data.currentColor : card.color,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(activityEntry),
    pendingDrawCount: 0,
    pendingDrawType: null,
    pendingUnoChallenge: updatedPendingUno
  });
}

// ======================= FINISH WILD / WILD4 (COLOR + APPLY PENDING DRAW) =======================
async function finishWildCardPlay(chosenColor) {
  if (!pendingWildCard) return;

  const {
    data, roomRef, updatedPlayers, newDiscardPile,
    playerId, card, activityEntry, playerIds,
    currentIndex, direction,
    handSnapshot, colorBefore,
    pendingDrawCount, pendingDrawType,
    pendingUnoChallenge
  } = pendingWildCard;

  const mergedDiscardPile = [...newDiscardPile, card];
  let nextTurnId = playerIds[(currentIndex + direction + playerIds.length) % playerIds.length];
  let updatedActivityEntry = `${activityEntry} – color chosen: ${chosenColor}`;

  if (card.value === 'wild4') {
    let deck = Array.isArray(data.deck) ? [...data.deck] : [];
    if (deck.length < pendingDrawCount) deck = reshuffleDiscardIntoDeck(deck, mergedDiscardPile);
    const drawn = deck.splice(0, Math.min(pendingDrawCount, deck.length));
    const updatedPlayersDraw = { ...updatedPlayers };
    updatedPlayersDraw[nextTurnId] = {
      ...data.players[nextTurnId],
      hand: [...data.players[nextTurnId].hand, ...drawn]
    };

    await roomRef.update({
      players: updatedPlayersDraw,
      deck,
      discardPile: mergedDiscardPile,
      currentColor: chosenColor,
      currentTurn: nextTurnId,
      direction,
      activityLog: firebase.firestore.FieldValue.arrayUnion(`${updatedActivityEntry}. ${data.players[nextTurnId].name} draws ${pendingDrawCount}.`),
      pendingDrawCount: 0,
      pendingDrawType: null,
      pendingUnoChallenge
    });

    if (sfxCardPlay) {
      sfxCardPlay.currentTime = 0;
      sfxCardPlay.play();
    }

    pendingWildCard = null;
    colorModal.classList.add('hidden');
    return;
  }

  const newHand = updatedPlayers[playerId].hand;
  const hadCalledUno = data.players[playerId].calledUno;
  if (newHand.length === 0 && hadCalledUno === false) {
    let deck = Array.isArray(data.deck) ? [...data.deck] : [];
    if (deck.length < 2) deck = reshuffleDiscardIntoDeck(deck, mergedDiscardPile);
    const drawn2Penalty = deck.splice(0, Math.min(2, deck.length));
    updatedPlayers[playerId] = {
      ...updatedPlayers[playerId],
      hand: [...updatedPlayers[playerId].hand, ...drawn2Penalty]
    };

    await roomRef.update({
      players: updatedPlayers,
      deck,
      currentTurn: playerId,
      activityLog: firebase.firestore.FieldValue.arrayUnion(
        `${data.players[playerId].name} tried to win on a Wild without saying UNO and draws 2 as penalty.`
      ),
      pendingDrawCount: 0,
      pendingDrawType: null,
      pendingUnoChallenge: null
    });

    pendingWildCard = null;
    colorModal.classList.add('hidden');
    return;
  }

  await roomRef.update({
    players: updatedPlayers,
    discardPile: mergedDiscardPile,
    currentColor: chosenColor,
    currentTurn: nextTurnId,
    direction,
    activityLog: firebase.firestore.FieldValue.arrayUnion(updatedActivityEntry),
    pendingDrawCount: 0,
    pendingDrawType: null,
    pendingUnoChallenge
  });

  if (sfxCardPlay) {
    sfxCardPlay.currentTime = 0;
    sfxCardPlay.play();
  }

  pendingWildCard = null;
  colorModal.classList.add('hidden');
}

// ======================= CHALLENGE BUTTON LOGIC (UNO only) =======================
challengeBtn.addEventListener('click', async () => {
  if (!currentRoomId || !playerId) return;
  const roomRef = db.collection('rooms').doc(currentRoomId);
  const roomDoc = await roomRef.get();
  if (!roomDoc.exists) return;
  const data = roomDoc.data();

  if (data.pendingUnoChallenge
      && data.currentTurn === playerId
      && data.gameState === 'started'
  ) {
    const offenderId = data.pendingUnoChallenge.offender;
    let deck = Array.isArray(data.deck) ? [...data.deck] : [];
    let discardPile = Array.isArray(data.discardPile) ? [...data.discardPile] : [];
    if (deck.length < 2) {
      deck = reshuffleDiscardIntoDeck(deck, discardPile);
    }
    const drawn2 = deck.splice(0, Math.min(2, deck.length));

    const updatedPlayers = { ...data.players };
    updatedPlayers[offenderId] = {
      ...data.players[offenderId],
      hand: [...data.players[offenderId].hand, ...drawn2]
    };

    await roomRef.update({
      players: updatedPlayers,
      deck,
      activityLog: firebase.firestore.FieldValue.arrayUnion(
        `${data.players[playerId].name} challenged ${data.players[offenderId].name} for not calling UNO: ${data.players[offenderId].name} draws 2.`
      ),
      pendingUnoChallenge: null
    });
  }
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

  const pendingDrawCount = data.pendingDrawCount || 0;
  const pendingDrawType  = data.pendingDrawType;

  if (pendingDrawCount > 0) {
    let deck = Array.isArray(data.deck) ? [...data.deck] : [];
    let discardPile = Array.isArray(data.discardPile) ? [...data.discardPile] : [];
    if (deck.length < pendingDrawCount) {
      deck = reshuffleDiscardIntoDeck(deck, discardPile);
    }
    const drawn = deck.splice(0, Math.min(pendingDrawCount, deck.length));
    const updatedPlayers = { ...data.players };
    updatedPlayers[playerId] = {
      ...data.players[playerId],
      hand: [...data.players[playerId].hand, ...drawn]
    };

    const playerIds = Object.keys(data.players);
    const currentIndex = playerIds.indexOf(playerId);
    const nextTurnId = playerIds[(currentIndex + data.direction + playerIds.length) % playerIds.length];

    await roomRef.update({
      players: updatedPlayers,
      deck,
      currentTurn: nextTurnId,
      activityLog: firebase.firestore.FieldValue.arrayUnion(
        `${data.players[playerId].name} drew ${pendingDrawCount} cards (no stack).`
      ),
      pendingDrawCount: 0,
      pendingDrawType: null,
      pendingUnoChallenge: null
    });

    if (sfxCardDraw) {
      sfxCardDraw.currentTime = 0;
      sfxCardDraw.play();
    }
    return;
  }

  // Standard single-card draw
  if (sfxCardDraw) {
    sfxCardDraw.currentTime = 0;
    sfxCardDraw.play();
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
    activityLog: firebase.firestore.FieldValue.arrayUnion(
      `${data.players[playerId].name} drew a card and ended their turn.`
    ),
    pendingDrawCount: 0,
    pendingDrawType: null,
    pendingUnoChallenge: null
  });

  setTimeout(() => {
    const allCards = Array.from(playerHand.children);
    if (allCards.length) {
      const newlyDrawn = allCards[allCards.length - 1];
      newlyDrawn.classList.add('drawn');
      newlyDrawn.addEventListener('animationend', () => {
        newlyDrawn.classList.remove('drawn');
      }, { once: true });
    }
  }, 200);
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
    if (sfxUnoCall) {
      sfxUnoCall.currentTime = 0;
      sfxUnoCall.play();
    }
    const handCards = Array.from(playerHand.children);
    if (handCards.length === 1) {
      handCards[0].classList.add('played');
      handCards[0].addEventListener('animationend', () => {
        handCards[0].classList.remove('played');
      }, { once: true });
    }
    const updatedPlayers = { ...data.players };
    updatedPlayers[playerId] = {
      ...playerData,
      calledUno: true
    };

    await roomRef.update({
      players: updatedPlayers,
      activityLog: firebase.firestore.FieldValue.arrayUnion(`${playerData.name} called UNO!`),
      pendingUnoChallenge: null
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

// ======================= COLOR MODAL EVENT HANDLERS =======================
// Close when clicking the backdrop
colorModal.addEventListener('click', (e) => {
  if (e.target === colorModal) {
    pendingWildCard = null;
    colorModal.classList.add('hidden');
  }
});

// Handle color button clicks
colorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const chosenColor = btn.dataset.color;
    finishWildCardPlay(chosenColor);
  });
});

// Close modal via “×”
closeModalBtn.addEventListener('click', () => {
  pendingWildCard = null;
  colorModal.classList.add('hidden');
});
