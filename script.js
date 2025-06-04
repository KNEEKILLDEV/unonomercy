// Firebase config
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

// Globals
let roomRef, unsubscribe;
let playerId = Date.now().toString();
let playerName = '';
let roomCode = '';
let isRoomCreator = false;

// Elements
const gameArea = document.getElementById('gameArea');
const roomForms = document.getElementById('roomForms');
const roomCodeText = document.getElementById('roomCodeText');
const yourNameText = document.getElementById('yourNameText');
const currentPlayerText = document.getElementById('currentPlayerText');
const playerCountText = document.getElementById('playerCountText');
const yourHand = document.getElementById('yourHand');
const opponentsArea = document.getElementById('opponentsArea');
const topCard = document.getElementById('topCard');
const currentColorText = document.getElementById('currentColorText');
const drawCardBtn = document.getElementById('drawCardBtn');
const callUnoBtn = document.getElementById('callUnoBtn');
const activityLog = document.getElementById('activityLog');
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const startGameBtn = document.getElementById('startGameBtn');
const restartGameBtn = document.getElementById('restartGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const colorModal = document.getElementById('colorModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const colorButtons = document.querySelectorAll('.color-btn');

// Helper
function logActivity(msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  activityLog.appendChild(p);
  activityLog.scrollTop = activityLog.scrollHeight;
}

// Join/Create
document.getElementById('createRoomBtn').onclick = async () => {
  const name = document.getElementById('createName').value.trim();
  const max = parseInt(document.getElementById('maxPlayers').value.trim());
  if (!name || !max || max < 2 || max > 10) return alert("Invalid input");
  roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
  roomRef = db.collection("rooms").doc(roomCode);
  await roomRef.set({
    players: [{ id: playerId, name, hand: [], uno: false }],
    maxPlayers: max,
    creator: playerId,
    state: 'lobby',
    deck: [],
    discard: [],
    currentColor: null,
    turnIndex: 0,
    logs: [],
    chat: []
  });
  isRoomCreator = true;
  playerName = name;
  joinRoom();
};

document.getElementById('joinRoomBtn').onclick = async () => {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('joinRoomCode').value.trim().toUpperCase();
  if (!name || !code) return alert("Invalid input");
  roomCode = code;
  roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) return alert("Room not found");
  const room = roomSnap.data();
  if (room.players.find(p => p.id === playerId)) return;
  if (room.players.length >= room.maxPlayers) return alert("Room full");
  room.players.push({ id: playerId, name, hand: [], uno: false });
  await roomRef.update({ players: room.players });
  isRoomCreator = room.creator === playerId;
  playerName = name;
  joinRoom();
};

async function joinRoom() {
  roomForms.classList.add('hidden');
  gameArea.classList.remove('hidden');
  roomCodeText.textContent = roomCode;
  yourNameText.textContent = playerName;
  unsubscribe = roomRef.onSnapshot(updateGame);
}

