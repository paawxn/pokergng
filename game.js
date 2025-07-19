// SessionManager to handle multiple game sessions
const sessions = {};
const crypto = require('crypto');

function createSession(sessionId) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
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
      logs: [],
    };
  }
  return sessions[sessionId];
}

function getSession(sessionId) {
  return sessions[sessionId];
}

function createDeck(session) {
  const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  session.deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      session.deck.push({ rank, suit });
    }
  }
}

function shuffleDeck(session) {
  let deck = session.deck;
  let currentIndex = deck.length;
  let randomIndex;
  while (currentIndex !== 0) {
    randomIndex = crypto.randomInt(0, currentIndex);
    currentIndex--;
    const temp = deck[currentIndex];
    deck[currentIndex] = deck[randomIndex];
    deck[randomIndex] = temp;
  }
}

function dealCards(session) {
  for (let i = 0; i < session.players.length; i++) {
    if (session.players[i]) {
      const card1 = session.deck.pop();
      const card2 = session.deck.pop();
      session.players[i].cards = [card1, card2];
    }
  }
}

function startGame(session) {
  if (session.players.length >= 2 && session.phase === 'waiting') {
    session.phase = 'pre-flop';
    createDeck(session);
    shuffleDeck(session);
    dealCards(session);
    session.communityCards = [];
    session.pot = 0;
    session.currentBet = session.bigBlind;
    session.dealerPosition = 0;
    session.activePlayerPosition = (session.dealerPosition + 1) % session.players.length; // Small blind
    session.players.forEach(p => { p.bet = 0; p.status = p.status === 'active' ? 'active' : p.status; });
  }
}

// Full Texas Hold'em hand evaluator (simple version, can be expanded)
function getHandRank(cards) {
  // cards: array of 7 cards (2 hole + 5 community)
  // Returns: {rank: number, tiebreaker: array}
  // Ranks: 9=Straight Flush, 8=Four of a Kind, 7=Full House, 6=Flush, 5=Straight, 4=Trips, 3=Two Pair, 2=Pair, 1=High Card
  // For now, only support high card, pair, two pair, trips, straight, flush, full house, quads, straight flush
  const rankOrder = '23456789TJQKA';
  const counts = {};
  const suits = {};
  cards.forEach(card => {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
    suits[card.suit] = (suits[card.suit] || 0) + 1;
  });
  const ranks = Object.keys(counts).sort((a, b) => rankOrder.indexOf(b) - rankOrder.indexOf(a));
  const values = ranks.map(r => rankOrder.indexOf(r));
  // Check for flush
  let flushSuit = null;
  for (const s in suits) if (suits[s] >= 5) flushSuit = s;
  // Check for straight
  let straight = null;
  for (let i = 0; i <= values.length - 5; i++) {
    let run = true;
    for (let j = 1; j < 5; j++) {
      if (values[i + j] !== values[i] - j) run = false;
    }
    if (run) straight = values[i];
  }
  // Check for straight flush
  if (flushSuit) {
    const flushCards = cards.filter(c => c.suit === flushSuit).sort((a, b) => rankOrder.indexOf(b.rank) - rankOrder.indexOf(a.rank));
    const flushValues = flushCards.map(c => rankOrder.indexOf(c.rank));
    for (let i = 0; i <= flushValues.length - 5; i++) {
      let run = true;
      for (let j = 1; j < 5; j++) {
        if (flushValues[i + j] !== flushValues[i] - j) run = false;
      }
      if (run) return { rank: 9, tiebreaker: flushValues.slice(i, i + 5) };
    }
  }
  // Four of a kind
  if (Object.values(counts).includes(4)) {
    const quad = ranks.find(r => counts[r] === 4);
    const kicker = ranks.find(r => counts[r] !== 4);
    return { rank: 8, tiebreaker: [rankOrder.indexOf(quad), rankOrder.indexOf(kicker)] };
  }
  // Full house
  if (Object.values(counts).includes(3) && Object.values(counts).includes(2)) {
    const trips = ranks.find(r => counts[r] === 3);
    const pair = ranks.find(r => counts[r] === 2);
    return { rank: 7, tiebreaker: [rankOrder.indexOf(trips), rankOrder.indexOf(pair)] };
  }
  // Flush
  if (flushSuit) {
    const flushCards = cards.filter(c => c.suit === flushSuit).sort((a, b) => rankOrder.indexOf(b.rank) - rankOrder.indexOf(a.rank));
    return { rank: 6, tiebreaker: flushCards.slice(0, 5).map(c => rankOrder.indexOf(c.rank)) };
  }
  // Straight
  if (straight !== null) {
    return { rank: 5, tiebreaker: [straight] };
  }
  // Trips
  if (Object.values(counts).includes(3)) {
    const trips = ranks.find(r => counts[r] === 3);
    const kickers = ranks.filter(r => counts[r] !== 3).slice(0, 2);
    return { rank: 4, tiebreaker: [rankOrder.indexOf(trips), ...kickers.map(r => rankOrder.indexOf(r))] };
  }
  // Two pair
  if (Object.values(counts).filter(v => v === 2).length >= 2) {
    const pairs = ranks.filter(r => counts[r] === 2).slice(0, 2);
    const kicker = ranks.find(r => counts[r] === 1);
    return { rank: 3, tiebreaker: [...pairs.map(r => rankOrder.indexOf(r)), rankOrder.indexOf(kicker)] };
  }
  // Pair
  if (Object.values(counts).includes(2)) {
    const pair = ranks.find(r => counts[r] === 2);
    const kickers = ranks.filter(r => counts[r] !== 2).slice(0, 3);
    return { rank: 2, tiebreaker: [rankOrder.indexOf(pair), ...kickers.map(r => rankOrder.indexOf(r))] };
  }
  // High card
  return { rank: 1, tiebreaker: values.slice(0, 5) };
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < a.tiebreaker.length; i++) {
    if (a.tiebreaker[i] !== b.tiebreaker[i]) return a.tiebreaker[i] - b.tiebreaker[i];
  }
  return 0;
}

