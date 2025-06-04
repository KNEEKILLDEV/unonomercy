// script.js

// 1) Firebase config & initialize
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

// 2) DOM references
const playerNameInput    = document.getElementById("playerNameInput");
const roomInput          = document.getElementById("roomInput");
const maxPlayersInput    = document.getElementById("maxPlayersInput");
const createRoomBtn      = document.getElementById("createRoomBtn");
const joinRoomBtn        = document.getElementById("joinRoomBtn");
const drawCardBtn        = document.getElementById("drawCardBtn");
const unoBtn             = document.getElementById("unoBtn");
const sendChatBtn        = document.getElementById("sendChatBtn");
const chatInput          = document.getElementById("chatInput");
const restartBtn         = document.getElementById("restartBtn");
const colorModal         = document.getElementById("colorModal");
const colorOptions       = document.querySelectorAll(".color-option");
const joinMsg            = document.getElementById("joinMsg");

const lobbyDiv           = document.getElementById("lobby");
const gameDiv            = document.getElementById("game");
const roomNameLabel      = document.getElementById("roomNameLabel");
const turnLabel          = document.getElementById("turnLabel");
const playerHandDiv      = document.getElementById("playerHand");
const discardPileDiv     = document.getElementById("discardPile");
const opponentsContainer = document.getElementById("opponentsContainer");
const spectatorsContainer = document.getElementById("spectatorsContainer");
const activityLogUL      = document.getElementById("activityLog");
const chatMessagesDiv    = document.getElementById("chatMessages");
const gameOverBanner     = document.getElementById("gameOverBanner");
const winnerText         = document.getElementById("winnerText");

// 3) Global state
let playerName = "";
let playerId   = "";
let roomId     = "";
let gameState  = {
  players: {},
  spectators: {},
  seatOrder: [],
  direction: 1
};
let pendingWild = null;
let unoTimeout = null;
let turnTimer = null;

// 4) Utility: generate random ID
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// 5) On load, attempt to reattach using localStorage
window.addEventListener("load", () => {
  const savedRoom = localStorage.getItem("uno_roomId");
  const savedPlayer = localStorage.getItem("uno_playerId");
  const savedName = localStorage.getItem("uno_playerName");
  if (savedRoom && savedPlayer && savedName) {
    roomId = savedRoom;
    playerId = savedPlayer;
    playerName = savedName;
    lobbyDiv.style.display = "none";
    gameDiv.style.display = "block";
    roomNameLabel.textContent = roomId;
    initializeGameListener();
    initializeChatListener();
    initializeBackupCleanup();
  }
});

// 6) Log an activity entry
function logActivity(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  activityLogUL.appendChild(li);
  activityLogUL.scrollTop = activityLogUL.scrollHeight;
}

