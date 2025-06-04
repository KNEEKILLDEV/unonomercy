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

let roomRef;
let playerName = "";
let roomCode = "";

// DOM refs
const gameArea = document.getElementById("gameArea");
const createForm = document.getElementById("createRoomForm");
const joinForm = document.getElementById("joinRoomForm");
const colorModal = document.getElementById("colorModal");
const closeModalBtn = document.getElementById("closeModal");

// Ensure modal is hidden on load
window.addEventListener("load", () => {
  colorModal.classList.add("hidden");
});

closeModalBtn.addEventListener("click", () => {
  colorModal.classList.add("hidden");
});

// Handle Create Room
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
    gameStarted: false,
    currentColor: null,
    topCard: null
  });

  startGameUI();
});

// Handle Join Room
joinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  playerName = document.getElementById("joinName").value;
  roomCode = document.getElementById("roomCode").value.toUpperCase();
  roomRef = db.collection("rooms").doc(roomCode);

  const doc = await roomRef.get();
  if (!doc.exists) return alert("Room not found!");

  const data = doc.data();
  if (data.players.length >= data.maxPlayers) return alert("Room full!");

  await roomRef.update({
    players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, hand: [], unoCalled: false })
  });

  startGameUI();
});

// Setup game UI
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
    document.getElementById("infoCurrentPlayer").innerText = data.players[data.currentPlayerIndex]?.name || "?";

    document.getElementById("currentColor").innerText = data.currentColor || "?";
    document.getElementById("topCard").innerText = data.topCard || "?";

    renderPlayers(data.players);
  });
}

// Render players
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
        cardEl.addEventListener("click", () => handleCardPlay(card));
        handContainer.appendChild(cardEl);
      });
    } else {
      const li = document.createElement("li");
      li.innerText = `${p.name} - ${p.hand.length} cards`;
      opponentList.appendChild(li);
    }
  });
}

// Simulated card play
function handleCardPlay(card) {
  if (card.toLowerCase().includes("wild")) {
    showColorModal();
  } else {
    console.log("Play card:", card);
    // Update top card normally here
  }
}

// Show color modal
function showColorModal() {
  colorModal.classList.remove("hidden");
}

// Handle color selection
document.querySelectorAll(".color-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const selectedColor = btn.dataset.color;
    await roomRef.update({ currentColor: selectedColor });
    colorModal.classList.add("hidden");
  });
});
