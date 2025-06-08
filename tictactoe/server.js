const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

let waitingPlayer = null;
let games = {};

function getEmptyWalls() {
  const walls = {};
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      walls[`v-${row}-${col}`] = false;
    }
  }
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      walls[`h-${row}-${col}`] = false;
    }
  }
  return walls;
}

function getEmptyBoard() {
  return Array(9).fill(null);
}

io.on('connection', (socket) => {
  if (waitingPlayer) {
    // Start a new game
    const gameId = socket.id + '#' + waitingPlayer.id;
    // Randomly choose who is X and O
    const isX = Math.random() < 0.5;
    const playerX = isX ? waitingPlayer : socket;
    const playerO = isX ? socket : waitingPlayer;
    games[gameId] = {
      board: getEmptyBoard(),
      turn: 'X',
      players: { X: playerX, O: playerO },
      walls: getEmptyWalls(),
      phase: 1, // 1 = placement, 2 = play, 3 = wall
      placements: 0, // count of pieces placed
    };
    playerX.emit('gameStart', { symbol: 'X', gameId, phase: 1 });
    playerO.emit('gameStart', { symbol: 'O', gameId, phase: 1 });
    waitingPlayer = null;
  } else {
    waitingPlayer = socket;
    socket.emit('waiting');
  }

  socket.on('makeMove', ({ gameId, index }) => {
    const game = games[gameId];
    if (!game) return;
    const symbol = game.players.X.id === socket.id ? 'X' : 'O';
    if (game.phase === 1) {
      // Placement phase: only allow placing on empty squares, alternate turns
      if (game.turn !== symbol || game.board[index]) return;
      game.board[index] = symbol;
      game.placements++;
      // After 6 placements (3 per player), move to phase 2
      if (game.placements >= 6) {
        game.phase = 2;
      }
      game.turn = symbol === 'X' ? 'O' : 'X';
      io.to(game.players.X.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase });
      io.to(game.players.O.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase });
      return;
    }
    if (game.phase === 2) {
      // Normal moves
      if (game.turn !== symbol || game.board[index]) return;
      game.board[index] = symbol;
      game.turn = symbol === 'X' ? 'O' : 'X';
      io.to(game.players.X.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase });
      io.to(game.players.O.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase });
      // Check for win or draw
      const winner = checkWinner(game.board);
      if (winner || !game.board.includes(null)) {
        io.to(game.players.X.id).emit('gameOver', winner);
        io.to(game.players.O.id).emit('gameOver', winner);
        delete games[gameId];
      }
    }
  });

  socket.on('toggleWall', ({ gameId, wallId }) => {
    const game = games[gameId];
    if (!game) return;
    // Walls can only be placed in phase 3
    if (game.phase !== 3) return;
    game.walls[wallId] = !game.walls[wallId];
    io.to(game.players.X.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase });
    io.to(game.players.O.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase });
  });

  socket.on('disconnect', () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
    // Remove player from any game
    for (const [gameId, game] of Object.entries(games)) {
      if (game.players.X.id === socket.id || game.players.O.id === socket.id) {
        io.to(game.players.X.id).emit('opponentLeft');
        io.to(game.players.O.id).emit('opponentLeft');
        delete games[gameId];
      }
    }
  });
});

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port', PORT));
