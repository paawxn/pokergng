// 1. ESTABLISH CONNECTION & GET ELEMENTS
const socket = io();

// Get references to all the HTML elements we'll need to update
const gameTable = document.getElementById('game-table');
const potElement = document.getElementById('pot');
const communityCardsContainer = document.getElementById('community-cards');
const actionControls = document.getElementById('action-controls');
const gameLog = document.getElementById('game-log');

// Action buttons
const startGameBtn = document.getElementById('startGameBtn');
const foldBtn = document.getElementById('foldBtn');
const callBtn = document.getElementById('callBtn');
const raiseBtn = document.getElementById('raiseBtn');
const raiseAmountInput = document.getElementById('raiseAmount');


// 2. DEFINE THE RENDER FUNCTION
// This function will be called every time the game state updates
function renderGame(gameState) {
  // Clear old player elements before re-drawing
  document.querySelectorAll('.player-area').forEach(elem => elem.remove());

  // Update the pot
  potElement.textContent = `Pot: $${gameState.pot}`;

  // Update community cards
  communityCardsContainer.innerHTML = ''; // Clear old cards
  gameState.communityCards.forEach(card => {
    communityCardsContainer.appendChild(createCardElement(card));
  });

  // Player stats calculation
  function getPlayerStats(player) {
    // Placeholder: in a real implementation, stats would be tracked in session.logs
    const logs = gameState.logs || [];
    const handsPlayed = logs.filter(log => log.winners.includes(player.name)).length;
    // TODO: Calculate VPIP, PFR, showdown %, profit/loss
    return {
      handsPlayed,
      vpip: '-',
      pfr: '-',
      showdown: '-',
      profit: player.chips - (player.initialChips || 1000),
    };
  }

  // Arrange player seats in a circle/oval around the table, up to 9 seats
  const tableRect = gameTable.getBoundingClientRect();
  const centerX = tableRect.width / 2;
  const centerY = tableRect.height / 2;
  const radiusX = tableRect.width * 0.38;
  const radiusY = tableRect.height * 0.38;
  const seatCount = 9;
  for (let index = 0; index < seatCount; index++) {
    const player = gameState.players[index];
    if (player) {
      const playerArea = document.createElement('div');
      playerArea.className = 'player-area';
      playerArea.id = `player-${index}`;
      let winPct = '';
      if (gameState.winPercentages && gameState.winPercentages[index] !== undefined) {
        winPct = ` <span class='win-pct'>${gameState.winPercentages[index]}%</span>`;
      }
      const stats = getPlayerStats(player);
      // Compact Poker Now-style seat
      playerArea.innerHTML = `
        <div class="player-seat-top">
          <span class="player-name">${player.name}</span>
          <span class="player-chips">$${player.chips}</span>
        </div>
        <div class="player-cards"></div>
        <div class="player-seat-bottom">
          <span class="player-bet">Bet: $${player.bet}</span>
          <span class="player-profit">P/L: $${stats.profit}</span>
          ${winPct}
        </div>
      `;
      // Add player's cards
      const playerCardsContainer = playerArea.querySelector('.player-cards');
      if (player.cards) {
        player.cards.forEach(card => {
          if (player.id === socket.id || gameState.phase === 'showdown' || player.isBot) {
            playerCardsContainer.appendChild(createCardElement(card));
          } else {
            playerCardsContainer.appendChild(createCardElement({ rank: '?', suit: '' }));
          }
        });
      }
      // Highlight the active player
      if (gameState.activePlayerPosition === index) {
        playerArea.classList.add('active-player');
      }
      // Position seat in oval
      const angle = (2 * Math.PI * index) / seatCount - Math.PI / 2;
      const x = centerX + radiusX * Math.cos(angle) - 60; // 60 = half seat width
      const y = centerY + radiusY * Math.sin(angle) - 40; // 40 = half seat height
      playerArea.style.position = 'absolute';
      playerArea.style.left = `${x}px`;
      playerArea.style.top = `${y}px`;
      gameTable.appendChild(playerArea);
    } else {
      // Render join button for empty seat
      const joinBtn = document.createElement('button');
      joinBtn.className = 'seat-join-btn';
      joinBtn.textContent = 'Join';
      joinBtn.title = 'Sit here';
      joinBtn.onclick = () => window.joinSeat(index);
      // Position seat in oval
      const angle = (2 * Math.PI * index) / seatCount - Math.PI / 2;
      const x = centerX + radiusX * Math.cos(angle) - 40;
      const y = centerY + radiusY * Math.sin(angle) - 20;
      joinBtn.style.position = 'absolute';
      joinBtn.style.left = `${x}px`;
      joinBtn.style.top = `${y}px`;
      gameTable.appendChild(joinBtn);
    }
  }
  // Add Play vs Bot button if not present
  if (!document.getElementById('play-vs-bot-btn')) {
    const botBtn = document.createElement('button');
    botBtn.id = 'play-vs-bot-btn';
    botBtn.textContent = 'Play vs Bot';
    botBtn.className = 'seat-join-btn';
    botBtn.style.position = 'absolute';
    botBtn.style.left = `${centerX - 60}px`;
    botBtn.style.top = `${centerY + radiusY + 40}px`;
    botBtn.onclick = () => window.addBotPlayer();
    gameTable.appendChild(botBtn);
  }
  
  // Show phase and active player
  const phaseDiv = document.getElementById('phase-info') || document.createElement('div');
  phaseDiv.id = 'phase-info';
  phaseDiv.textContent = `Phase: ${gameState.phase || ''} | Active: ${gameState.players[gameState.activePlayerPosition]?.name || ''}`;
  gameTable.prepend(phaseDiv);

  // --- BETTING CONTROLS UI ---
  // Group betting controls, show current bet, and add tooltips
  actionControls.innerHTML = `
    <div id="game-log">${gameLog.textContent || 'Welcome to the game!'}</div>
    <div class="betting-controls">
      <button id="foldBtn" title="Fold your hand">Fold</button>
      <button id="callBtn" title="Call the current bet">Call</button>
      <div class="raise-container">
        <button id="raiseBtn" title="Raise the bet">Raise</button>
        <input type="number" id="raiseAmount" value="20" min="20" title="Raise amount">
      </div>
      <span class="current-bet">Current Bet: $${gameState.currentBet || 0}</span>
      <button id="startGameBtn" title="Start a new hand">Start Game</button>
    </div>
  `;
  // Re-attach event listeners
  document.getElementById('foldBtn').addEventListener('click', () => socket.emit('playerAction', { action: 'fold' }));
  document.getElementById('callBtn').addEventListener('click', () => socket.emit('playerAction', { action: 'call' }));
  document.getElementById('raiseBtn').addEventListener('click', () => {
    const amount = parseInt(document.getElementById('raiseAmount').value);
    socket.emit('playerAction', { action: 'raise', amount });
  });
  document.getElementById('startGameBtn').addEventListener('click', () => socket.emit('startGame', { sessionId }));

  // Show approval status
  const myPlayerStatus = gameState.players.find(p => p.id === socket.id);
  if (myPlayerStatus && myPlayerStatus.status === 'pending') {
    gameLog.textContent = 'Waiting for admin approval...';
    actionControls.style.display = 'none';
    return;
  }
  if (myPlayerStatus && myPlayerStatus.status === 'rejected') {
    gameLog.textContent = 'Your stack request was rejected by the admin.';
    actionControls.style.display = 'none';
    return;
  }
  // Admin approval UI (if this client is the host/admin)
  if (gameState.players.length > 0 && gameState.players[0].id === socket.id) {
    // Show approval buttons for pending players
    gameState.players.forEach((player, idx) => {
      if (player.status === 'pending') {
        const approveBtn = document.createElement('button');
        approveBtn.textContent = `Approve ${player.name} (${player.chips})`;
        approveBtn.onclick = () => socket.emit('approvePlayer', { sessionId, playerId: player.id, approved: true });
        const rejectBtn = document.createElement('button');
        rejectBtn.textContent = `Reject`;
        rejectBtn.onclick = () => socket.emit('approvePlayer', { sessionId, playerId: player.id, approved: false });
        gameTable.appendChild(approveBtn);
        gameTable.appendChild(rejectBtn);
      }
    });
  }

  // Show session logs
  const logsDiv = document.getElementById('session-logs');
  logsDiv.innerHTML = '<h3>Session Logs</h3>';
  if (gameState.logs && gameState.logs.length > 0) {
    gameState.logs.slice(-10).reverse().forEach(log => {
      logsDiv.innerHTML += `<div>Winners: ${log.winners.join(', ')} | Amount: $${log.amount} | Phase: ${log.phase} | ${log.time}</div>`;
    });
  } else {
    logsDiv.innerHTML += '<div>No hands played yet.</div>';
  }

  // --- SETTINGS UI ---
  // Make settings toggles visually distinct and sync with backend
  const settingsDiv = document.getElementById('game-settings');
  settingsDiv.innerHTML = '<h3>Game Settings</h3>';
  if (isAdmin) {
    settingsDiv.innerHTML += `
      <div class="settings-group">
        <label class="toggle-label"><input type="checkbox" id="bounty72"> <span>Bounty on 7-2</span></label>
        <label class="toggle-label"><input type="checkbox" id="straddle"> <span>Straddle Option</span></label>
        <button class="advance-btn" onclick="window.advanceStreet()" title="Advance to next street (flop, turn, river)">Advance Street</button>
      </div>
    `;
    // Set toggle state from backend
    document.getElementById('bounty72').checked = !!(gameState.settings && gameState.settings.bounty72);
    document.getElementById('straddle').checked = !!(gameState.settings && gameState.settings.straddle);
    // Add event listeners to toggles
    document.getElementById('bounty72').onchange = (e) => {
      socket.emit('adminAction', { action: 'toggleSetting', setting: 'bounty72', value: e.target.checked, sessionId });
    };
    document.getElementById('straddle').onchange = (e) => {
      socket.emit('adminAction', { action: 'toggleSetting', setting: 'straddle', value: e.target.checked, sessionId });
    };
  } else {
    // Show current settings state for non-admins
    const bounty = gameState.settings && gameState.settings.bounty72 ? 'ON' : 'OFF';
    const straddle = gameState.settings && gameState.settings.straddle ? 'ON' : 'OFF';
    settingsDiv.innerHTML += `<div>Bounty on 7-2: <b>${bounty}</b></div><div>Straddle: <b>${straddle}</b></div>`;
    settingsDiv.innerHTML += '<div>Only the host can change settings.</div>';
  }
}

