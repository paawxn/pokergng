const express = require('express');
const http = require('http');
const { Server } = require("socket.io");


const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const game = require('./game.js');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Database connection configuration
require('dotenv').config(); // At the very top of your file

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database', err.stack);
  } else {
    console.log('Database connected successfully:', res.rows[0].now);
  }
});

// Serve all files from the 'public' directory
app.use(express.static('public'));

// Endpoint to create a new session and redirect to its URL
app.get('/create-session', (req, res) => {
  const sessionId = uuidv4();
  game.createSession(sessionId);
  res.redirect(`/session/${sessionId}`);
});

// Serve session page
app.get('/session/:sessionId', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

function emitGameState(sessionId) {
  const session = game.getSession(sessionId);
  if (!session) return;
  const winPercentages = game.getWinPercentages(session);
  io.to(sessionId).emit('gameStateUpdate', {
    ...session,
    winPercentages,
    logs: session.logs || [],
    settings: session.settings || {},
  });
}

io.on('connection', (socket) => {
  let sessionId;
  let player;

  // Listen for joinSession event
  socket.on('joinSession', ({ sessionId: sid, stackRequest, name }) => {
    sessionId = sid;
    const session = game.getSession(sessionId) || game.createSession(sessionId);
    player = {
      id: socket.id,
      name: name || `Player_${socket.id.substring(0, 5)}`,
      chips: stackRequest || 1000,
      cards: [],
      bet: 0,
      status: 'pending', // pending approval
    };
    session.players.push(player);
    socket.join(sessionId);
    emitGameState(sessionId);
  });

  // Listen for admin approval
  socket.on('approvePlayer', ({ sessionId: sid, playerId, approved }) => {
    const session = game.getSession(sid);
    if (!session) return;
    const p = session.players.find(pl => pl.id === playerId);
    if (p) {
      p.status = approved ? 'active' : 'rejected';
      emitGameState(sid);
    }
  });

  // Listen for startGame event
  socket.on('startGame', ({ sessionId: sid }) => {
    const session = game.getSession(sid);
    if (session) {
      game.startGame(session);
      emitGameState(sid);
    }
  });

  // Listen for player actions (fold, call, raise)
  socket.on('playerAction', ({ action, amount }) => {
    if (!sessionId) return;
    const session = game.getSession(sessionId);
    if (!session) return;
    game.playerAction(session, socket.id, action, amount);
    // If next player is a bot, auto-act
    const active = session.players[session.activePlayerPosition];
    if (active && active.isBot && session.phase !== 'waiting') {
      setTimeout(() => {
        // Bot always checks/calls
        if (session.currentBet > active.bet) {
          game.playerAction(session, active.id, 'call');
        } else {
          game.playerAction(session, active.id, 'call');
        }
        emitGameState(sessionId);
      }, 800);
    }
    emitGameState(sessionId);
  });

  // Handle adminAction socket events for adjustStack, kickPlayer, and advanceStreet. Update session state and broadcast changes. (Settings toggles will be handled in a future step.)
  socket.on('adminAction', ({ action, playerId, delta, sessionId: sid, setting, value }) => {
    const session = game.getSession(sid);
    if (!session) return;
    // Only allow host (first player) to perform admin actions
    if (!session.players.length || session.players[0].id !== socket.id) return;
    if (action === 'adjustStack') {
      const p = session.players.find(pl => pl.id === playerId);
      if (p) {
        p.chips += delta;
        if (!p.initialChips) p.initialChips = p.chips;
      }
    } else if (action === 'kickPlayer') {
      session.players = session.players.filter(pl => pl.id !== playerId);
    } else if (action === 'advanceStreet') {
      game.nextPhase(session);
    } else if (action === 'toggleSetting') {
      session.settings = session.settings || {};
      session.settings[setting] = value;
    } else if (action === 'addBot') {
      // Add a bot player to the first empty seat
      if (!session.players) session.players = [];
      if (session.players.length < 9) {
        const botIdx = session.players.length;
        session.players[botIdx] = {
          id: 'bot_' + Math.random().toString(36).slice(2, 8),
          name: 'Bot',
          chips: 1000,
          cards: [],
          bet: 0,
          status: 'active',
          isBot: true,
        };
      }
    }
    emitGameState(sid);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    if (!sessionId) return;
    const session = game.getSession(sessionId);
    if (!session) return;
    session.players = session.players.filter(p => p.id !== socket.id);
    emitGameState(sessionId);
  });
});
server.listen(PORT, () => {
  console.log(`Server is running and listening on http://localhost:${PORT}`);
});