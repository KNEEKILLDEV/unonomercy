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

let roomRef;
let playerName = "";
let roomCode = "";
let playerIndex = -1;

const gameArea = document.getElementById("gameArea");
const createForm = document.getElementById("createRoomForm");
const joinForm = document.getElementById("joinRoomForm");
const colorModal = document.getElementById("colorModal");
const closeModalBtn = document.getElementById("closeModal");

const infoRoomCode = document.getElementById("infoRoomCode");
const infoYourName = document.getElementById("infoYourName");
const infoCurrentPlayer = document.getElementById("infoCurrentPlayer");
const infoPlayerCount = document.getElementById("infoPlayerCount");
const infoMaxPlayers = document.getElementById("infoMaxPlayers");

const yourHandDiv = document.getElementById("yourHand");
const opponentList = document.getElementById("opponentList");

const topCardDiv = document.getElementById("topCard");
const currentColorSpan = document.getElementById("currentColor");

const startGameBtn = document.getElementById("startGameBtn");
const restartGameBtn = document.getElementById("restartGameBtn");
const drawCardBtn = document.getElementById("drawCardBtn");
const callUnoBtn = document.getElementById("callUnoBtn");

const chatMessagesDiv = document.getElementById("chatMessages");
const activityLogDiv = document.getElementById("activityLog");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

// Cards definitions (simplified for demo)
const colors = ["red", "yellow", "green", "blue"];
const numbers = [...Array(10).keys()]; // 0-9
const specialCards = ["skip", "reverse", "+2"];
const wildCards = ["wild", "wild+4"];

function createDeck() {
  let deck = [];

  colors.forEach(color => {
    numbers.forEach(num => {
      deck.push(color + " " + num);
      if (num !== 0) deck.push(color + " " + num); // two of each number except 0
    });
    specialCards.forEach(card => {
      deck.push(color + " " + card);
      deck.push(color + " " + card);
    });
  });

  wildCards.forEach(wc => {
    for(let i=0; i<4; i++) deck.push(wc);
  });

  return deck;
}

function shuffle(array) {
  for(let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Hide modal on load
window.addEventListener("load", () => {
  colorModal.classList.add("hidden");
});

// Modal close button
closeModalBtn.addEventListener("click", () => {
  colorModal.classList.add("hidden");
});

// Create Room
createForm.addEventListener("submit", async e => {
  e.preventDefault();
  playerName = document.getElementById("createName").value.trim();
  let maxPlayers = parseInt(document.getElementById("maxPlayers").value);
  if (!playerName || !maxPlayers || maxPlayers < 2 || maxPlayers > 10) {
    alert("Please enter valid name and max players (2-10).");
    return;
  }
  roomCode = Math.random().toString(36).substring(2,7).toUpperCase();
  roomRef = db.collection("rooms").doc(roomCode);

  const deck = shuffle(createDeck());

  await roomRef.set({
    maxPlayers: maxPlayers,
    players: [{ name: playerName, hand: [], unoCalled: false }],
    currentPlayerIndex: 0,
    gameStarted: false,
    currentColor: null,
    topCard: null,
    deck: deck,
    discardPile: [],
    chat: [],
    activity: []
  });

  playerIndex = 0;
  showGameUI();
});

// Join Room
joinForm.addEventListener("submit", async e => {
  e.preventDefault();
  playerName = document.getElementById("joinName").value.trim();
  roomCode = document.getElementById("roomCode").value.trim().toUpperCase();

  if (!playerName || !roomCode) {
    alert("Please enter valid name and room code.");
    return;
  }

  roomRef = db.collection("rooms").doc(roomCode);
  const doc = await roomRef.get();
  if (!doc.exists) {
    alert("Room not found!");
    return;
  }
  const data = doc.data();

  if (data.players.some(p => p.name === playerName)) {
    alert("Name already taken in this room.");
    return;
  }

  if (data.players.length >= data.maxPlayers) {
    alert("Room full.");
    return;
  }

  await roomRef.update({
    players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, hand: [], unoCalled: false })
  });

  // Find this player's index
  playerIndex = data.players.length;

  showGameUI();
});

