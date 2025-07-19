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

io.on('connection', (socket) => {
  console.log(`A player connected with ID: ${socket.id}`);

  // 1. Create a new player object (using 'status' is more flexible than 'folded')
  const newPlayer = {
    id: socket.id,
    name: `Player_${socket.id.substring(0, 5)}`,
    chips: 1000,
    cards: [],
    bet: 0,
    status: 'active', // 'active', 'folded', 'all-in'
  };

  // 2. Add the new player to the game state
  game.gameState.players.push(newPlayer);
  console.log('Current players:', game.gameState.players.map(p => p.name));

  // 3. Broadcast the updated state so everyone sees the new player
  io.emit('gameStateUpdate', game.gameState);

  // --- NEW: Listen for a player's request to start the game ---
  socket.on('startGame', () => {
    console.log(`Received startGame request from ${socket.id}`);
    // The game logic in startGame() already checks for enough players
    game.startGame(); 
    // Broadcast the new state after starting
    io.emit('gameStateUpdate', game.gameState);
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`Player ${socket.id} disconnected`);
    game.gameState.players = game.gameState.players.filter(
      (player) => player.id !== socket.id
    );
    
    // What if the dealer disconnects? Or the active player?
    // You'll need logic here to handle that, e.g., end the hand or advance the turn.
    // For now, just updating the player list is okay.

    io.emit('gameStateUpdate', game.gameState);
  });
});
server.listen(PORT, () => {
  console.log(`Server is running and listening on http://localhost:${PORT}`);
});