// Card sprite mapping
const cardSpriteUrl = '/Poker cards 1.3/Deck of cards ( full cards ).png';
const rankOrder = '23456789TJQKA';
const suitOrder = ['\u2660', '\u2665', '\u2666', '\u2663'];
function getCardSpritePosition(rank, suit) {
  // Assume 13 columns (ranks), 4 rows (suits) in the sprite
  const col = rankOrder.indexOf(rank);
  const row = suitOrder.indexOf(suit);
  return { x: col * 48, y: row * 64 };
}
function createCardElement({ rank, suit }) {
  const cardElement = document.createElement('div');
  cardElement.className = 'card';
  if (rank && suit && rankOrder.includes(rank) && suitOrder.includes(suit)) {
    const pos = getCardSpritePosition(rank, suit);
    cardElement.style.backgroundImage = `url('${cardSpriteUrl}')`;
    cardElement.style.backgroundPosition = `-${pos.x}px -${pos.y}px`;
    cardElement.style.backgroundSize = `${48 * 13}px ${64 * 4}px`;
    cardElement.textContent = '';
  } else {
    cardElement.textContent = '?';
    cardElement.style.background = '#222';
  }
  return cardElement;
}


// 3. SET UP EVENT LISTENERS

// Listen for game state updates from the server
socket.on('gameStateUpdate', (gameState) => {
  console.log('Received new game state:', gameState);
  renderGame(gameState);
});