// Game logic
function updateGame(doc) {
  const data = doc.data();
  const players = data.players;
  const me = players.find(p => p.id === playerId);
  if (!me) return location.reload();

  playerCountText.textContent = `${players.length}/${data.maxPlayers}`;
  currentPlayerText.textContent = players[data.turnIndex]?.name || '—';

  // Game buttons
  startGameBtn.classList.toggle('hidden', !isRoomCreator || data.state !== 'lobby');
  restartGameBtn.classList.toggle('hidden', !isRoomCreator || data.state !== 'ended');

  // Cards
  yourHand.innerHTML = '';
  me.hand.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = `card ${card.color}`;
    div.textContent = card.value;
    div.onclick = () => playCard(i);
    yourHand.appendChild(div);
  });

  // Opponents
  opponentsArea.innerHTML = '';
  players.forEach(p => {
    if (p.id !== playerId) {
      const div = document.createElement('div');
      div.innerHTML = `<p>${p.name} (${p.hand.length})</p>`;
      opponentsArea.appendChild(div);
    }
  });

  // Discard
  const top = data.discard[data.discard.length - 1];
  if (top) {
    topCard.textContent = top.value;
    topCard.className = `card ${top.color}`;
  } else {
    topCard.textContent = '';
    topCard.className = 'card';
  }
  currentColorText.textContent = data.currentColor || '—';

  // Logs
  activityLog.innerHTML = '';
  data.logs?.forEach(msg => logActivity(msg));

  // Chat
  chatLog.innerHTML = '';
  data.chat?.forEach(c => {
    const p = document.createElement('p');
    p.textContent = `${c.name}: ${c.text}`;
    chatLog.appendChild(p);
  });
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Deck / shuffle
function getDeck() {
  const colors = ['red', 'green', 'blue', 'yellow'];
  const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','+2'];
  let deck = [];
  colors.forEach(color => {
    deck.push({ color, value: '0' });
    for (let i = 0; i < 2; i++) {
      values.slice(1).forEach(value => deck.push({ color, value }));
    }
  });
  for (let i = 0; i < 4; i++) deck.push({ color: 'wild', value: 'wild' }, { color: 'wild', value: '+4' });
  return shuffle(deck);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Start Game
startGameBtn.onclick = async () => {
  const snap = await roomRef.get();
  const data = snap.data();
  if (!isRoomCreator || data.state !== 'lobby') return;

  let deck = getDeck();
  let discard;
  do { discard = deck.pop(); } while (discard.color === 'wild');

  const players = data.players.map(p => ({
    ...p,
    hand: deck.splice(0, 7),
    uno: false
  }));

  await roomRef.update({
    deck,
    discard: [discard],
    currentColor: discard.color,
    players,
    state: 'playing',
    turnIndex: 0,
    logs: [`Game started. ${players[0].name}'s turn.`]
  });
};

// Play card
function playCard(index) {
  roomRef.get().then(doc => {
    const data = doc.data();
    if (data.state !== 'playing') return;
    const meIndex = data.players.findIndex(p => p.id === playerId);
    if (meIndex !== data.turnIndex) return;

    const player = data.players[meIndex];
    const card = player.hand[index];
    const top = data.discard[data.discard.length - 1];

    if (card.color !== data.currentColor && card.color !== 'wild' && card.value !== top.value) return;

    const hand = [...player.hand];
    hand.splice(index, 1);
    data.players[meIndex].hand = hand;

    data.discard.push(card);
    data.currentColor = card.color === 'wild' ? null : card.color;

    let next = (data.turnIndex + 1) % data.players.length;
    let log = `${player.name} played ${card.value}.`;

    if (card.value === 'reverse') {
      data.players.reverse();
      next = data.players.length - 1 - meIndex;
      log += ' Reversed!';
    } else if (card.value === 'skip') {
      next = (next + 1) % data.players.length;
      log += ' Skipped next!';
    } else if (card.value === '+2') {
      const target = data.players[next];
      target.hand.push(...data.deck.splice(0, 2));
      log += ` ${target.name} draws 2!`;
      next = (next + 1) % data.players.length;
    } else if (card.value === '+4') {
      const target = data.players[next];
      target.hand.push(...data.deck.splice(0, 4));
      log += ` ${target.name} draws 4! Choose color.`;
      next = (next + 1) % data.players.length;
    }

    if (card.color === 'wild') {
      showColorModal(color => {
        data.currentColor = color;
        data.turnIndex = next;
        data.logs.push(log + ` Color set to ${color}.`);
        roomRef.update(data);
      });
    } else {
      data.turnIndex = next;
      data.logs.push(log);
      roomRef.update(data);
    }
  });
}

// Draw Card
drawCardBtn.onclick = async () => {
  const doc = await roomRef.get();
  const data = doc.data();
  if (data.state !== 'playing') return;
  const meIndex = data.players.findIndex(p => p.id === playerId);
  if (meIndex !== data.turnIndex) return;

  const card = data.deck.pop();
  data.players[meIndex].hand.push(card);
  data.logs.push(`${data.players[meIndex].name} drew a card.`);
  data.turnIndex = (data.turnIndex + 1) % data.players.length;
  await roomRef.update(data);
};

// Wild modal
function showColorModal(callback) {
  colorModal.classList.add('show');
  colorButtons.forEach(btn => {
    btn.onclick = () => {
      colorModal.classList.remove('show');
      callback(btn.dataset.color);
    };
  });
}
closeModalBtn.onclick = () => colorModal.classList.remove('show');

// Chat
sendChatBtn.onclick = async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  const snap = await roomRef.get();
  const data = snap.data();
  data.chat.push({ name: playerName, text });
  await roomRef.update({ chat: data.chat });
  chatInput.value = '';
};
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendChatBtn.click();
});

// Restart
restartGameBtn.onclick = async () => {
  if (!isRoomCreator) return;
  const snap = await roomRef.get();
  const data = snap.data();
  const resetPlayers = data.players.map(p => ({
    ...p,
    hand: [],
    uno: false
  }));
  await roomRef.update({
    players: resetPlayers,
    state: 'lobby',
    logs: [],
    chat: [],
    deck: [],
    discard: [],
    currentColor: null,
    turnIndex: 0
  });
};

// Leave
leaveRoomBtn.onclick = async () => {
  if (!roomRef) return;
  const snap = await roomRef.get();
  if (!snap.exists) return;
  const data = snap.data();
  const players = data.players.filter(p => p.id !== playerId);
  await roomRef.update({ players });
  location.reload();
};
