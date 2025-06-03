// script.js

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBWGBi2O3rRbt1bNFiqgCZ-oZ2FTRv0104",
  authDomain: "unonomercy-66ba7.firebaseapp.com",
  projectId: "unonomercy-66ba7",
  storageBucket: "unonomercy-66ba7.firebaseapp.com",
  messagingSenderId: "243436738671",
  appId: "1:243436738671:web:8bfad4bc693acde225959a",
  measurementId: "G-2DP7FTJPCR",
  databaseURL: "https://unonomercy-66ba7-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let playerId = null;
let roomId = "room1";

function joinGame() {
  const name = document.getElementById("name").value || "Player";
  playerId = "player_" + Math.random().toString(36).substr(2, 5);

  const playerRef = db.ref(`games/${roomId}/players/${playerId}`);
  playerRef.set({
    name: name,
    hand: [],
    isTurn: false
  });

  db.ref(`games/${roomId}`).on('value', (snapshot) => {
    const data = snapshot.val();
    updateGameUI(data);
  });
}

function updateGameUI(gameData) {
  const hand = gameData.players?.[playerId]?.hand || [];
  const playerHandDiv = document.getElementById("playerHand");
  const discardPileDiv = document.getElementById("discardPile");
  const turnIndicator = document.getElementById("turnIndicator");

  playerHandDiv.innerHTML = "";
  hand.forEach(card => {
    const cardDiv = document.createElement("div");
    cardDiv.className = `card ${card.color}`;
    cardDiv.innerText = card.value;
    playerHandDiv.appendChild(cardDiv);
  });

  const topCard = gameData.discardPile?.slice(-1)[0];
  discardPileDiv.innerHTML = topCard ? `<div class='card ${topCard.color}'>${topCard.value}</div>` : "";

  const currentTurn = gameData.currentTurn;
  turnIndicator.innerText = currentTurn === playerId ? "Your turn" : `Waiting for other players...`;
}

function drawCard() {
  const card = getRandomCard();
  const handRef = db.ref(`games/${roomId}/players/${playerId}/hand`);
  handRef.once('value', snapshot => {
    const currentHand = snapshot.val() || [];
    currentHand.push(card);
    handRef.set(currentHand);
  });
}

function getRandomCard() {
  const colors = ["red", "green", "blue", "yellow", "wild"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse", "+2"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const value = color === "wild" ? "+4" : values[Math.floor(Math.random() * values.length)];
  return { color, value };
}
