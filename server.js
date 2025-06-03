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
    waiting: true,
    lockedPiece: null // Track which piece is locked for this turn
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
    socket.emit('playerNum', playerNum);
    console.log(`[SERVER] Player ${playerNum} joined room '${room}'.`);
    // Notify waiting if only one player
    if (roomObj.sockets.length === 1) {
      roomObj.state.waiting = true;
      roomObj.state.phase = 'waiting'; // <--- set phase to waiting
      socket.emit('waitingForPlayer');
      console.log('Waiting for Player 2...');
    }
    if (roomObj.sockets.length === 2) {
      roomObj.state.waiting = false;
      roomObj.state.phase = 'placement'; // <--- set phase to placement
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
      console.log(`[SERVER] Received intent from Player ${playerNum}:`, action);
      if (action.type === 'placePiece') {
        console.log(`[SERVER] DEBUG: placePiece intent received for (${action.row},${action.col})`);
      }
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

function isValidMove(state, playerNum, fromRow, fromCol, toRow, toCol) {
  // Only squares (even, even)
  if (toRow % 2 !== 0 || toCol % 2 !== 0) return false;
  // No moving onto another piece
  if (state.board[toRow][toCol]) return false;
  // Must move 1 or 2 spaces, not diagonal, but L-shape allowed
  const dr = Math.abs(toRow - fromRow);
  const dc = Math.abs(toCol - fromCol);
  if (!((dr === 2 && dc === 0) || (dr === 0 && dc === 2) || (dr === 2 && dc === 2))) return false;
  // No moving through walls
  if (dr === 2 && dc === 0) {
    // Vertical move
    const wallRow = (fromRow + toRow) / 2;
    const wallCol = fromCol;
    if (state.board[wallRow][wallCol] && state.board[wallRow][wallCol].type === 'wall') return false;
    if (dr === 2 && dc === 2) {
      // L-shape: check both segments
      const midRow = fromRow;
      const midCol = toCol;
      if (!isValidMove(state, playerNum, fromRow, fromCol, midRow, midCol)) return false;
      if (!isValidMove(state, playerNum, midRow, midCol, toRow, toCol)) return false;
    }
  } else if (dr === 0 && dc === 2) {
    // Horizontal move
    const wallRow = fromRow;
    const wallCol = (fromCol + toCol) / 2;
    if (state.board[wallRow][wallCol] && state.board[wallRow][wallCol].type === 'wall') return false;
    if (dr === 2 && dc === 2) {
      // L-shape: check both segments
      const midRow = toRow;
      const midCol = fromCol;
      if (!isValidMove(state, playerNum, fromRow, fromCol, midRow, midCol)) return false;
      if (!isValidMove(state, playerNum, midRow, midCol, toRow, toCol)) return false;
    }
  } else if (dr === 2 && dc === 2) {
    // L-shape: check both segments
    const mid1 = { row: fromRow, col: toCol };
    const mid2 = { row: toRow, col: fromCol };
    if (!isValidMove(state, playerNum, fromRow, fromCol, mid1.row, mid1.col)) return false;
    if (!isValidMove(state, playerNum, mid1.row, mid1.col, toRow, toCol)) return false;
    if (!isValidMove(state, playerNum, fromRow, fromCol, mid2.row, mid2.col)) return false;
    if (!isValidMove(state, playerNum, mid2.row, mid2.col, toRow, toCol)) return false;
  }
  return true;
}

function isValidWallPlacement(state, playerNum, row, col) {
  // Must be a wall space (odd, even or even, odd)
  if (!((row % 2 === 1 && col % 2 === 0) || (row % 2 === 0 && col % 2 === 1))) return false;
  // Must be adjacent to the last moved piece
  const last = state.lastMovedPiece;
  if (!last) return false;
  if (Math.abs(last.row - row) + Math.abs(last.col - col) !== 1) return false;
  // Must be inactive
  if (state.board[row][col]) return false;
  return true;
}

function handleIntent(room, playerNum, action) {
  const state = rooms[room].state;
  const playerIdx = playerNum - 1;
  if (action.type === 'placePiece') {
    console.log(`[SERVER] handleIntent: Player ${playerNum} attempting to place piece at (${action.row},${action.col}) in phase '${state.phase}' (currentPlayer: ${state.currentPlayer}, playerIdx: ${playerIdx})`);
    if (state.currentPlayer !== playerIdx) {
      console.log(`[SERVER] REJECTED: Not this player's turn.`);
      return;
    }
    if (state.players[playerIdx].pieces.length >= 2) {
      console.log(`[SERVER] REJECTED: Player ${playerNum} already has 2 pieces.`);
      return;
    }
    const { row, col } = action;
    if (state.board[row][col]) {
      console.log(`[SERVER] REJECTED: Square (${row},${col}) is already occupied.`);
      return;
    }
    state.board[row][col] = { type: 'piece', player: playerNum };
    state.players[playerIdx].pieces.push({ row, col });
    state.placedPieces++;
    console.log(`[SERVER] SUCCESS: Player ${playerNum} placed piece at (${row},${col}). placedPieces: ${state.placedPieces}`);
    if (state.placedPieces < 4) {
      state.currentPlayer = 1 - state.currentPlayer;
    } else {
      state.phase = 'move';
      state.currentPlayer = Math.floor(Math.random() * 2);
    }
  } else if (state.phase === 'move' && action.type === 'movePiece') {
    console.log(`[SERVER] Player ${playerNum} intent: movePiece from (${action.fromRow},${action.fromCol}) to (${action.toRow},${action.toCol})`);
    if (state.currentPlayer !== playerIdx) return;
    // Find which piece is being moved (by index in player's pieces array)
    let pieceIdx = state.players[playerIdx].pieces.findIndex(p => p.row === action.fromRow && p.col === action.fromCol);
    if (pieceIdx === -1) pieceIdx = 0;
    // If this is the first move of the turn, set lockedPiece
    if (!state.lockedPiece) {
      state.lockedPiece = { player: playerNum, pieceId: pieceIdx };
    } else {
      // Only allow moving the locked piece
      if (state.lockedPiece.player !== playerNum || pieceIdx !== state.lockedPiece.pieceId) {
        console.log(`[SERVER] REJECTED: Only the locked piece can be moved this turn. lockedPiece:`, state.lockedPiece, 'attempted:', pieceIdx);
        return;
      }
    }
    // Only allow moving your own piece, 1 or 2 spaces, L-shape, not through walls/pieces
    const { fromRow, fromCol, toRow, toCol } = action;
    const piece = state.board[fromRow][fromCol];
    if (!piece || piece.type !== 'piece' || piece.player !== playerNum) return;
    if (!isValidMove(state, playerNum, fromRow, fromCol, toRow, toCol)) return;
    state.board[fromRow][fromCol] = null;
    state.board[toRow][toCol] = { type: 'piece', player: playerNum };
    state.players[playerIdx].pieces = state.players[playerIdx].pieces.map(p => (p.row === fromRow && p.col === fromCol) ? { row: toRow, col: toCol } : p);
    state.lastMovedPiece = { row: toRow, col: toCol };
    state.moveStep++;
    if (state.moveStep >= 2) {
      state.phase = 'wall';
      state.wallMode = true;
      state.moveStep = 0;
      state.lockedPiece = null; // Reset lock for next turn
    }
  } else if (state.phase === 'wall' && action.type === 'placeWall') {
    console.log(`[SERVER] Player ${playerNum} intent: placeWall at (${action.row},${action.col})`);
    if (state.currentPlayer !== playerIdx) {
      console.log(`[SERVER] REJECTED: Not this player's turn for wall placement.`);
      return;
    }
    const { row, col } = action;
    if (state.board[row][col]) {
      console.log(`[SERVER] REJECTED: Wall already exists at (${row},${col}).`);
      return;
    }
    state.board[row][col] = { type: 'wall', player: playerNum };
    state.wallMode = false;
    state.phase = 'move';
    state.currentPlayer = 1 - state.currentPlayer;
    state.lockedPiece = null; // Reset lock for next turn
    console.log(`[SERVER] SUCCESS: Player ${playerNum} placed wall at (${row},${col}). Next turn: Player ${state.currentPlayer + 1}`);
  }
  // TODO: area calculation, checkGameEnd, winner
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