// 7) Post a chat message
function postChat(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  chatMessagesDiv.appendChild(div);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// 8) Create a card element for UI
function createCardElement(card) {
  const div = document.createElement("div");
  div.className = `card ${card.color}`;
  div.textContent = card.value;
  div.onclick = () => attemptPlayCard(card);
  return div;
}

// 9) Render the player's hand and start UNO timer
function renderHand(cards) {
  playerHandDiv.innerHTML = "";
  if (!cards) return;
  cards.forEach(card => {
    const el = createCardElement(card);
    if (gameState.turn.id === playerId && canPlayCard(card)) el.classList.add("playable");
    else el.classList.add("unplayable");
    playerHandDiv.appendChild(el);
  });
  const pdata = gameState.players[playerId];
  if (pdata && pdata.hand.length === 1 && !pdata.calledUNO) {
    unoBtn.classList.remove("disabled");
    if (!unoTimeout) {
      unoTimeout = setTimeout(() => {
        if (gameState.players[playerId].hand.length === 1 && !gameState.players[playerId].calledUNO) {
          drawCardsFor(playerId, 2);
          db.ref(`rooms/${roomId}/log/${Date.now()}`).set(
            `${playerName} failed to call UNO, drew 2`
          );
        }
        unoBtn.classList.add("disabled");
        unoTimeout = null;
      }, 5000);
    }
  } else {
    unoBtn.classList.add("disabled");
    if (unoTimeout) {
      clearTimeout(unoTimeout);
      unoTimeout = null;
    }
  }
}

// 10) Render opponents
function renderOpponents(players) {
  opponentsContainer.innerHTML = "";
  Object.entries(players).forEach(([id, player]) => {
    if (id === playerId) return;
    const div = document.createElement("div");
    div.className = "opponent";
    const count = player.hand ? player.hand.length : 0;
    div.textContent = `${player.name} — ${count} cards`;
    if (gameState.turn.id === id) {
      div.classList.add("current-turn");
    }
    opponentsContainer.appendChild(div);
  });
}

// 11) Render spectators
function renderSpectators(spectators) {
  spectatorsContainer.innerHTML = "";
  Object.entries(spectators || {}).forEach(([id, spec]) => {
    const div = document.createElement("div");
    div.className = "spectator";
    div.textContent = `${spec.name} (spectator)`;
    spectatorsContainer.appendChild(div);
  });
}

// 12) Render discard pile
function renderDiscard(card) {
  discardPileDiv.innerHTML = "";
  if (!card) return;
  const topCard = createCardElement(card);
  topCard.onclick = null;
  discardPileDiv.appendChild(topCard);
  if (card.color === "wild" && card.chosenColor) {
    const dot = document.createElement("div");
    dot.className = "chosen-color-indicator";
    dot.style.background = card.chosenColor;
    discardPileDiv.appendChild(dot);
  }
}

// 13) Build and shuffle a full deck
function createDeck() {
  const colors = ["red","green","blue","yellow"];
  const values = ["0","1","2","3","4","5","6","7","8","9","Skip","Reverse","+2"];
  const deck = [];
  colors.forEach(color => {
    values.forEach(value => {
      deck.push({ color, value });
      if (value !== "0") deck.push({ color, value });
    });
  });
  const wilds = ["Wild","+4"];
  for (let i = 0; i < 4; i++) {
    wilds.forEach(v => deck.push({ color:"wild", value:v }));
  }
  return deck.sort(() => Math.random() - 0.5);
}

// 14) Deal 7 cards to each player in “players”
function dealCards(deck, players) {
  Object.keys(players).forEach(pid => {
    players[pid].hand = deck.splice(0, 7);
    players[pid].calledUNO = false;
  });
  return deck;
}

// 15) Check if a card is playable
function canPlayCard(card) {
  if (!gameState.gameStarted || gameState.gameOver) return false;
  const top = gameState.discard;
  if (!top) return true;
  if (top.color === "wild" && top.chosenColor) {
    if (card.color === top.chosenColor) return true;
    if (card.color === "wild") return true;
    return false;
  }
  if (top.value === "+2") {
    if (card.value === "+2") return true;
    return false;
  }
  if (top.value === "+4") {
    if (card.value === "+4") return true;
    return false;
  }
  if (card.color === "wild") return true;
  if (card.color === top.color) return true;
  if (card.value === top.value) return true;
  return false;
}

// 16) Determine next player by seatOrder
function getNextPlayerId(afterSkip = 0) {
  const seats = gameState.seatOrder || [];
  const idx = seats.indexOf(gameState.turn.id);
  const step = gameState.direction * (1 + afterSkip);
  const next = (idx + step + seats.length) % seats.length;
  const pid = seats[next];
  return { id: pid, name: gameState.players[pid].name };
}

// 17) Attempt to play a card
function attemptPlayCard(card) {
  if (!gameState.gameStarted) {
    alert("Game has not started yet.");
    return;
  }
  if (gameState.turn.id !== playerId) {
    alert("Not your turn!");
    return;
  }
  if (!canPlayCard(card)) {
    alert("Illegal move!");
    return;
  }

  // If wild, open modal
  if (card.color === "wild" && !pendingWild) {
    pendingWild = { color: "wild", value: card.value };
    colorModal.style.display = "flex";
    return;
  }
  if (pendingWild) {
    card = { ...pendingWild, chosenColor: card.chosenColor };
    pendingWild = null;
  }

  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.transaction(room => {
    if (!room) return;
    if (room.turn.id !== playerId) return;

    const hand = room.players[playerId].hand || [];
    const idx = hand.findIndex(c => c.color === card.color && c.value === card.value);
    if (idx === -1) return;

    hand.splice(idx, 1);
    room.players[playerId].hand = hand;
    room.players[playerId].calledUNO = false;

    if (!room.discardPileBackup) room.discardPileBackup = {};
    room.discardPileBackup[Date.now()] = room.discard;
    room.discard = card;

    if (card.value === "Skip") {
      const next = getNextPlayerId(1);
      room.turn = next;
      if (!room.log) room.log = {};
      room.log[Date.now()] = `${playerName} played Skip, skipped ${room.players[getNextPlayerId(0).id].name}`;
    }
    else if (card.value === "Reverse") {
      room.direction = (room.direction || 1) * -1;
      if (room.seatOrder.length === 2) {
        const next2 = getNextPlayerId(1);
        room.turn = next2;
      } else {
        const next = getNextPlayerId(0);
        room.turn = next;
      }
      if (!room.log) room.log = {};
      room.log[Date.now()] = `${playerName} played Reverse`;
    }
    else if (card.value === "+2") {
      const next = getNextPlayerId(0);
      const nextHand = room.players[next.id].hand || [];
      const hasPlus2 = nextHand.some(c => c.value === "+2");
      if (hasPlus2) {
        room.turn = next;
        if (!room.log) room.log = {};
        room.log[Date.now()] = `${playerName} played +2, waiting for ${next.name} to stack`;
      } else {
        const nextAfter = getNextPlayerId(1);
        room.turn = nextAfter;
        if (!room.log) room.log = {};
        room.log[Date.now()] = `${playerName} played +2, ${room.players[next.id].name} drew 2`;
        const drawCards = room.deck.splice(0, 2);
        room.players[next.id].hand.push(...drawCards);
        if (room.deck.length === 0) room.needReshuffle = true;
      }
    }
    else if (card.value === "+4") {
      const next = getNextPlayerId(0);
      const nextHand = room.players[next.id].hand || [];
      const hasPlus4 = nextHand.some(c => c.value === "+4");
      if (hasPlus4) {
        room.turn = next;
        if (!room.log) room.log = {};
        room.log[Date.now()] = `${playerName} played +4, waiting for ${next.name} to stack`;
      } else {
        const nextAfter = getNextPlayerId(1);
        room.turn = nextAfter;
        if (!room.log) room.log = {};
        room.log[Date.now()] = `${playerName} played +4, ${room.players[next.id].name} drew 4`;
        const drawCards = room.deck.splice(0, 4);
        room.players[next.id].hand.push(...drawCards);
        if (room.deck.length === 0) room.needReshuffle = true;
      }
    }
    else {
      const next = getNextPlayerId(0);
      room.turn = next;
      if (!room.log) room.log = {};
      room.log[Date.now()] = `${playerName} played ${card.color} ${card.value}`;
    }

    if (hand.length === 0) {
      room.gameOver = true;
      room.winner = playerName;
    }
    return room;
  });
}

// 18) Draw cards for a player with transaction & reshuffle
function drawCardsFor(pid, count) {
  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.transaction(room => {
    if (!room) return;
    if (room.needReshuffle) {
      const backupCards = Object.values(room.discardPileBackup || {});
      room.discardPileBackup = {};
      if (room.discard) backupCards.push(room.discard);
      const newDeck = backupCards.sort(() => Math.random() - 0.5);
      room.deck = newDeck;
      room.needReshuffle = false;
    }
    if (!room.deck || room.deck.length < count) return;
    const drawCards = room.deck.splice(0, count);
    room.players[pid].hand.push(...drawCards);
    return room;
  });
}

// 19) Draw single card via button
drawCardBtn.onclick = () => {
  if (!gameState || !gameState.gameStarted) {
    alert("Game has not started.");
    return;
  }
  if (gameState.turn.id !== playerId) {
    alert("Not your turn!");
    return;
  }
  drawCardsFor(playerId, 1);
  const next = getNextPlayerId(0);
  db.ref(`rooms/${roomId}/turn`).set(next);
  db.ref(`rooms/${roomId}/log/${Date.now()}`).set(`${playerName} drew a card`);
};

// 20) UNO button logic
unoBtn.onclick = () => {
  if (!gameState) return;
  if (gameState.players[playerId].hand.length === 1) {
    db.ref(`rooms/${roomId}/players/${playerId}/calledUNO`).set(true);
    unoBtn.classList.add("disabled");
    logActivity(`${playerName} called UNO!`);
  }
};

// 21) Send chat
sendChatBtn.onclick = sendChatMessage;
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendChatMessage();
});
function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !roomId) return;
  db.ref(`rooms/${roomId}/chat/${Date.now()}`).set(`${playerName}: ${msg}`);
  pruneChat();
  chatInput.value = "";
}