function evaluateHand(cards) {
  // Find best 5-card hand from 7 cards
  const combos = k_combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const hand = getHandRank(combo);
    if (!best || compareHands(hand, best) > 0) best = hand;
  }
  return best;
}

// Helper: all k-combinations of array
function k_combinations(set, k) {
  let i, j, combs, head, tailcombs;
  if (k > set.length || k <= 0) return [];
  if (k === set.length) return [set];
  if (k === 1) {
    combs = [];
    for (i = 0; i < set.length; i++) combs.push([set[i]]);
    return combs;
  }
  combs = [];
  for (i = 0; i < set.length - k + 1; i++) {
    head = set.slice(i, i + 1);
    tailcombs = k_combinations(set.slice(i + 1), k - 1);
    for (j = 0; j < tailcombs.length; j++) combs.push(head.concat(tailcombs[j]));
  }
  return combs;
}

// Monte Carlo win percentage calculation
function getWinPercentages(session, numSim = 200) {
  // For each player, simulate random remaining cards and count wins
  const players = session.players.filter(p => p.status === 'active');
  if (players.length < 2) return players.map(() => 100);
  const knownCards = [].concat(...players.map(p => p.cards), session.communityCards);
  const deck = [];
  const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  for (const suit of suits) for (const rank of ranks) deck.push({ rank, suit });
  // Remove known cards
  const deckLeft = deck.filter(card => !knownCards.some(c => c.rank === card.rank && c.suit === card.suit));
  const wins = Array(players.length).fill(0);
  for (let sim = 0; sim < numSim; sim++) {
    // Shuffle deckLeft
    const simDeck = [...deckLeft];
    for (let i = simDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [simDeck[i], simDeck[j]] = [simDeck[j], simDeck[i]];
    }
    // Fill in missing community cards
    const community = [...session.communityCards];
    while (community.length < 5) community.push(simDeck.pop());
    // Evaluate all hands
    let best = null;
    let winners = [];
    for (let i = 0; i < players.length; i++) {
      const hand = evaluateHand(players[i].cards.concat(community));
      if (!best || compareHands(hand, best) > 0) {
        best = hand;
        winners = [i];
      } else if (compareHands(hand, best) === 0) {
        winners.push(i);
      }
    }
    winners.forEach(idx => wins[idx]++);
  }
  return wins.map(w => Math.round((w / numSim) * 100));
}

