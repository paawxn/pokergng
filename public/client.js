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

  // Draw each player
  gameState.players.forEach((player, index) => {
    const playerArea = document.createElement('div');
    playerArea.className = 'player-area';
    playerArea.id = `player-${index}`;

    // Add player info
    playerArea.innerHTML = `
      <div class="player-name">${player.name} (${player.status})</div>
      <div class="player-chips">Chips: ${player.chips}</div>
      <div class="player-cards"></div>
      <div class="player-bet">Bet: ${player.bet}</div>
    `;

    // Add player's cards
    const playerCardsContainer = playerArea.querySelector('.player-cards');
    if (player.cards) {
      player.cards.forEach(card => {
        // Only show this player's cards if it's me
        // In a real game, you'd check against socket.id
        // For now, we'll just show player 0's cards as an example
        if (index === 0) {
            playerCardsContainer.appendChild(createCardElement(card));
        } else {
            playerCardsContainer.appendChild(createCardElement({ rank: '?', suit: '' })); // Face-down card
        }
      });
    }

    // Highlight the active player
    if (gameState.activePlayerPosition === index) {
      playerArea.classList.add('active-player');
    }

    gameTable.appendChild(playerArea);
  });
  
  // Show/hide action controls based on whose turn it is
  const myPlayer = gameState.players.find(p => p.id === socket.id);
  const activePlayer = gameState.players[gameState.activePlayerPosition];
  if (myPlayer && activePlayer && myPlayer.id === activePlayer.id) {
    actionControls.style.display = 'flex';
    gameLog.textContent = "It's your turn to act.";
  } else {
    actionControls.style.display = 'none';
  }
}

// Helper function to create a card element
function createCardElement({ rank, suit }) {
  const cardElement = document.createElement('div');
  cardElement.className = 'card';
  cardElement.textContent = `${rank}${suit}`;
  if (suit === '♥' || suit === '♦') {
    cardElement.style.color = 'red';
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

// Send actions to the server when buttons are clicked
startGameBtn.addEventListener('click', () => socket.emit('startGame'));
foldBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'fold' }));
callBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'call' }));
raiseBtn.addEventListener('click', () => {
  const amount = parseInt(raiseAmountInput.value);
  socket.emit('playerAction', { action: 'raise', amount });
});