// 22) Prune chat to last 200 messages
function pruneChat() {
  db.ref(`rooms/${roomId}/chat`).once("value").then(snap => {
    const msgs = Object.entries(snap.val() || {});
    if (msgs.length > 200) {
      const sorted = msgs.sort((a,b) => Number(a[0]) - Number(b[0]));
      const toRemove = sorted.slice(0, msgs.length - 200);
      toRemove.forEach(([key]) => {
        db.ref(`rooms/${roomId}/chat/${key}`).remove();
      });
    }
  });
}

// 23) End game
function endGame(winner) {
  db.ref(`rooms/${roomId}/gameOver`).set(true);
  db.ref(`rooms/${roomId}/winner`).set(winner);
}

// 24) Restart game
restartBtn.onclick = () => {
  db.ref(`rooms/${roomId}`).remove();
  localStorage.removeItem("uno_roomId");
  localStorage.removeItem("uno_playerId");
  localStorage.removeItem("uno_playerName");
  location.reload();
};

// 25) Initialize game listener
function initializeGameListener() {
  if (!roomId) return;

  db.ref(`rooms/${roomId}/players/${playerId}/connected`).onDisconnect().set(false);
  db.ref(`rooms/${roomId}/players/${playerId}/connected`).set(true);

  db.ref(`rooms/${roomId}/players`).on("value", snap => {
    const players = snap.val() || {};
    if (!players[playerId]) {
      // became spectator or removed
      if (gameState && gameState.gameStarted) {
        // if removed mid-game, return to lobby
        location.reload();
      }
      return;
    }
    gameState.players = players;
    renderHand(players[playerId].hand || []);
    renderOpponents(players);
    if (gameState.turn && gameState.turn.id === playerId) {
      const pdata = players[playerId];
      if (pdata.hand.length === 1 && !pdata.calledUNO) {
        drawCardsFor(playerId, 2);
        db.ref(`rooms/${roomId}/log/${Date.now()}`).set(
          `${playerName} failed to call UNO, drew 2`
        );
      }
    }
  });

  db.ref(`rooms/${roomId}/spectators`).on("value", snap => {
    renderSpectators(snap.val());
  });

  db.ref(`rooms/${roomId}/turn`).on("value", snap => {
    const turn = snap.val();
    if (!turn) return;
    gameState.turn = turn;
    turnLabel.textContent = `Turn: ${turn.name}`;

    if (turnTimer) clearTimeout(turnTimer);
    turnTimer = setTimeout(() => {
      if (!gameState.gameOver && gameState.turn.id === turn.id) {
        const skip = getNextPlayerId(0);
        db.ref(`rooms/${roomId}/turn`).set(skip);
        db.ref(`rooms/${roomId}/log/${Date.now()}`).set(
          `${gameState.players[turn.id].name} timed out, skipped`
        );
      }
    }, 60000);

    if (gameState.gameStarted && turn.id === playerId && !gameState.gameOver) {
      drawCardBtn.classList.remove("disabled");
    } else {
      drawCardBtn.classList.add("disabled");
    }
  });

  db.ref(`rooms/${roomId}/discard`).on("value", snap => {
    const card = snap.val();
    gameState.discard = card;
    renderDiscard(card);
  });

  db.ref(`rooms/${roomId}/direction`).on("value", snap => {
    gameState.direction = snap.val() || 1;
  });

  db.ref(`rooms/${roomId}/seatOrder`).on("value", snap => {
    gameState.seatOrder = snap.val() || [];
  });

  db.ref(`rooms/${roomId}/gameStarted`).on("value", snap => {
    gameState.gameStarted = snap.val();
  });

  db.ref(`rooms/${roomId}/gameOver`).on("value", snap => {
    const over = snap.val();
    if (over) {
      db.ref(`rooms/${roomId}/winner`).once("value").then(snap2 => {
        winnerText.textContent = `${snap2.val()} wins!`;
        gameOverBanner.style.display = "block";
        drawCardBtn.classList.add("disabled");
        unoBtn.classList.add("disabled");
      });
    } else {
      gameOverBanner.style.display = "none";
    }
  });

  db.ref(`rooms/${roomId}/log`).on("child_added", snap => {
    logActivity(snap.val());
    pruneLog();
  });
}