// Listen for error messages
socket.on('error', (message) => {
  gameLog.textContent = `Error: ${message}`;
});

// Get sessionId from URL
function getSessionIdFromUrl() {
  const match = window.location.pathname.match(/session\/([\w-]+)/);
  return match ? match[1] : null;
}
const sessionId = getSessionIdFromUrl();

// Prompt for name and stack request
let myName = localStorage.getItem('pokerName') || prompt('Enter your name:');
localStorage.setItem('pokerName', myName);
let stackRequest = parseInt(prompt('Enter your desired stack (chips):', '1000'));

// Join session
socket.emit('joinSession', { sessionId, stackRequest, name: myName });

// Send actions to the server when buttons are clicked
startGameBtn.addEventListener('click', () => socket.emit('startGame', { sessionId }));
foldBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'fold' }));
callBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'call' }));
raiseBtn.addEventListener('click', () => {
  const amount = parseInt(raiseAmountInput.value);
  socket.emit('playerAction', { action: 'raise', amount });
});

// Admin action handlers
window.adjustStack = function(playerId, delta) {
  socket.emit('adminAction', { action: 'adjustStack', playerId, delta, sessionId });
};
window.kickPlayer = function(playerId) {
  socket.emit('adminAction', { action: 'kickPlayer', playerId, sessionId });
};
window.advanceStreet = function() {
  socket.emit('adminAction', { action: 'advanceStreet', sessionId });
};
window.joinSeat = function(seatIndex) {
  socket.emit('joinSession', { sessionId, stackRequest: 1000, name: myName, seatIndex });
};
window.addBotPlayer = function() {
  socket.emit('adminAction', { action: 'addBot', sessionId });
};