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
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 6; col++) {
      walls[`v-${row}-${col}`] = false;
    }
  }
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      walls[`h-${row}-${col}`] = false;
    }
  }
  return walls;
}

function getEmptyBoard() {
  return Array(49).fill(null);
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
      phase: 1, // 1 = placement, 2 = move, 3 = wall
      placements: { X: 0, O: 0 }, // track pieces placed per player
      maxPieces: 2,
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
      // Placement phase: only allow placing on empty squares, alternate turns, max 2 pieces per player
      if (game.turn !== symbol || game.board[index]) return;
      // Count how many pieces this player has on the board
      const playerPieces = game.board.filter(cell => cell === symbol).length;
      if (playerPieces >= game.maxPieces) return;
      game.board[index] = symbol;
      // Recount after placement
      const newPlayerPieces = game.board.filter(cell => cell === symbol).length;
      // If both players have placed all their pieces, move to phase 2
      const xCount = game.board.filter(cell => cell === 'X').length;
      const oCount = game.board.filter(cell => cell === 'O').length;
      if (xCount === game.maxPieces && oCount === game.maxPieces) {
        game.phase = 2;
        game.turn = 'X'; // X starts first in phase 2
        // Notify players about phase transition
        game.players.X.emit('startTurn');
        game.players.O.emit('endTurn');
      }
      game.turn = symbol === 'X' ? 'O' : 'X';
      io.to(game.players.X.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase, placements: { X: xCount, O: oCount }, maxPieces: game.maxPieces });
      io.to(game.players.O.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase, placements: { X: xCount, O: oCount }, maxPieces: game.maxPieces });
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

  socket.on('movePiece', ({ gameId, from, to }) => {
    const game = games[gameId];
    if (!game) return;
    if (game.phase !== 2) return;
    const symbol = game.players.X.id === socket.id ? 'X' : 'O';
    // Only allow moving own piece
    if (game.turn !== symbol) return;
    if (game.board[from] !== symbol) return;
    if (game.board[to]) return;
    // Only allow up/down/left/right
    const fromRow = Math.floor(from / 7), fromCol = from % 7;
    const toRow = Math.floor(to / 7), toCol = to % 7;
    if (!((fromRow === toRow && Math.abs(fromCol - toCol) === 1) || (fromCol === toCol && Math.abs(fromRow - toRow) === 1))) return;
    // Check if walls block the movement
    if (isWallBlocking(from, to, game.walls)) return;
    // Move piece
    game.board[from] = null;
    game.board[to] = symbol;
    // Don't switch turns here - let the client manage the 2-move system
    io.to(game.players.X.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase, placements: { X: game.board.filter(c=>c==='X').length, O: game.board.filter(c=>c==='O').length }, maxPieces: game.maxPieces });
    io.to(game.players.O.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase, placements: { X: game.board.filter(c=>c==='X').length, O: game.board.filter(c=>c==='O').length }, maxPieces: game.maxPieces });
    // Check for area-based win condition
    const winner = checkAreaBasedWinner(game.board, game.walls);
    if (winner) {
      io.to(game.players.X.id).emit('gameOver', winner);
      io.to(game.players.O.id).emit('gameOver', winner);
      delete games[gameId];
    }
  });

  socket.on('endTurn', ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;
    const symbol = game.players.X.id === socket.id ? 'X' : 'O';
    if (game.turn !== symbol) return;
    
    // Switch turns
    game.turn = symbol === 'X' ? 'O' : 'X';
    
    // Notify current player their turn ended
    socket.emit('endTurn');
    
    // Notify other player their turn started
    const otherPlayer = symbol === 'X' ? game.players.O : game.players.X;
    otherPlayer.emit('startTurn');
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

  socket.on('placeWall', ({ gameId, wallId, cellIdx }) => {
    const game = games[gameId];
    if (!game) return;
    if (game.phase !== 2) return;
    const symbol = game.players.X.id === socket.id ? 'X' : 'O';
    if (game.turn !== symbol) return;
    // Validate wall is adjacent to the last moved-to cell
    if (typeof cellIdx !== 'number') return;
    // Helper function to check adjacency
    function isWallAdjacentToCell(wallId, cellIdx) {
      const row = Math.floor(cellIdx / 7);
      const col = cellIdx % 7;
      if (wallId.startsWith('v-')) {
        const [_, wRow, wCol] = wallId.split('-').map(Number);
        return (wRow === row && (wCol === col || wCol === col - 1));
      } else if (wallId.startsWith('h-')) {
        const [_, wRow, wCol] = wallId.split('-').map(Number);
        return (wCol === col && (wRow === row || wRow === row - 1));
      }
      return false;
    }
    if (!isWallAdjacentToCell(wallId, cellIdx)) return;
    // Only allow placing if wall is not already present
    if (game.walls[wallId]) return;
    game.walls[wallId] = true;
    io.to(game.players.X.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase, placements: { X: game.board.filter(c=>c==='X').length, O: game.board.filter(c=>c==='O').length }, maxPieces: game.maxPieces });
    io.to(game.players.O.id).emit('update', { board: game.board, walls: game.walls, phase: game.phase, placements: { X: game.board.filter(c=>c==='X').length, O: game.board.filter(c=>c==='O').length }, maxPieces: game.maxPieces });
    
    // Check for area-based win condition after wall placement
    console.log('Checking area-based win condition after wall placement');
    console.log('Current board:', game.board);
    console.log('Current walls:', Object.keys(game.walls).filter(w => game.walls[w]));
    
    // Calculate areas for each player
    const areas = calculatePlayerAreas(game.board, game.walls);
    const totalArea = areas.X + areas.O;
    console.log(`Areas after wall: X=${areas.X}, O=${areas.O}, total=${totalArea}`);
    
    // Check if the combined area is less than or equal to board size
    // This means walls have created separation and the game should end
    if (totalArea <= 49) {
      // Game should end
      let winner = null;
      if (areas.X > areas.O) winner = 'X';
      else if (areas.O > areas.X) winner = 'O';
      else winner = 'draw';
      console.log(`Game ending due to area constraint. Winner: ${winner}`);
      io.to(game.players.X.id).emit('gameOver', winner);
      io.to(game.players.O.id).emit('gameOver', winner);
      delete games[gameId];
      return;
    }
    
    // End turn after wall placement in phase 2
    // Switch turns
    game.turn = symbol === 'X' ? 'O' : 'X';
    // Notify current player their turn ended
    socket.emit('endTurn');
    // Notify other player their turn started
    const otherPlayer = symbol === 'X' ? game.players.O : game.players.X;
    otherPlayer.emit('startTurn');
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

function areAllPiecesEnclosed(board, walls) {
  // Check if all pieces of both players are completely enclosed
  const xPieces = [];
  const oPieces = [];
  
  for (let i = 0; i < 49; i++) {
    if (board[i] === 'X') xPieces.push(i);
    if (board[i] === 'O') oPieces.push(i);
  }
  
  // If either player has no pieces, they're not "enclosed"
  if (xPieces.length === 0 || oPieces.length === 0) return false;
  
  // Check if each player's pieces are in enclosed regions
  const xEnclosed = isPiecesGroupEnclosed(xPieces, board, walls);
  const oEnclosed = isPiecesGroupEnclosed(oPieces, board, walls);
  
  return xEnclosed && oEnclosed;
}

function isPiecesGroupEnclosed(pieces, board, walls) {
  // For each piece, do a flood fill to find its connected region
  // If any region can reach the board boundary without crossing walls, it's not enclosed
  const visited = new Set();
  
  for (const piece of pieces) {
    if (visited.has(piece)) continue;
    
    const region = floodFillRegion(piece, board, walls, visited);
    
    // Check if this region touches the board boundary
    for (const cell of region) {
      const row = Math.floor(cell / 7);
      const col = cell % 7;
      
      // Check if on boundary and can escape
      if (row === 0 || row === 6 || col === 0 || col === 6) {
        if (canEscapeBoundary(cell, board, walls)) {
          return false; // Not enclosed - can escape to boundary
        }
      }
    }
  }
  
  return true; // All pieces are in enclosed regions
}

function canEscapeBoundary(cell, board, walls) {
  const row = Math.floor(cell / 7);
  const col = cell % 7;
  
  // Check each direction from the boundary cell
  const directions = [
    { dr: -1, dc: 0, wallCheck: () => row > 0 ? !isWallBlocking(cell, (row-1)*7 + col, walls) : !walls[`h-${row-1}-${col}`] },
    { dr: 1, dc: 0, wallCheck: () => row < 6 ? !isWallBlocking(cell, (row+1)*7 + col, walls) : !walls[`h-${row}-${col}`] },
    { dr: 0, dc: -1, wallCheck: () => col > 0 ? !isWallBlocking(cell, row*7 + (col-1), walls) : !walls[`v-${row}-${col-1}`] },
    { dr: 0, dc: 1, wallCheck: () => col < 6 ? !isWallBlocking(cell, row*7 + (col+1), walls) : !walls[`v-${row}-${col}`] }
  ];
  
  for (const { dr, dc, wallCheck } of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    
    // If moving outside the 7x7 grid and no wall blocks it, this is an "escape"
    if (newRow < 0 || newRow >= 7 || newCol < 0 || newCol >= 7) {
      if (wallCheck()) {
        return true; // Can escape - no wall blocking exit from board
      }
    }
  }
  
  return false; // Cannot escape - walls block all exits
}

function floodFillRegion(startCell, board, walls, globalVisited) {
  const region = new Set();
  const queue = [startCell];
  const visited = new Set();
  
  while (queue.length > 0) {
    const cell = queue.shift();
    if (visited.has(cell)) continue;
    
    visited.add(cell);
    globalVisited.add(cell);
    region.add(cell);
    
    const row = Math.floor(cell / 7);
    const col = cell % 7;
    
    // Check all 4 directions
    const neighbors = [
      { newRow: row - 1, newCol: col }, // up
      { newRow: row + 1, newCol: col }, // down
      { newRow: row, newCol: col - 1 }, // left
      { newRow: row, newCol: col + 1 }  // right
    ];
    
    for (const { newRow, newCol } of neighbors) {
      if (newRow >= 0 && newRow < 7 && newCol >= 0 && newCol < 7) {
        const neighborCell = newRow * 7 + newCol;
        
        // Only include if not blocked by wall and not already visited
        if (!visited.has(neighborCell) && !isWallBlocking(cell, neighborCell, walls)) {
          queue.push(neighborCell);
        }
      }
    }
  }
  
  return region;
}

function calculatePlayerAreas(board, walls) {
  const areas = { X: 0, O: 0 };
  
  // Get piece positions for each player
  const xPieces = [];
  const oPieces = [];
  for (let i = 0; i < 49; i++) {
    if (board[i] === 'X') xPieces.push(i);
    if (board[i] === 'O') oPieces.push(i);
  }
  
  // Calculate area for X player
  if (xPieces.length > 0) {
    areas.X = calculatePlayerArea(xPieces, board, walls);
  }
  
  // Calculate area for O player  
  if (oPieces.length > 0) {
    areas.O = calculatePlayerArea(oPieces, board, walls);
  }
  
  return areas;
}

function calculatePlayerArea(pieces, board, walls) {
  if (pieces.length === 0) return 0;
  if (pieces.length === 1) {
    // Single piece - just flood fill from it
    const globalVisited = new Set();
    const region = floodFillRegion(pieces[0], board, walls, globalVisited);
    return region.size;
  }

  // Two pieces - check if they're in the same region
  const globalVisited = new Set();
  const region1 = floodFillRegion(pieces[0], board, walls, globalVisited);

  if (globalVisited.has(pieces[1])) {
    // Both pieces in the same region - area is the size of the region
    return region1.size;
  } else {
    // Pieces in different regions - flood fill second piece and add areas
    const region2 = floodFillRegion(pieces[1], board, walls, globalVisited);
    return region1.size + region2.size;
  }
}

function checkAreaBasedWinner(board, walls) {
  // Simple approach: check if the total reachable area from all pieces is less than 9
  const globalVisited = new Set();
  
  // Start flood fill from each piece and empty cell to find total connected area
  for (let i = 0; i < 49; i++) {
    if (!globalVisited.has(i)) {
      floodFillRegion(i, board, walls, globalVisited);
    }
  }
  
  console.log(`Total reachable cells: ${globalVisited.size} out of 49`);
  console.log(`Reachable cells:`, Array.from(globalVisited));
  
  // If we can't reach all 49 cells, the game is enclosed and should end
  if (globalVisited.size < 49) {
    // Calculate areas for each player
    const areas = calculatePlayerAreas(board, walls);
    
    console.log(`Game enclosed! Total reachable: ${globalVisited.size}/49. Areas - X: ${areas.X}, O: ${areas.O}`);
    
    if (areas.X > areas.O) {
      return 'X';
    } else if (areas.O > areas.X) {
      return 'O';
    } else {
      return 'draw'; // Equal areas
    }
  }
  
  return null; // Game continues - all areas are still reachable
}

function isWallBlocking(from, to, walls) {
  const fromRow = Math.floor(from / 7), fromCol = from % 7;
  const toRow = Math.floor(to / 7), toCol = to % 7;
  
  // Moving horizontally (left/right)
  if (fromRow === toRow) {
    if (fromCol < toCol) {
      // Moving right - check vertical wall to the right of 'from'
      const wallId = `v-${fromRow}-${fromCol}`;
      return walls[wallId];
    } else {
      // Moving left - check vertical wall to the right of 'to'
      const wallId = `v-${toRow}-${toCol}`;
      return walls[wallId];
    }
  }
  
  // Moving vertically (up/down)
  if (fromCol === toCol) {
    if (fromRow < toRow) {
      // Moving down - check horizontal wall below 'from'
      const wallId = `h-${fromRow}-${fromCol}`;
      return walls[wallId];
    } else {
      // Moving up - check horizontal wall below 'to'
      const wallId = `h-${toRow}-${toCol}`;
      return walls[wallId];
    }
  }
  
  return false;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port', PORT));