// 26) Prune log to last 200 entries
function pruneLog() {
  db.ref(`rooms/${roomId}/log`).once("value").then(snap => {
    const entries = Object.entries(snap.val() || {});
    if (entries.length > 200) {
      const sorted = entries.sort((a,b) => Number(a[0]) - Number(b[0]));
      const toRemove = sorted.slice(0, entries.length - 200);
      toRemove.forEach(([key]) => {
        db.ref(`rooms/${roomId}/log/${key}`).remove();
      });
    }
  });
}

// 27) Clean up discard backup
function initializeBackupCleanup() {
  db.ref(`rooms/${roomId}/discardPileBackup`).on("value", snap => {
    const backup = snap.val() || {};
    const keys = Object.keys(backup);
    if (keys.length > 108) {
      const sorted = keys.sort((a, b) => Number(a) - Number(b));
      const toRemove = sorted.slice(0, keys.length - 108);
      toRemove.forEach(key => {
        db.ref(`rooms/${roomId}/discardPileBackup/${key}`).remove();
      });
    }
  });
}

// 28) Initialize chat listener (with pruning)
function initializeChatListener() {
  if (!roomId) return;
  db.ref(`rooms/${roomId}/chat`).off();
  db.ref(`rooms/${roomId}/chat`).on("child_added", snap => {
    postChat(snap.val());
    pruneChat();
  });
}

