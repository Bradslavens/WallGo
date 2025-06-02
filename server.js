// Simple WallGo multiplayer server using Node.js + Socket.IO
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const size = 7;
function createInitialState() {
  return {
    size,
    phase: 'placement',
    board: Array(size * 2 - 1).fill(0).map(() => Array(size * 2 - 1).fill(null)),
    players: [
      { id: 1, color: '#e74c3c', pieces: [], name: 'Player 1' },
      { id: 2, color: '#27ae60', pieces: [], name: 'Player 2' }
    ],
    currentPlayer: Math.floor(Math.random() * 2),
    placedPieces: 0,
    lastMovedPiece: null,
    wallMode: false,
    moveStep: 0,
    winner: null,
    waiting: true // <--- add waiting flag
  };
}

const rooms = { default: { state: createInitialState(), sockets: [] } };

function broadcastState(room) {
  io.to(room).emit('gameState', rooms[room].state);
}

io.on('connection', (socket) => {
  socket.on('joinRoom', (room) => {
    if (!rooms[room]) rooms[room] = { state: createInitialState(), sockets: [] };
    const roomObj = rooms[room];
    if (roomObj.sockets.length >= 2) {
      socket.emit('roomFull');
      return;
    }
    roomObj.sockets.push(socket);
    socket.join(room);
    const playerNum = roomObj.sockets.length;
    console.log(`Player ${playerNum} joined room '${room}'.`); // Log player join
    socket.emit('playerNum', playerNum);
    // Notify waiting if only one player
    if (roomObj.sockets.length === 1) {
      roomObj.state.waiting = true;
      socket.emit('waitingForPlayer');
      console.log('Waiting for Player 2...');
    }
    if (roomObj.sockets.length === 2) {
      roomObj.state.waiting = false;
      io.to(room).emit('startGame');
      broadcastState(room);
      // Notify both players whose turn it is
      const current = roomObj.state.currentPlayer;
      roomObj.sockets[current].emit('yourTurn', roomObj.state.players[current].name + "'s turn");
      roomObj.sockets[1-current].emit('notYourTurn', roomObj.state.players[current].name + "'s turn");
      console.log('Both players joined. Game started.');
      console.log(`It is ${roomObj.state.players[current].name}'s turn.`);
    }
    // Send state on join
    socket.emit('gameState', roomObj.state);

    socket.on('intent', (action) => {
      handleIntent(room, playerNum, action);
      broadcastState(room);
      // After every action, notify whose turn it is
      const state = rooms[room].state;
      if (!state.waiting) {
        const current = state.currentPlayer;
        if (roomObj.sockets.length === 2) {
          roomObj.sockets[current].emit('yourTurn', state.players[current].name + "'s turn");
          roomObj.sockets[1-current].emit('notYourTurn', state.players[current].name + "'s turn");
          console.log(`It is now ${state.players[current].name}'s turn.`);
        }
      }
    });

    socket.on('disconnect', () => {
      roomObj.sockets = roomObj.sockets.filter(s => s !== socket);
      // Optionally reset game if a player leaves
      roomObj.state = createInitialState();
      broadcastState(room);
      console.log('A player disconnected. Game reset.');
    });
  });
});

function handleIntent(room, playerNum, action) {
  const state = rooms[room].state;
  const playerIdx = playerNum - 1;
  if (state.phase === 'placement' && action.type === 'placePiece') {
    if (state.currentPlayer !== playerIdx) return;
    if (state.players[playerIdx].pieces.length >= 2) return;
    const { row, col } = action;
    if (state.board[row][col]) return;
    state.board[row][col] = { type: 'piece', player: playerNum };
    state.players[playerIdx].pieces.push({ row, col });
    state.placedPieces++;
    if (state.placedPieces < 4) {
      state.currentPlayer = 1 - state.currentPlayer;
    } else {
      state.phase = 'move';
      state.currentPlayer = Math.floor(Math.random() * 2);
    }
  } else if (state.phase === 'move' && action.type === 'movePiece') {
    if (state.currentPlayer !== playerIdx) return;
    // Validate move (1 or 2 spaces, not through wall, not occupied)
    // ... (implement move validation here, see client for logic) ...
    // For now, just move
    const { fromRow, fromCol, toRow, toCol } = action;
    const piece = state.board[fromRow][fromCol];
    if (!piece || piece.type !== 'piece' || piece.player !== playerNum) return;
    if (state.board[toRow][toCol]) return;
    state.board[fromRow][fromCol] = null;
    state.board[toRow][toCol] = { type: 'piece', player: playerNum };
    state.players[playerIdx].pieces = state.players[playerIdx].pieces.map(p => (p.row === fromRow && p.col === fromCol) ? { row: toRow, col: toCol } : p);
    state.lastMovedPiece = { row: toRow, col: toCol };
    state.moveStep++;
    if (state.moveStep >= 2) {
      state.phase = 'wall';
      state.wallMode = true;
      state.moveStep = 0;
    }
  } else if (state.phase === 'wall' && action.type === 'placeWall') {
    if (state.currentPlayer !== playerIdx) return;
    const { row, col } = action;
    if (state.board[row][col]) return;
    state.board[row][col] = { type: 'wall', player: playerNum };
    state.wallMode = false;
    state.phase = 'move';
    state.currentPlayer = 1 - state.currentPlayer;
    // TODO: area calculation, checkGameEnd, etc.
  }
  // TODO: area calculation, checkGameEnd, winner
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
