const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

let waitingPlayer = null;
let games = {};

io.on('connection', (socket) => {
  if (waitingPlayer) {
    // Start a new game
    const gameId = socket.id + '#' + waitingPlayer.id;
    games[gameId] = {
      board: Array(9).fill(null),
      turn: 'X',
      players: { X: waitingPlayer, O: socket },
    };
    waitingPlayer.emit('gameStart', { symbol: 'X', gameId });
    socket.emit('gameStart', { symbol: 'O', gameId });
    waitingPlayer = null;
  } else {
    waitingPlayer = socket;
    socket.emit('waiting');
  }

  socket.on('makeMove', ({ gameId, index }) => {
    const game = games[gameId];
    if (!game) return;
    const symbol = game.players.X.id === socket.id ? 'X' : 'O';
    if (game.turn !== symbol || game.board[index]) return;
    game.board[index] = symbol;
    game.turn = symbol === 'X' ? 'O' : 'X';
    io.to(game.players.X.id).emit('update', game.board);
    io.to(game.players.O.id).emit('update', game.board);
    // Check for win or draw
    const winner = checkWinner(game.board);
    if (winner || !game.board.includes(null)) {
      io.to(game.players.X.id).emit('gameOver', winner);
      io.to(game.players.O.id).emit('gameOver', winner);
      delete games[gameId];
    }
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