function showGameUI() {
  document.querySelector(".form-container").classList.add("hidden");
  gameArea.classList.remove("hidden");

  infoRoomCode.innerText = roomCode;
  infoYourName.innerText = playerName;

  // Listen for realtime updates
  roomRef.onSnapshot(doc => {
    const data = doc.data();
    if (!data) return;

    infoMaxPlayers.innerText = data.maxPlayers;
    infoPlayerCount.innerText = data.players.length;
    infoCurrentPlayer.innerText = data.players[data.currentPlayerIndex]?.name || "None";

    updateOpponentList(data.players);
    updateHand(data.players[playerIndex]?.hand || []);
    updateTopCard(data.topCard, data.currentColor);

    updateActivityLog(data.activity);
    updateChatLog(data.chat);

    // Disable start game button if game started or not enough players
    startGameBtn.disabled = data.gameStarted || data.players.length < 2;
  });
}

function updateOpponentList(players) {
  opponentList.innerHTML = "";
  players.forEach((p, i) => {
    if (i === playerIndex) return;
    const li = document.createElement("li");
    li.textContent = p.name + " (" + p.hand.length + " cards)";
    opponentList.appendChild(li);
  });
}

function updateHand(hand) {
  yourHandDiv.innerHTML = "";
  hand.forEach(card => {
    const cardDiv = document.createElement("div");
    cardDiv.className = "card";
    cardDiv.textContent = card;
    cardDiv.addEventListener("click", () => playCard(card));
    yourHandDiv.appendChild(cardDiv);
  });
}

function updateTopCard(topCard, currentColor) {
  topCardDiv.textContent = topCard || "?";
  currentColorSpan.textContent = currentColor || "?";
}

function updateActivityLog(activity) {
  activityLogDiv.innerHTML = "";
  activity.forEach(log => {
    const p = document.createElement("p");
    p.textContent = log;
    activityLogDiv.appendChild(p);
  });
  activityLogDiv.scrollTop = activityLogDiv.scrollHeight;
}

