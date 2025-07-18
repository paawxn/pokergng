let gameState = {
  players: [],
  deck: [],
  communityCards: [],
  pot: 0,
  smallBlind: 5,
  bigBlind: 10,
  dealerPosition: 0,
  activePlayerPosition: null,
  currentBet: 0,
  phase: 'waiting',
};


function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  gameState.deck = []; // Clear the deck

  for (const suit of suits) {
    for (const rank of ranks) {
      gameState.deck.push({ rank, suit });
    }
  }
};


function shuffleDeck() {
  let deck = gameState.deck;
  let currentIndex = deck.length;
  let randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // Swap elements
    const temp = deck[currentIndex];
    deck[currentIndex] = deck[randomIndex];
    deck[randomIndex] = temp;
}};

function dealCards(){
    for(let i =0; i<gameState.players.length; i++){
        if (gameState.players[i]){
        const card1 = gameState.deck.pop();
        const card2 = gameState.deck.pop();
        gameState.players[i].cards = [card1, card2];
        }
    }
}
function startGame(){
    if (gameState.players.length >= 2 && gameState.phase === 'waiting'){
        gameState.phase = 'pre-flop';   //changing phase
        createDeck();   //creating deck
        shuffleDeck();  //shuffling deck
        dealCards();    //dealing cards

        console.log('starting');
    }
    else{
        console.log('unable to start. not enough people');
    }

    }


module.exports = {
  gameState,
  createDeck,
  shuffleDeck,
  dealCards,
  startGame,
};