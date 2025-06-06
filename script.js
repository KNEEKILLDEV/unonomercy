// script.js

// Firebase configuration (v7.20.0+)
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
const db = firebase.firestore();

console.log("👉 Firebase initialized. Current project:", firebase.app().options.projectId);

document.addEventListener('DOMContentLoaded', () => {
  // ======================= GLOBAL STATE =======================
  let currentRoomId   = null;
  let playerId        = null;
  let playerName      = null;
  let pendingWildCard = null;   // Also used for Swap and Shuffle
  let isCreator       = false;
  let gameStateUnsub  = null;
  let chatUnsub       = null;

  // ======================= DOM REFERENCES =======================
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

  const logArea            = document.getElementById('logArea');
  const chatInput          = document.getElementById('chatInput');
  const sendChatBtn        = document.getElementById('sendChatBtn');

  const colorModal         = document.getElementById('colorModal');
  const colorButtons       = document.querySelectorAll('.colorBtn');
  const closeModalBtn      = document.querySelector('.closeModalBtn');

  const turnIndicator      = document.getElementById('turnIndicator');

  // ======================= AUDIO REFERENCES =======================
  const sfxCardPlay  = document.getElementById('sfxCardPlay');
  const sfxCardDraw  = document.getElementById('sfxCardDraw');
  const sfxUnoCall   = document.getElementById('sfxUnoCall');
  const sfxWin       = document.getElementById('sfxWin');
  const sfxJoinRoom  = document.getElementById('sfxJoinRoom');

  // On first touch, “unlock” audio elements
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
  function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
  }

  function generatePlayerId() {
    return Math.random().toString(36).substring(2, 10);
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function reshuffleDiscardIntoDeck(deck, discardPile) {
    if (!Array.isArray(discardPile) || discardPile.length <= 1) return deck;
    const top = discardPile.pop();
    let extras = discardPile.slice();
    extras = shuffle(extras);
    discardPile.length = 0;
    discardPile.push(top);
    return extras;
  }

  // Append chat (isChat=true) or activity (isChat=false) to #logArea
  function appendLog(message, isChat = false, playerName = "") {
    const p = document.createElement('p');
    if (isChat) {
      p.innerHTML = `<strong>${playerName}:</strong> ${message}`;
    } else {
      p.textContent = message;
    }
    p.classList.add('newMessage');
    logArea.appendChild(p);
    p.addEventListener('animationend', () => p.classList.remove('newMessage'), { once: true });
    logArea.scrollTop = logArea.scrollHeight;
  }

  function showLobbyMessage(msg) {
    lobbyMessage.textContent = msg;
  }

  // Build a standard UNO deck plus Swap + Wild Shuffle
  function generateDeck() {
    const colors = ['red', 'yellow', 'green', 'blue'];
    const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
    let deck = [];

    // Standard colored cards + one Swap per color
    colors.forEach(color => {
      deck.push({ color, value: '0' });
      values.slice(1).forEach(val => {
        deck.push({ color, value: val });
        deck.push({ color, value: val });
      });
      deck.push({ color, value: 'swap' }); // Swap Hands
    });

    // Wilds, Wild Draw Four, and four Wild Shuffle Hands
    for (let i = 0; i < 4; i++) {
      deck.push({ color: 'wild', value: 'wild' });
      deck.push({ color: 'wild', value: 'wild4' });
      deck.push({ color: 'wild', value: 'shuffle' }); // Wild Shuffle Hands
    }

    return shuffle(deck);
  }

  // Determine if a card can be played onto topCard under currentColor + pending draws
  function canPlayCard(card, topCard, currentColor, pendingDrawCount, pendingDrawType) {
    // If a draw penalty is pending, only same type can stack
    if (pendingDrawCount > 0) {
      return card.value === pendingDrawType;
    }
    // Swap Hands is wild-like: playable any time
    if (card.value === 'swap') {
      return true;
    }
    // Wild Shuffle is wild-like: playable any time
    if (card.value === 'shuffle') {
      return true;
    }
    // Standard Wild/Wild4
    if (card.color === 'wild') return true;
    // Otherwise match color or value
    return (card.color === currentColor || card.value === topCard.value);
  }

  // ======================= LOBBY: CREATE & JOIN HANDLERS =======================
  createForm.addEventListener('submit', async (e) => {
    console.log("👉 Create Room handler invoked");
    e.preventDefault();

    const nameVal    = document.getElementById('createName').value.trim();
    const maxPlayers = parseInt(document.getElementById('maxPlayers').value, 10);
    console.log("Raw inputs → nameVal:", nameVal, ", maxPlayers:", maxPlayers);

    if (!nameVal || isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
      console.log("❌ Create-Room validation failed");
      showLobbyMessage("Enter valid name and 2–10 players.");
      return;
    }
    console.log("✅ Create-Room validation passed");

    playerName  = nameVal;
    playerId    = generatePlayerId();
    isCreator   = true;
    const roomCode = generateRoomCode();
    console.log("Generated roomCode =", roomCode);
    currentRoomId  = roomCode;

    const deck = generateDeck();
    const roomRef = db.collection('rooms').doc(roomCode);

    try {
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
      console.log("✅ Firestore: Created room document with ID =", roomCode);
    } catch (err) {
      console.error("❌ Firestore error on .set():", err);
      showLobbyMessage("Could not create room. Check Firestore rules.");
      return;
    }

    if (sfxJoinRoom) {
      sfxJoinRoom.currentTime = 0;
      sfxJoinRoom.play().catch(() => {});
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
    console.log("👉 Join Room handler invoked");
    e.preventDefault();

    const nameVal = document.getElementById('joinName').value.trim();
    const codeVal = document.getElementById('joinCode').value.trim().toUpperCase();
    console.log("Raw inputs → nameVal:", nameVal, ", codeVal:", codeVal);

    if (!nameVal || !codeVal) {
      console.log("❌ Join-Room validation failed");
      showLobbyMessage("Enter valid name and room code.");
      return;
    }

    const roomRef = db.collection('rooms').doc(codeVal);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) {
      console.log("❌ Room not found for code:", codeVal);
      showLobbyMessage("Room not found.");
      return;
    }

    const data = roomDoc.data() || {};
    const playersObj = data.players || {};
    const playerCount = Object.keys(playersObj).length;
    if (playerCount >= data.maxPlayers) {
      console.log("❌ Room is full for code:", codeVal);
      showLobbyMessage("Room is full.");
      return;
    }

    playerName    = nameVal;
    playerId      = generatePlayerId();
    isCreator     = false;
    currentRoomId = codeVal;

    try {
      await roomRef.update({
        [`players.${playerId}`]: { name: playerName, hand: [], calledUno: false }
      });
      console.log("✅ Firestore: Added player to room", codeVal);
    } catch (err) {
      console.error("❌ Firestore error on join:", err);
      showLobbyMessage("Could not join room. Check Firestore rules.");
      return;
    }

    if (sfxJoinRoom) {
      sfxJoinRoom.currentTime = 0;
      sfxJoinRoom.play().catch(() => {});
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
    console.log("🔔 subscribeToRoom() called with roomCode =", roomCode);
    const roomRef = db.collection('rooms').doc(roomCode);

    if (gameStateUnsub) gameStateUnsub();
    if (chatUnsub) chatUnsub();

    gameStateUnsub = roomRef.onSnapshot(doc => {
      console.log("→ gameState onSnapshot fired, doc.exists =", doc.exists);
      if (!doc.exists) {
        alert("Room closed.");
        leaveRoom();
        return;
      }
      const data = doc.data() || {};
      updateGameUI(data);
    });

    chatUnsub = roomRef.collection('chatLog')
      .orderBy('timestamp')
      .onSnapshot(snapshot => {
        console.log("→ chatLog onSnapshot fired, changes:", snapshot.docChanges().length);
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const { playerName, message } = change.doc.data();
            appendLog(message, true, playerName);
          }
        });
      });
  }

  // ======================= UPDATE MAIN GAME UI =======================
  function updateGameUI(data) {
    console.log("📣 updateGameUI called with data:", data);

    const playersObj = data.players || {};
    const playerIds = Object.keys(playersObj);

    roomCodeDisplay.textContent    = currentRoomId || "";
    yourNameDisplay.textContent    = playerName || "";
    playerCountDisplay.textContent = playerIds.length;
    maxPlayersDisplay.textContent  = data.maxPlayers || 0;

    // If pending draw is active and it's this player's turn, override turnIndicator
    const pendingDrawCount = data.pendingDrawCount || 0;
    if (data.currentTurn === playerId && pendingDrawCount > 0) {
      turnIndicator.textContent = `Draw ${pendingDrawCount} or stack`;
    } else if (data.currentTurn) {
      turnIndicator.textContent = `${playersObj[data.currentTurn]?.name || ""}'s Turn`;
    } else {
      turnIndicator.textContent = "";
    }

    startGameBtn.style.display   = (data.creator === playerId && data.gameState === 'waiting') ? 'inline-block' : 'none';
    restartGameBtn.style.display = (data.creator === playerId && data.gameState === 'ended')  ? 'inline-block' : 'none';

    // Render opponents list
    opponentsList.innerHTML = "";
    playerIds.forEach(pid => {
      if (pid === playerId) return;
      const name = playersObj[pid]?.name || "Unknown";
      const count = Array.isArray(playersObj[pid]?.hand) ? playersObj[pid].hand.length : 0;
      const li = document.createElement('li');
      li.textContent = `${name} (${count})`;
      opponentsList.appendChild(li);
    });

    // Update discard pile display
    const discardArr = Array.isArray(data.discardPile) ? data.discardPile : [];
    const topCard    = discardArr.length ? discardArr[discardArr.length - 1] : null;
    if (topCard) {
      discardPileEl.textContent = topCard.value.toUpperCase();
      const displayColor = (topCard.color === 'wild') ? data.currentColor : topCard.color;
      discardPileEl.className = `card ${displayColor} ${topCard.value}`;
      const newTopKey = `${topCard.color}${topCard.value}`;
      if (discardPileEl.dataset.lastTop !== newTopKey) {
        discardPileEl.dataset.lastTop = newTopKey;
        discardPileEl.classList.add('newTop');
        discardPileEl.addEventListener('animationend', () => {
          discardPileEl.classList.remove('newTop');
        }, { once: true });
      }
    } else {
      discardPileEl.textContent = "";
      discardPileEl.className = "card";
    }

    // Render player's hand
    const myHand = Array.isArray(playersObj[playerId]?.hand) ? playersObj[playerId].hand : [];
    playerHand.innerHTML = "";
    myHand.forEach(card => {
      const cardEl = document.createElement('div');
      const cardColorClass = 
        (card.value === 'swap')    ? 'swap'
        : (card.value === 'shuffle') ? 'shuffle'
        : (card.color === 'wild')   ? 'wild'
        : card.color;
      cardEl.className = `card ${cardColorClass} ${card.value}`;
      cardEl.textContent = card.value.toUpperCase();
      cardEl.addEventListener('click', () => handlePlayCard(card));
      playerHand.appendChild(cardEl);
    });

    // Show last few activity entries
    if (Array.isArray(data.activityLog)) {
      data.activityLog.slice(-5).forEach(entry => {
        appendLog(entry, false);
      });
    }

    // Show/hide challenge button
    if (
      data.pendingUnoChallenge &&
      data.currentTurn === playerId &&
      data.currentTurn !== data.pendingUnoChallenge.offender &&
      data.gameState === 'started'
    ) {
      challengeBtn.style.display = "inline-block";
    } else {
      challengeBtn.style.display = "none";
    }
  }

  // ======================= START / RESTART / LEAVE ROOM =======================
  startGameBtn.addEventListener('click', async () => {
    if (!currentRoomId) return;
    const roomRef = db.collection('rooms').doc(currentRoomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) return;
    const data = roomDoc.data() || {};
    const playersObj = data.players || {};
    const playerIds = Object.keys(playersObj);

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
        ...playersObj[pid],
        hand: deck.splice(0, 7),
        calledUno: false
      };
    });

    // Ensure first face-up card is not Wild4, Wild Shuffle, or Swap
    let firstCard;
    do {
      firstCard = deck.shift();
      deck.push(firstCard);
    } while (
      (firstCard.color === 'wild' && (firstCard.value === 'wild4' || firstCard.value === 'shuffle')) ||
      firstCard.value === 'swap'
    );

    const starterColor = (firstCard.color === 'wild') ? 'red' : firstCard.color;
    const currentColor = starterColor;
    const currentTurn  = playerIds[0];

    await roomRef.update({
      players: updatedPlayers,
      deck,
      discardPile: [firstCard],
      currentColor,
      currentTurn,
      gameState: 'started',
      direction: 1,
      activityLog: firebase.firestore.FieldValue.arrayUnion(
        `Game started. Top card: ${firstCard.color} ${firstCard.value}`
      ),
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
    const data = roomDoc.data() || {};
    if (data.gameState !== 'ended') {
      alert("Game not over yet.");
      return;
    }

    let deck = generateDeck();
    const updatedPlayers = {};
    const playersObj = data.players || {};
    Object.keys(playersObj).forEach(pid => {
      updatedPlayers[pid] = {
        ...playersObj[pid],
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
    const data = roomDoc.data() || {};
    const playersObj = data.players || {};

    // Remove this player from Firestore
    const updatedPlayers = { ...playersObj };
    delete updatedPlayers[playerId];

    const remainingIds = Object.keys(updatedPlayers);
    if (remainingIds.length === 0) {
      // Last player leaving: delete room entirely
      await roomRef.delete();
    } else {
      // Update players map first
      await roomRef.update({ players: updatedPlayers });

      // If the leaving player was currentTurn, pass turn to next
      if (data.currentTurn === playerId) {
        // Simply hand turn to the first remaining player
        const nextTurnId = remainingIds[0];
        await roomRef.update({ currentTurn: nextTurnId });
      }
    }

    // Unsubscribe listeners
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
    opponentsList.innerHTML = "";
    discardPileEl.textContent = "";
    discardPileEl.className = "card";
    playerHand.innerHTML = "";
    logArea.innerHTML = "";
    roomCodeDisplay.textContent = "";
    yourNameDisplay.textContent = "";
    playerCountDisplay.textContent = "";
    maxPlayersDisplay.textContent = "";
    turnIndicator.textContent = "";
    challengeBtn.style.display = "none";
  }

  // ======================= PLAY CARD + SPECIAL LOGIC =======================
  async function handlePlayCard(card) {
    if (!currentRoomId || !playerId) return;

    const roomRef = db.collection('rooms').doc(currentRoomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) return;
    const data = roomDoc.data() || {};
    const playersObj = data.players || {};
    const playerData = playersObj[playerId];
    if (!playerData) return;

    // If it's not your turn, do nothing
    if (data.currentTurn !== playerId) {
      alert("It's not your turn.");
      return;
    }
    // If game not started, do nothing
    if (data.gameState !== "started") {
      alert("Game not started yet.");
      return;
    }

    // Snapshot values
    const discardArr = Array.isArray(data.discardPile) ? data.discardPile : [];
    const topCard    = discardArr.length ? discardArr[discardArr.length - 1] : { color: null, value: null };
    const currentColor = data.currentColor;
    const pendingDrawCount = data.pendingDrawCount || 0;
    const pendingDrawType  = data.pendingDrawType;

    // Check canPlayCard
    if (!canPlayCard(card, topCard, currentColor, pendingDrawCount, pendingDrawType)) {
      if (pendingDrawCount > 0) {
        alert(`You must draw ${pendingDrawCount} or stack another "${pendingDrawType}".`);
      } else {
        alert("You can't play that card now.");
      }
      return;
    }

    // Copy hand and remove this card
    const handSnapshot = playerData.hand.slice();
    const hand = [...playerData.hand];
    const cardIndex = hand.findIndex(c => c.color === card.color && c.value === card.value);
    if (cardIndex === -1) {
      alert("You don't have that card.");
      return;
    }
    hand.splice(cardIndex, 1); // remove the card right away

    // Clear any old UNO challenge as soon as you play a card
    let updatedPendingUno = null;

    // If you drop to one card and haven't called UNO, flag challenge
    if (hand.length === 1 && playerData.calledUno === false) {
      updatedPendingUno = { offender: playerId };
    }

    // Build a base updatedPlayers object (with this card removed already)
    let updatedPlayers = { ...playersObj };
    updatedPlayers[playerId] = { ...playerData, hand, calledUno: false };

    // Determine nextTurn and direction updates inside each case
    const playerIds = Object.keys(playersObj);
    const dir = data.direction || 1;

    // ========== HANDLE SWAP (as Wild‐like) ==========
    if (card.value === "swap") {
      // newDiscardPile holds the Swap card in discard
      const newDiscardPile = [...discardArr, card];

      // Prepare pendingWildCard context
      pendingWildCard = {
        data, roomRef, updatedPlayers,
        newDiscardPile, playerId, card,
        playerIds, direction: dir,
        handSnapshot, colorBefore: data.currentColor,
        pendingDrawCount: 0, pendingDrawType: null,
        pendingUnoChallenge: updatedPendingUno
      };
      // Show color modal (swap also behaves like a Wild)
      colorModal.classList.remove("hidden");
      return;
    }

    // ========== HANDLE STACKING for Draw Two / Wild Draw Four ==========
    if (pendingDrawCount > 0 && (card.value === "draw2" || card.value === "wild4")) {
      if (card.value === pendingDrawType) {
        // Valid stacking
        if (card.value === "draw2" && sfxCardPlay) {
          sfxCardPlay.currentTime = 0;
          sfxCardPlay.play();
        }
        if (card.value === "draw2") {
          const el = Array.from(playerHand.children).find(elChild =>
            elChild.textContent.toLowerCase() === card.value.toLowerCase() && elChild.classList.contains(card.color)
          );
          if (el) {
            el.classList.add("played");
            el.addEventListener("animationend", () => el.classList.remove("played"), { once: true });
          }
        }

        const newDiscardPile = [...discardArr, card];
        const increment = (card.value === "draw2") ? 2 : 4;
        const newPendingCount = pendingDrawCount + increment;
        const nextTurnId = computeNextTurn(data, playerId);

        updatedPlayers[playerId] = { ...updatedPlayers[playerId], calledUno: false };

        if (card.value === "draw2") {
          await roomRef.update({
            players: updatedPlayers,
            discardPile: newDiscardPile,
            pendingDrawCount: newPendingCount,
            pendingDrawType: "draw2",
            currentTurn: nextTurnId,
            activityLog: firebase.firestore.FieldValue.arrayUnion(
              `${playerData.name} stacked Draw 2. Pending draw: ${newPendingCount}.`
            ),
            pendingUnoChallenge: updatedPendingUno
          });
        } else {
          // Wild +4 stacking: open color modal next
          pendingWildCard = {
            data, roomRef, updatedPlayers, newDiscardPile,
            playerId, card, activityEntry: `${playerData.name} stacked Wild +4`,
            playerIds, direction: dir,
            handSnapshot, colorBefore: data.currentColor,
            pendingDrawCount: newPendingCount,
            pendingDrawType: "wild4",
            pendingUnoChallenge: updatedPendingUno
          };
          colorModal.classList.remove("hidden");
        }
        return;
      }
    }

    // ========== HANDLE WILD, WILD4, WILD SHUFFLE ==========
    if (card.value === "wild") {
      updatedPlayers[playerId] = { ...updatedPlayers[playerId], calledUno: false };

      pendingWildCard = {
        data, roomRef, updatedPlayers,
        newDiscardPile: [...discardArr, card],
        playerId, card, activityEntry: `${playerData.name} played Wild`,
        playerIds, direction: dir,
        handSnapshot, colorBefore: data.currentColor,
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: updatedPendingUno
      };
      colorModal.classList.remove("hidden");
      return;
    }

    if (card.value === "wild4") {
      updatedPlayers[playerId] = { ...updatedPlayers[playerId], calledUno: false };

      pendingWildCard = {
        data, roomRef, updatedPlayers,
        newDiscardPile: [...discardArr, card],
        playerId, card, activityEntry: `${playerData.name} played Wild Draw Four`,
        playerIds, direction: dir,
        handSnapshot, colorBefore: data.currentColor,
        pendingDrawCount: 4,
        pendingDrawType: "wild4",
        pendingUnoChallenge: updatedPendingUno
      };
      colorModal.classList.remove("hidden");
      return;
    }

    if (card.value === "shuffle") {
      updatedPlayers[playerId] = { ...updatedPlayers[playerId], calledUno: false };

      pendingWildCard = {
        data, roomRef, updatedPlayers,
        newDiscardPile: [...discardArr, card],
        playerId, card, activityEntry: `${playerData.name} played Wild Shuffle Hands`,
        playerIds, direction: dir,
        handSnapshot: null, colorBefore: null,
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: null
      };
      colorModal.classList.remove("hidden");
      return;
    }

    // ========== NORMAL CARD & DRAW2 ==========
    if (card.value !== "draw2") {
      if (sfxCardPlay) {
        sfxCardPlay.currentTime = 0;
        sfxCardPlay.play();
      }
      const el = Array.from(playerHand.children).find(elChild =>
        elChild.textContent.toLowerCase() === card.value.toLowerCase() && elChild.classList.contains(card.color)
      );
      if (el) {
        el.classList.add("played");
        el.addEventListener("animationend", () => el.classList.remove("played"), { once: true });
      }
    }

    updatedPlayers[playerId] = { ...updatedPlayers[playerId], hand, calledUno: false };

    const newDiscardPile = [...discardArr, card];
    const nextTurnId = computeNextTurn(data, playerId);
    let activityEntry = `${playerData.name} played ${card.color} ${card.value}`;

    // ========== REVERSE (corrected) ==========
    if (card.value === "reverse") {
      const numPlayers = Object.keys(playersObj).length;
      const newDirection = -dir;
      let chosenNextId, logText;

      if (numPlayers === 2) {
        // In 2-player game, Reverse = Skip (same player goes again)
        chosenNextId = playerId;
        const skippedId = computeSkipId(data, playerId);
        const skippedName = playersObj[skippedId]?.name || "";
        logText = `${playerData.name} played Reverse (acts as Skip) & skipped ${skippedName}.`;
      } else {
        // 3+ players: simply flip direction
        chosenNextId = computeNextInDirection(data, playerId, newDirection);
        logText = `${playerData.name} played Reverse.`;
      }

      await roomRef.update({
        players: updatedPlayers,
        discardPile: newDiscardPile,
        currentColor: card.color,
        currentTurn: chosenNextId,
        direction: newDirection,
        activityLog: firebase.firestore.FieldValue.arrayUnion(logText),
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: updatedPendingUno
      });
      return;
    }

    // ========== SKIP ==========
    if (card.value === "skip") {
      const skippedId = computeSkipId(data, playerId);
      const skipName = playersObj[skippedId]?.name || "";
      const nextAfterSkip = computeNextTurn(data, skippedId);

      await roomRef.update({
        players: updatedPlayers,
        discardPile: newDiscardPile,
        currentColor: card.color,
        currentTurn: nextAfterSkip,
        direction: dir,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${playerData.name} played Skip & skipped ${skipName}.`
        ),  
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: updatedPendingUno
      });
      return;
    }

    // ========== DRAW TWO ==========
    if (card.value === "draw2") {
      if (sfxCardPlay) {
        sfxCardPlay.currentTime = 0;
        sfxCardPlay.play();
      }
      const draw2Count = 2;
      await roomRef.update({
        players: updatedPlayers,
        discardPile: newDiscardPile,
        currentColor: card.color,
        pendingDrawCount: draw2Count,
        pendingDrawType: "draw2",
        currentTurn: nextTurnId,
        direction: dir,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${activityEntry}. Pending draw: ${draw2Count}.`
        ),
        pendingUnoChallenge: updatedPendingUno
      });
      return;
    }

    // ========== CHECK WIN / UNO PENALTY ==========
    if (hand.length === 0) {
      if (playerData.calledUno === false) {
        // Penalty: draw 2
        let deck = Array.isArray(data.deck) ? [...data.deck] : [];
        if (deck.length < newDiscardPile.length) deck = reshuffleDiscardIntoDeck(deck, newDiscardPile);
        const penaltyDraw = deck.splice(0, Math.min(2, deck.length));
        updatedPlayers[playerId] = {
          ...updatedPlayers[playerId],
          hand: [...updatedPlayers[playerId].hand, ...penaltyDraw]
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

      // Legit win
      await roomRef.update({
        players: updatedPlayers,
        discardPile: newDiscardPile,
        currentColor: card.color,
        currentTurn: null,
        gameState: "ended",
        direction: dir,
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

    // ========== NORMAL CARD ==========
    await roomRef.update({
      players: updatedPlayers,
      discardPile: newDiscardPile,
      currentColor: card.color,
      currentTurn: nextTurnId,
      direction: dir,
      activityLog: firebase.firestore.FieldValue.arrayUnion(activityEntry),
      pendingDrawCount: 0,
      pendingDrawType: null,
      pendingUnoChallenge: updatedPendingUno
    });
  }

  // Compute next player in current direction
  function computeNextTurn(data, pid) {
    const playersObj = data.players || {};
    const playerIds = Object.keys(playersObj);
    if (!playerIds.length) return null;
    const idx = playerIds.indexOf(pid);
    const dir = data.direction || 1;
    return playerIds[(idx + dir + playerIds.length) % playerIds.length];
  }
  // Compute next in arbitrary direction
  function computeNextInDirection(data, pid, direction) {
    const playersObj = data.players || {};
    const playerIds = Object.keys(playersObj);
    if (!playerIds.length) return null;
    const idx = playerIds.indexOf(pid);
    return playerIds[(idx + direction + playerIds.length) % playerIds.length];
  }
  // Return the playerId who gets skipped by a Skip/Reverse in 2-player scenario
  function computeSkipId(data, pid) {
    const playersObj = data.players || {};
    const playerIds = Object.keys(playersObj);
    if (!playerIds.length) return null;
    const dir = data.direction || 1;
    const idx = playerIds.indexOf(pid);
    const skipIdx = (idx + dir + playerIds.length) % playerIds.length;
    return playerIds[skipIdx];
  }
  // Return that skipped player's name
  function computeSkipName(data, pid) {
    const sid = computeSkipId(data, pid);
    const playersObj = data.players || {};
    return playersObj[sid]?.name || "";
  }

  // ======================= FINISH WILD / WILD4 / SHUFFLE / SWAP =======================
  async function finishWildCardPlay(chosenColor) {
    if (!pendingWildCard) return;

    const {
      data, roomRef, updatedPlayers, newDiscardPile,
      playerId, card, activityEntry, playerIds, direction,
      pendingDrawCount, pendingDrawType, pendingUnoChallenge
    } = pendingWildCard;

    // Always add the card to discard (it was already removed from hand)
    const mergedDiscardPile = [...newDiscardPile];

    // ========== SWAP HANDS ==========
    if (card.value === "swap") {
      // Prompt case-insensitive match
      const options = playerIds.filter(pid => pid !== playerId).map(pid => data.players[pid]?.name || "");
      const input = prompt(
        `Swap Hands played. Choose opponent (type exact name):\n${options.join("\n")}`
      );
      let swapLog;
      if (!input) {
        swapLog = `${data.players[playerId].name} canceled Swap. Card consumed.`;
      } else {
        const trimmed = input.trim().toLowerCase();
        const targetPid = playerIds.find(pid => data.players[pid]?.name.toLowerCase() === trimmed);
        if (!targetPid) {
          swapLog = `${data.players[playerId].name} entered invalid name. Card consumed.`;
        } else {
          // Perform swap
          const targetHand = data.players[targetPid]?.hand || [];
          const myOldHand = data.players[playerId]?.hand || [];
          updatedPlayers[playerId].hand = [...targetHand];
          updatedPlayers[targetPid].hand = [...myOldHand];
          swapLog = `${data.players[playerId].name} swapped hands with ${data.players[targetPid].name}.`;
        }
      }

      const nextTurnId = computeNextTurn(data, playerId);
      await roomRef.update({
        players: updatedPlayers,
        discardPile: mergedDiscardPile,
        currentColor: chosenColor,
        currentTurn: nextTurnId,
        direction,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${activityEntry} – color chosen: ${chosenColor}. ${swapLog}`
        ),
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: null
      });

      if (sfxCardPlay) {
        sfxCardPlay.currentTime = 0;
        sfxCardPlay.play();
      }
      pendingWildCard = null;
      colorModal.classList.add("hidden");
      return;
    }

    // ========== WILD DRAW FOUR ==========
    if (card.value === "wild4") {
      let deck = Array.isArray(data.deck) ? [...data.deck] : [];
      if (deck.length < pendingDrawCount) deck = reshuffleDiscardIntoDeck(deck, mergedDiscardPile);
      const drawn = deck.splice(0, Math.min(pendingDrawCount, deck.length));
      const nextTurnId = computeNextTurn(data, playerId);

      const newPlayers = { ...updatedPlayers };
      newPlayers[nextTurnId] = {
        ...data.players[nextTurnId],
        hand: [...data.players[nextTurnId]?.hand || [], ...drawn]
      };

      await roomRef.update({
        players: newPlayers,
        deck,
        discardPile: mergedDiscardPile,
        currentColor: chosenColor,
        currentTurn: nextTurnId,
        direction,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${activityEntry} – color chosen: ${chosenColor}. ${data.players[nextTurnId]?.name} draws ${pendingDrawCount}.`
        ),
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: pendingUnoChallenge
      });

      if (sfxCardPlay) {
        sfxCardPlay.currentTime = 0;
        sfxCardPlay.play();
      }
      pendingWildCard = null;
      colorModal.classList.add("hidden");
      return;
    }

    // ========== WILD SHUFFLE HANDS ==========
    if (card.value === "shuffle") {
      // Rotate everyone’s hands one seat in current direction
      const oldPlayers = { ...data.players };
      const newPlayers = {};
      const ids = playerIds;
      for (let i = 0; i < ids.length; i++) {
        const fromIdx = (i - direction + ids.length) % ids.length;
        const fromPid = ids[fromIdx];
        newPlayers[ids[i]] = {
          ...oldPlayers[ids[i]],
          hand: [...(oldPlayers[fromPid]?.hand || [])]
        };
      }
      const nextTurnId = computeNextTurn(data, playerId);

      await roomRef.update({
        players: newPlayers,
        discardPile: mergedDiscardPile,
        currentColor: chosenColor,
        currentTurn: nextTurnId,
        direction,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${activityEntry} – color chosen: ${chosenColor}. Hands have been shuffled.`
        ),
        pendingDrawCount: 0,
        pendingDrawType: null,
        pendingUnoChallenge: null
      });

      if (sfxCardPlay) {
        sfxCardPlay.currentTime = 0;
        sfxCardPlay.play();
      }
      pendingWildCard = null;
      colorModal.classList.add("hidden");
      return;
    }

    // ========== PLAIN WILD ==========
    const nextTurnId = computeNextTurn(data, playerId);
    await roomRef.update({
      players: updatedPlayers,
      discardPile: mergedDiscardPile,
      currentColor: chosenColor,
      currentTurn: nextTurnId,
      direction,
      activityLog: firebase.firestore.FieldValue.arrayUnion(
        `${activityEntry} – color chosen: ${chosenColor}`
      ),
      pendingDrawCount: 0,
      pendingDrawType: null,
      pendingUnoChallenge: pendingUnoChallenge
    });
    if (sfxCardPlay) {
      sfxCardPlay.currentTime = 0;
      sfxCardPlay.play();
    }
    pendingWildCard = null;
    colorModal.classList.add("hidden");
  }

  // ======================= CHALLENGE BUTTON LOGIC =======================
  challengeBtn.addEventListener('click', async () => {
    if (!currentRoomId || !playerId) return;
    const roomRef = db.collection('rooms').doc(currentRoomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) return;
    const data = roomDoc.data() || {};

    if (
      data.pendingUnoChallenge &&
      data.currentTurn === playerId &&
      data.gameState === "started"
    ) {
      const offenderId = data.pendingUnoChallenge.offender;
      let deck = Array.isArray(data.deck) ? [...data.deck] : [];
      let discardPile = Array.isArray(data.discardPile) ? [...data.discardPile] : [];
      if (deck.length < 2) {
        deck = reshuffleDiscardIntoDeck(deck, discardPile);
      }
      const drawn2 = deck.splice(0, Math.min(2, deck.length));

      const newPlayers = { ...data.players };
      newPlayers[offenderId] = {
        ...data.players[offenderId],
        hand: [...data.players[offenderId]?.hand || [], ...drawn2]
      };

      await roomRef.update({
        players: newPlayers,
        deck,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${data.players[playerId]?.name} challenged ${data.players[offenderId]?.name} for not calling UNO: ${data.players[offenderId]?.name} draws 2.`
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
    const data = roomDoc.data() || {};

    if (data.currentTurn !== playerId) {
      alert("It's not your turn.");
      return;
    }

    const pendingDrawCount = data.pendingDrawCount || 0;
    const pendingDrawType  = data.pendingDrawType;

    // Handle pending draw
    if (pendingDrawCount > 0) {
      let deck = Array.isArray(data.deck) ? [...data.deck] : [];
      let discardPile = Array.isArray(data.discardPile) ? [...data.discardPile] : [];
      if (deck.length < pendingDrawCount) {
        deck = reshuffleDiscardIntoDeck(deck, discardPile);
      }
      const drawn = deck.splice(0, Math.min(pendingDrawCount, deck.length));
      const newPlayers = { ...data.players };
      newPlayers[playerId] = {
        ...data.players[playerId],
        hand: [...data.players[playerId]?.hand || [], ...drawn]
      };

      const nextTurnId = computeNextTurn(data, playerId);

      await roomRef.update({
        players: newPlayers,
        deck,
        currentTurn: nextTurnId,
        activityLog: firebase.firestore.FieldValue.arrayUnion(
          `${data.players[playerId]?.name} drew ${pendingDrawCount} cards (no stack).`
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

    // Normal single-card draw
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
    const newPlayers = { ...data.players };
    newPlayers[playerId] = {
      ...data.players[playerId],
      hand: [...data.players[playerId]?.hand || [], drawnCard]
    };

    const nextTurnId = computeNextTurn(data, playerId);

    await roomRef.update({
      players: newPlayers,
      deck,
      currentTurn: nextTurnId,
      activityLog: firebase.firestore.FieldValue.arrayUnion(
        `${data.players[playerId]?.name} drew a card and ended their turn.`
      ),
      pendingDrawCount: 0,
      pendingDrawType: null,
      pendingUnoChallenge: null
    });

    // Animate the newly drawn card
    setTimeout(() => {
      const allCards = Array.from(playerHand.children);
      if (allCards.length) {
        const newlyDrawn = allCards[allCards.length - 1];
        newlyDrawn.classList.add("drawn");
        newlyDrawn.addEventListener("animationend", () => {
          newlyDrawn.classList.remove("drawn");
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
    const data = roomDoc.data() || {};
    const playerData = data.players?.[playerId];
    if (!playerData) return;

    if (Array.isArray(playerData.hand) && playerData.hand.length === 1) {
      if (sfxUnoCall) {
        sfxUnoCall.currentTime = 0;
        sfxUnoCall.play();
      }
      const handCards = Array.from(playerHand.children);
      if (handCards.length === 1) {
        handCards[0].classList.add("played");
        handCards[0].addEventListener("animationend", () => {
          handCards[0].classList.remove("played");
        }, { once: true });
      }
      const newPlayers = { ...data.players };
      newPlayers[playerId] = {
        ...playerData,
        calledUno: true
      };

      await roomRef.update({
        players: newPlayers,
        activityLog: firebase.firestore.FieldValue.arrayUnion(`${playerData.name} called UNO!`),
        pendingUnoChallenge: null
      });
    } else {
      alert("You can only call UNO when you have exactly one card!");
    }
  });

  // ======================= CHAT & ACTIVITY LOG =======================
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

    chatInput.value = "";
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatBtn.click();
    }
  });

  // ======================= COLOR MODAL EVENT HANDLERS =======================
  // Only close via “X” button or picking a color; disable overlay click
  closeModalBtn.addEventListener("click", () => {
    pendingWildCard = null;
    colorModal.classList.add("hidden");
  });

  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const chosenColor = btn.dataset.color;
      finishWildCardPlay(chosenColor);
    });
  });

  // (No overlay click handler so you cannot accidentally dismiss by tapping outside)

  // ======================= END OF SCRIPT =======================
});