function showdown(session) {
  // Find all players who haven't folded
  const activePlayers = session.players.filter(p => p.status === 'active');
  if (activePlayers.length === 0) return;
  // Evaluate each player's best hand (hole + community)
  let bestValue = -1;
  let winners = [];
  for (const player of activePlayers) {
    const allCards = player.cards.concat(session.communityCards);
    const value = evaluateHand(allCards);
    if (value > bestValue) {
      bestValue = value;
      winners = [player];
    } else if (value === bestValue) {
      winners.push(player);
    }
  }
  // Split pot among winners
  const winAmount = Math.floor(session.pot / winners.length);
  winners.forEach(w => { w.chips += winAmount; });
  // Log result (placeholder)
  session.logs = session.logs || [];
  session.logs.push({
    winners: winners.map(w => w.name),
    amount: winAmount,
    phase: session.phase,
    time: new Date().toISOString(),
  });
  // Reset for next hand
  session.phase = 'waiting';
  session.pot = 0;
  session.communityCards = [];
  session.players.forEach(p => { p.bet = 0; p.cards = []; p.status = p.status === 'rejected' ? 'rejected' : 'active'; });
}

function nextPhase(session) {
  if (session.phase === 'pre-flop') {
    // Deal flop
    session.communityCards = [session.deck.pop(), session.deck.pop(), session.deck.pop()];
    session.phase = 'flop';
  } else if (session.phase === 'flop') {
    // Deal turn
    session.communityCards.push(session.deck.pop());
    session.phase = 'turn';
  } else if (session.phase === 'turn') {
    // Deal river
    session.communityCards.push(session.deck.pop());
    session.phase = 'river';
  } else if (session.phase === 'river') {
    session.phase = 'showdown';
    showdown(session);
  }
  // Reset bets for new round
  session.players.forEach(p => { p.bet = 0; });
  session.currentBet = 0;
  session.activePlayerPosition = (session.dealerPosition + 1) % session.players.length;
}

function playerAction(session, playerId, action, amount) {
  const playerIdx = session.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return;
  const player = session.players[playerIdx];
  if (session.activePlayerPosition !== playerIdx) return; // Not this player's turn
  if (player.status !== 'active') return;

  if (action === 'fold') {
    player.status = 'folded';
  } else if (action === 'call') {
    const toCall = session.currentBet - player.bet;
    if (player.chips >= toCall) {
      player.chips -= toCall;
      player.bet += toCall;
      session.pot += toCall;
    }
  } else if (action === 'raise') {
    const toCall = session.currentBet - player.bet;
    const totalBet = toCall + amount;
    if (player.chips >= totalBet && amount > 0) {
      player.chips -= totalBet;
      player.bet += totalBet;
      session.pot += totalBet;
      session.currentBet += amount;
    }
  }
  // Advance to next active player
  let nextIdx = (playerIdx + 1) % session.players.length;
  let looped = false;
  while (session.players[nextIdx].status !== 'active') {
    nextIdx = (nextIdx + 1) % session.players.length;
    if (nextIdx === playerIdx) { looped = true; break; }
  }
  if (!looped) {
    session.activePlayerPosition = nextIdx;
  } else {
    // All but one folded or round complete
    nextPhase(session);
  }
}

module.exports = {
  createSession,
  getSession,
  createDeck,
  shuffleDeck,
  dealCards,
  startGame,
  nextPhase,
  playerAction,
  getWinPercentages,
};