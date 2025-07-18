const express = require('express');
const http = require('http');
const { Server } = require("socket.io");


const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const game = require('./game.js')
const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  user: 'pokerdev', // The user you created
  host: 'localhost',
  database: 'pokerdb', // The database you created
  password: 'Retard@123', // The password you set
  port: 5432,
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

io.on('connection', (socket) => {
  console.log(`A player connected with ID: ${socket.id}`);

  // 1. Create a new player object
  const newPlayer = {
    id: socket.id,
    name: `Player_${socket.id.substring(0, 5)}`, // A simple default name
    chips: 1000, // Starting chip amount
    cards: [],
    bet: 0,
    folded: false,
  };

  // 2. Add the new player to the game state
  game.gameState.players.push(newPlayer);
  console.log('Current players:', game.gameState.players.map(p => p.name));

  // 3. Try to start the game
  game.startGame();

  // 4. Broadcast the updated game state to all players
  io.emit('gameStateUpdate', game.gameState);

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`Player ${socket.id} disconnected`);
    // Remove the player from the array
    game.gameState.players = game.gameState.players.filter(
      (player) => player.id !== socket.id
    );
    // Broadcast the new state
    io.emit('gameStateUpdate', game.gameState);
  });
});