function updateChatLog(chat) {
  chatMessagesDiv.innerHTML = "";
  chat.forEach(msg => {
    const p = document.createElement("p");
    p.textContent = msg;
    chatMessagesDiv.appendChild(p);
  });
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Start Game button
startGameBtn.addEventListener("click", async () => {
  const doc = await roomRef.get();
  const data = doc.data();

  if (data.gameStarted) {
    alert("Game already started");
    return;
  }

  if (data.players.length < 2) {
    alert("Need at least 2 players to start.");
    return;
  }

  // Shuffle deck and distribute 7 cards to each player
  let deck = data.deck.slice();
  deck = shuffle(deck);

  const players = data.players.map(p => ({ ...p, hand: [] }));

  for (let i = 0; i < 7; i++) {
    players.forEach(p => {
      const card = deck.shift();
      p.hand.push(card);
    });
  }

  // Draw top card for discard pile which is not wild +4 or wild
  let topCard;
  do {
    topCard = deck.shift();
  } while (topCard.startsWith("wild+4") || topCard.startsWith("wild"));

  const currentColor = topCard.split(" ")[0];
  const discardPile = [topCard];

  await roomRef.update({
    players: players,
    deck: deck,
    discardPile: discardPile,
    topCard: topCard,
    currentColor: currentColor,
    gameStarted: true,
    currentPlayerIndex: 0,
    activity: firebase.firestore.FieldValue.arrayUnion("Game started!"),
  });
});

// Play card function
async function playCard(card) {
  const doc = await roomRef.get();
  const data = doc.data();

  if (data.players[data.currentPlayerIndex].name !== playerName) {
    alert("Not your turn!");
    return;
  }

  const playerHand = data.players[playerIndex].hand;

  // Check if player has the card
  if (!playerHand.includes(card)) {
    alert("You don't have this card");
    return;
  }

  // Check if card can be played (simplified check)
  if (!canPlayCard(card, data.topCard, data.currentColor)) {
    alert("You cannot play this card.");
    return;
  }

  // Remove card from hand
  playerHand.splice(playerHand.indexOf(card), 1);

  // Add card to discard pile
  const discardPile = data.discardPile;
  discardPile.push(card);

  // Update current color for wild cards
  let newColor = data.currentColor;
  if (card.startsWith("wild")) {
    // Show modal to select color
    colorModal.classList.remove("hidden");

    // Wait for color select
    const selectedColor = await new Promise(resolve => {
      const onColorClick = (e) => {
        newColor = e.target.dataset.color;
        resolve(newColor);
        colorModal.classList.add("hidden");
        colorModal.querySelectorAll(".color-btn").forEach(btn => btn.removeEventListener("click", onColorClick));
      };
      colorModal.querySelectorAll(".color-btn").forEach(btn => btn.addEventListener("click", onColorClick));
    });

    newColor = selectedColor;
  } else {
    // For normal cards, update color to card's color part
    newColor = card.split(" ")[0];
  }

  // Update players array with changed hand
  const updatedPlayers = data.players.slice();
  updatedPlayers[playerIndex].hand = playerHand;

  // Update next player index (simple increment modulo)
  let nextIndex = (data.currentPlayerIndex + 1) % updatedPlayers.length;

  await roomRef.update({
    players: updatedPlayers,
    discardPile: discardPile,
    topCard: card,
    currentColor: newColor,
    currentPlayerIndex: nextIndex,
    activity: firebase.firestore.FieldValue.arrayUnion(`${playerName} played ${card}`),
  });
}

function canPlayCard(card, topCard, currentColor) {
  if (!topCard) return true;

  if (card.startsWith("wild")) return true;

  const [cardColor, cardVal] = card.split(" ");
  const [topColor, topVal] = topCard.split(" ");

  if (cardColor === currentColor) return true;
  if (cardVal === topVal) return true;

  return false;
}

// Draw card button
drawCardBtn.addEventListener("click", async () => {
  const doc = await roomRef.get();
  const data = doc.data();

  if (data.players[data.currentPlayerIndex].name !== playerName) {
    alert("Not your turn!");
    return;
  }

  if (data.deck.length === 0) {
    alert("Deck is empty");
    return;
  }

  const newCard = data.deck[0];
  const newDeck = data.deck.slice(1);

  const updatedPlayers = data.players.slice();
  updatedPlayers[playerIndex].hand.push(newCard);

  // Move to next player after draw
  let nextIndex = (data.currentPlayerIndex + 1) % updatedPlayers.length;

  await roomRef.update({
    deck: newDeck,
    players: updatedPlayers,
    currentPlayerIndex: nextIndex,
    activity: firebase.firestore.FieldValue.arrayUnion(`${playerName} drew a card`),
  });
});

// Call UNO button (basic)
callUnoBtn.addEventListener("click", async () => {
  const doc = await roomRef.get();
  const data = doc.data();

  const player = data.players[playerIndex];
  if (player.hand.length !== 1) {
    alert("You can only call UNO when you have one card.");
    return;
  }

  await roomRef.update({
    [`players.${playerIndex}.unoCalled`]: true,
    activity: firebase.firestore.FieldValue.arrayUnion(`${playerName} called UNO!`),
  });
});

// Restart game
restartGameBtn.addEventListener("click", async () => {
  await roomRef.update({
    gameStarted: false,
    currentPlayerIndex: 0,
    deck: shuffle(createDeck()),
    discardPile: [],
    topCard: null,
    currentColor: null,
    players: firebase.firestore.FieldValue.arrayUnion(),
    activity: firebase.firestore.FieldValue.arrayUnion("Game reset."),
  });
});

// Chat send button
sendChatBtn.addEventListener("click", sendChatMessage);

// Send chat on enter
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatMessage();
  }
});

async function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  await roomRef.update({
    chat: firebase.firestore.FieldValue.arrayUnion(`${playerName}: ${msg}`)
  });
  chatInput.value = "";
}
