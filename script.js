// Firebase config (replace with your own if needed)
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  databaseURL: "https://unonomercy-66ba7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.appspot.com",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentPlayerId = Math.random().toString(36).substring(2, 9);
let currentRoomId = null;

function createRoom() {
  const roomId = document.getElementById('roomIdInput').value;
  const maxPlayers = parseInt(document.getElementById('maxPlayersInput').value);
  if (!roomId || !maxPlayers) return alert("Room ID and Max Players required");

  db.ref(`rooms/${roomId}`).set({
    maxPlayers,
    gameStarted: false,
    direction: 'clockwise',
    players: {
      [currentPlayerId]: { cards: [], name: currentPlayerId }
    },
    turn: currentPlayerId
  });

  currentRoomId = roomId;
  document.getElementById("roomLabel").innerText = `Room: ${roomId}`;
  document.getElementById("lobby").style.display = 'none';
  document.getElementById("game").style.display = 'block';
  listenToRoom();
}

function joinRoom() {
  const roomId = document.getElementById('roomIdInput').value;
  currentRoomId = roomId;

  db.ref(`rooms/${roomId}/players`).once('value', snapshot => {
    const players = snapshot.val() || {};
    const keys = Object.keys(players);
    db.ref(`rooms/${roomId}/maxPlayers`).once('value', maxSnap => {
      const max = maxSnap.val();
      if (keys.length >= max) return alert("Room is full");

      db.ref(`rooms/${roomId}/players/${currentPlayerId}`).set({ cards: [], name: currentPlayerId });

      document.getElementById("roomLabel").innerText = `Room: ${roomId}`;
      document.getElementById("lobby").style.display = 'none';
      document.getElementById("game").style.display = 'block';
      listenToRoom();
    });
  });
}

function listenToRoom() {
  db.ref(`rooms/${currentRoomId}`).on('value', snapshot => {
    const room = snapshot.val();
    if (!room) return;

    document.getElementById("turnLabel").innerText = `Current Turn: ${room.turn}`;

    const hand = room.players[currentPlayerId]?.cards || [];
    renderHand(hand);
  });
}

function drawCard() {
  const newCard = `Card-${Math.floor(Math.random() * 100)}`;
  db.ref(`rooms/${currentRoomId}/players/${currentPlayerId}/cards`).once('value', snap => {
    const cards = snap.val() || [];
    cards.push(newCard);
    db.ref(`rooms/${currentRoomId}/players/${currentPlayerId}/cards`).set(cards);
  });
}

function renderHand(cards) {
  const handDiv = document.getElementById('playerHand');
  handDiv.innerHTML = '';
  cards.forEach(card => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.innerText = card;
    handDiv.appendChild(cardDiv);
  });
}