// 29) Create-room workflow
createRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId     = roomInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!playerName || !roomId || !maxPlayers) {
    joinMsg.textContent = "Enter name, room ID, and max players.";
    return;
  }
  playerId = generateId();

  localStorage.setItem("uno_roomId", roomId);
  localStorage.setItem("uno_playerId", playerId);
  localStorage.setItem("uno_playerName", playerName);

  const deck = createDeck();
  const discard = deck.pop();
  const players = {};
  players[playerId] = { name: playerName, hand: [], calledUNO: false, connected: true };

  db.ref(`rooms/${roomId}`).set({
    seatOrder: [playerId],
    players,
    spectators: {},
    deck,
    discard,
    turn: { id: playerId, name: playerName },
    direction: 1,
    maxPlayers,
    gameStarted: false,
    gameOver: false,
    log: {},
    chat: {},
    discardPileBackup: {}
  });

  lobbyDiv.style.display = "none";
  gameDiv.style.display = "block";
  roomNameLabel.textContent = roomId;
  turnLabel.textContent = "Waiting for players...";

  initializeGameListener();
  initializeChatListener();
  initializeBackupCleanup();
};

// 30) Join-room workflow
joinRoomBtn.onclick = () => {
  playerName = playerNameInput.value.trim();
  roomId     = roomInput.value.trim();
  if (!playerName || !roomId) {
    joinMsg.textContent = "Enter name and room ID.";
    return;
  }
  playerId = generateId();

  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.transaction(room => {
    if (!room) return;
    if (!room.players) room.players = {};
    if (!room.spectators) room.spectators = {};
    if (!room.seatOrder) room.seatOrder = [];

    if (!room.gameStarted && Object.keys(room.players).length < room.maxPlayers) {
      room.players[playerId] = { name: playerName, hand: [], calledUNO: false, connected: true };
      room.seatOrder.push(playerId);
      if (Object.keys(room.players).length === room.maxPlayers) {
        room.gameStarted = true;
        let newDeck = (room.deck || []).sort(() => Math.random() - 0.5);
        newDeck = dealCards(newDeck, room.players);
        room.discard = newDeck.pop();
        room.deck = newDeck;
      }
    } else if (room.gameStarted) {
      room.spectators[playerId] = { name: playerName };
    } else {
      return;
    }
    return room;
  }, (error, committed) => {
    if (!committed) {
      joinMsg.textContent = "Cannot join (room is full or doesn’t exist).";
      return;
    }
    localStorage.setItem("uno_roomId", roomId);
    localStorage.setItem("uno_playerId", playerId);
    localStorage.setItem("uno_playerName", playerName);

    lobbyDiv.style.display = "none";
    gameDiv.style.display = "block";
    initializeGameListener();
    initializeChatListener();
    initializeBackupCleanup();
  });
};

// 31) Color modal handling
colorOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    const color = btn.getAttribute("data-color");
    if (pendingWild) {
      pendingWild.chosenColor = color;
      colorModal.style.display = "none";
      attemptPlayCard(pendingWild);
      pendingWild = null;
    }
  });
});
