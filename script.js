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

let roomRef = db.collection("rooms").doc("room1"); // Placeholder, updated on create/join
let playerName = "";
let roomCode = "";

// DOM references
const gameArea = document.getElementById("gameArea");
const createForm = document.getElementById("createRoomForm");
const joinForm = document.getElementById("joinRoomForm");

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  playerName = document.getElementById("createName").value;
  const maxPlayers = parseInt(document.getElementById("maxPlayers").value);
  roomCode = Math.random().toString(36).substr(2, 5).toUpperCase();

  roomRef = db.collection("rooms").doc(roomCode);
  await roomRef.set({
    maxPlayers,
    players: [{ name: playerName, hand: [], unoCalled: false }],
    currentPlayerIndex: 0,
    gameStarted: false
  });

  startGameUI();
});

joinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  playerName = document.getElementById("joinName").value;
  roomCode = document.getElementById("roomCode").value.toUpperCase();

  roomRef = db.collection("rooms").doc(roomCode);
  const doc = await roomRef.get();

  if (!doc.exists) {
    alert("Room not found!");
    return;
  }

  const data = doc.data();
  if (data.players.length >= data.maxPlayers) {
    alert("Room full!");
    return;
  }

  await roomRef.update({
    players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, hand: [], unoCalled: false })
  });

  startGameUI();
});

function startGameUI() {
  document.querySelector(".form-container").classList.add("hidden");
  gameArea.classList.remove("hidden");

  document.getElementById("infoRoomCode").innerText = roomCode;
  document.getElementById("infoYourName").innerText = playerName;

  roomRef.onSnapshot((doc) => {
    const data = doc.data();
    if (!data) return;

    document.getElementById("infoPlayerCount").innerText = data.players.length;
    document.getElementById("infoMaxPlayers").innerText = data.maxPlayers;

    const currentPlayer = data.players[data.currentPlayerIndex];
    document.getElementById("infoCurrentPlayer").innerText = currentPlayer?.name || "?";

    renderPlayers(data.players);
  });
}

function renderPlayers(players) {
  const opponentList = document.getElementById("opponentList");
  const handContainer = document.getElementById("yourHand");
  opponentList.innerHTML = "";
  handContainer.innerHTML = "";

  players.forEach((p) => {
    if (p.name === playerName) {
      p.hand.forEach(card => {
        const cardEl = document.createElement("div");
        cardEl.classList.add("card");
        cardEl.innerText = card;
        handContainer.appendChild(cardEl);
      });
    } else {
      const li = document.createElement("li");
      li.innerText = `${p.name} - ${p.hand.length} cards`;
      opponentList.appendChild(li);
    }
  });
}

// Add additional logic for game play here: draw cards, play cards, update turns, etc.
