// script.js

// Firebase configuration
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

let playerId = "";
let playerName = "";
let roomId = "";

const colors = ["red", "green", "blue", "yellow"];
const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse", "+2"];

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function createDeck() {
  let deck = [];
  for (let color of colors) {
    for (let value of values) {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "Wild" });
    deck.push({ color: "wild", value: "+4" });
  }
  return deck.sort(() => Math.random() - 0.5);
}

function dealCards(deck, players) {
  for (let pid in players) {
    players[pid].hand = deck.splice(0, 7);
  }
  return deck;
}

function isPlayable(card, topCard) {
  return (
    card.color === topCard.color ||
    card.value === topCard.value ||
    card.color === "wild"
  );
}

function nextPlayer(game, skip = 0, reverse = false) {
  const playerIds = Object.keys(game.players);
  let index = playerIds.indexOf(game.turn.id);
  let dir = game.direction || 1;
  if (reverse) dir *= -1;

  index = (index + dir * (1 + skip) + playerIds.length) % playerIds.length;
  const nextId = playerIds[index];
  return { id: nextId, name: game.players[nextId].name, direction: dir };
}

// UI Elements
const playerNameInput = document.getElementById("playerNameInput");
const roomInput = document.getElementById("roomInput");
const maxPlayersInput = document.getElementById("maxPlayersInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const drawCardBtn = document.getElementById("drawCardBtn");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatInput = document.getElementById("chatInput");

const lobbyDiv = document.getElementById("lobby");
const gameDiv = document.getElementById("game");
const roomNameLabel = document.getElementById("roomNameLabel");
const turnLabel = document.getElementById("turnLabel");
const playerHand = document.getElementById("playerHand");
const discardPile = document.getElementById("discardPile");
const opponentsContainer = document.getElementById("opponentsContainer");
const activityLog = document.getElementById("activityLog");
const chatMessages = document.getElementById("chatMessages");

function logActivity(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  activityLog.appendChild(li);
}

function postChat(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  chatMessages.appendChild(div);
}

function createCardElement(card, onClick) {
  const div = document.createElement("div");
  div.className = `card ${card.color}`;
  div.textContent = card.value;
  if (onClick) div.onclick = onClick;
  return div;
}

function renderHand(cards, topCard, turnId) {
  playerHand.innerHTML = "";
  cards.forEach(card => {
    const playable = isPlayable(card, topCard);
    const cardEl = createCardElement(card, () => {
      if (playerId === turnId && playable) playCard(card);
    });
    if (!playable || playerId !== turnId) cardEl.classList.add("disabled");
    playerHand.appendChild(cardEl);
  });
}

function renderOpponents(players) {
  opponentsContainer.innerHTML = "";
  Object.entries(players).forEach(([id, player]) => {
    if (id !== playerId) {
      const div = document.createElement("div");
      div.className = "opponent";
      div.textContent = `${player.name} - ${player.hand.length} cards`;
      opponentsContainer.appendChild(div);
    }
  });
}

function renderDiscard(card) {
  discardPile.innerHTML = "";
  discardPile.appendChild(createCardElement(card));
}

function playCard(card) {
  db.ref(`rooms/${roomId}`).once("value").then(snap => {
    const game = snap.val();
    if (game.turn.id !== playerId) return;

    const playerHandRef = db.ref(`rooms/${roomId}/players/${playerId}/hand`);
    playerHandRef.once("value").then(handSnap => {
      const hand = handSnap.val();
      const idx = hand.findIndex(c => c.color === card.color && c.value === card.value);
      if (idx === -1) return;

      hand.splice(idx, 1);
      const updates = {};
      updates[`rooms/${roomId}/players/${playerId}/hand`] = hand;
      updates[`rooms/${roomId}/discard`] = card;

      let next = nextPlayer(game);
      let drawCount = 0;

      switch (card.value) {
        case "Skip":
          next = nextPlayer(game, 1);
          break;
        case "Reverse":
          next = nextPlayer(game, 0, true);
          updates[`rooms/${roomId}/direction`] = -game.direction || -1;
          break;
        case "+2":
          drawCount = 2;
          break;
        case "+4":
          drawCount = 4;
          break;
      }

      if (drawCount > 0) {
        const deck = game.deck;
        const drawn = deck.splice(0, drawCount);
        updates[`rooms/${roomId}/deck`] = deck;
        const nextHand = game.players[next.id].hand.concat(drawn);
        updates[`rooms/${roomId}/players/${next.id}/hand`] = nextHand;
        logActivity(`${next.name} draws ${drawCount} cards`);
      }

      updates[`rooms/${roomId}/turn`] = { id: next.id, name: next.name };

      if (hand.length === 0) {
        alert(`${playerName} wins!`);
        updates[`rooms/${roomId}/status`] = "ended";
      }

      db.ref().update(updates);
    });
  });
}

drawCardBtn.onclick = () => {
  db.ref(`rooms/${roomId}`).once("value").then(snap => {
    const game = snap.val();
    if (game.turn.id !== playerId) return;

    const deck = game.deck;
    const card = deck.shift();
    db.ref(`rooms/${roomId}/deck`).set(deck);
    db.ref(`rooms/${roomId}/players/${playerId}/hand`).once("value", snap => {
      const hand = snap.val() || [];
      hand.push(card);
      db.ref(`rooms/${roomId}/players/${playerId}/hand`).set(hand);
    });

    const next = nextPlayer(game);
    db.ref(`rooms/${roomId}/turn`).set(next);
  });
};

sendChatBtn.onclick = () => {
  const msg = `${playerName}: ${chatInput.value}`;
  db.ref(`rooms/${roomId}/chat`).push(msg);
  chatInput.value = "";
};

createRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId = roomInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!playerName || !roomId || !maxPlayers) return;

  playerId = generateId();
  const players = {};
  players[playerId] = { name: playerName, hand: [] };

  const deck = createDeck();
  const discard = deck.pop();
  const newDeck = dealCards(deck, players);

  db.ref(`rooms/${roomId}`).set({
    players,
    deck: newDeck,
    discard,
    turn: { id: playerId, name: playerName },
    maxPlayers,
    direction: 1,
    status: "waiting"
  });

  roomNameLabel.textContent = roomId;
  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
};

joinRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId = roomInput.value.trim();
  if (!playerName || !roomId) return;

  playerId = generateId();
  db.ref(`rooms/${roomId}/players/${playerId}`).set({ name: playerName, hand: [] });

  db.ref(`rooms/${roomId}/deck`).once("value", snap => {
    const deck = snap.val() || [];
    const hand = deck.splice(0, 7);
    db.ref(`rooms/${roomId}/players/${playerId}/hand`).set(hand);
    db.ref(`rooms/${roomId}/deck`).set(deck);
  });

  roomNameLabel.textContent = roomId;
  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
};

// Game Listener
firebase.database().ref("rooms").on("value", snapshot => {
  if (!roomId || !playerId) return;
  const game = snapshot.child(roomId).val();
  if (!game || !game.players[playerId]) return;

  renderHand(game.players[playerId].hand, game.discard, game.turn.id);
  renderDiscard(game.discard);
  renderOpponents(game.players);
  turnLabel.textContent = game.turn.name;
});

firebase.database().ref(`rooms/${roomId}/chat`).on("child_added", snap => {
  postChat(snap.val());
});
