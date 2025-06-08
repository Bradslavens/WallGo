const socket = io();
let symbol = null;
let myTurn = false;
let gameId = null;
let phase = 1;
let placements = { X: 0, O: 0 };
let maxPieces = 2;
let selectedPiece = null;
let moveCount = 0; // Track the number of moves per turn
let lastMovedTo = null; // Track the last cell a piece was moved to this turn
let wallPlacedThisTurn = false; // Track if a wall has been placed this turn

const statusDiv = document.getElementById('status');
const boardDiv = document.getElementById('board');

function isAdjacent(from, to) {
  // Only up/down/left/right, not diagonal
  const fromRow = Math.floor(from / 3), fromCol = from % 3;
  const toRow = Math.floor(to / 3), toCol = to % 3;
  return (
    (fromRow === toRow && Math.abs(fromCol - toCol) === 1) ||
    (fromCol === toCol && Math.abs(fromRow - toRow) === 1)
  );
}

function isWallBlocking(from, to, walls) {
  const fromRow = Math.floor(from / 3), fromCol = from % 3;
  const toRow = Math.floor(to / 3), toCol = to % 3;
  
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

function render(board, walls = {}, phaseArg = 1, placementsArg = { X: 0, O: 0 }, maxPiecesArg = 2) {
  phase = phaseArg;
  placements = placementsArg;
  maxPieces = maxPiecesArg;
  boardDiv.innerHTML = '';
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellIdx = row * 3 + col;
      const d = document.createElement('div');
      d.className = 'cell' + (board[cellIdx] ? ' taken' : '');
      d.textContent = board[cellIdx] || '';
      d.style.gridColumn = 1 + col * 2;
      d.style.gridRow = 1 + row * 2;
      if (phase === 2) {
        if (selectedPiece === cellIdx) d.style.background = '#b3e5fc';
        if (board[cellIdx] === symbol) {
          d.style.cursor = 'pointer'; // Show hand cursor for own pieces
        }
        d.onclick = () => {
          if (!myTurn) return;
          if (moveCount >= 2 && !wallPlacedThisTurn) {
            statusDiv.textContent = 'You have used your 2 moves. You must place a wall to end your turn.';
            return;
          }

          if (selectedPiece === null) {
            // Select a piece to move
            if (board[cellIdx] === symbol) {
              selectedPiece = cellIdx;
              render(board, walls, phase, placements, maxPieces);
            }
          } else {
            // Try to move to this cell
            if (!board[cellIdx] && isAdjacent(selectedPiece, cellIdx) && !isWallBlocking(selectedPiece, cellIdx, walls)) {
              socket.emit('movePiece', { gameId, from: selectedPiece, to: cellIdx });
              lastMovedTo = cellIdx; // Track the last cell moved to
              selectedPiece = cellIdx; // Allow moving the same piece again
              moveCount++;
              wallPlacedThisTurn = false; // Reset wall placement for this move
              if (moveCount >= 2) {
                statusDiv.textContent = 'You have used your 2 moves. You must place a wall to end your turn.';
              }
            } else if (board[cellIdx] === symbol) {
              // Select a different own piece
              selectedPiece = cellIdx;
              render(board, walls, phase, placements, maxPieces);
            } else {
              // Clicked invalid cell, deselect
              selectedPiece = null;
              render(board, walls, phase, placements, maxPieces);
            }
          }
        };
      } else if (phase === 1) {
        d.onclick = () => {
          const playerPieces = board.filter(cell => cell === symbol).length;
          if (myTurn && !board[cellIdx] && playerPieces < maxPieces) {
            socket.emit('makeMove', { gameId, index: cellIdx });
          }
        };
      }
      boardDiv.appendChild(d);
      if (col < 2) {
        const wallId = `v-${row}-${col}`;
        const wall = document.createElement('div');
        wall.className = 'wall';
        if (walls[wallId]) wall.classList.add('active');
        wall.style.gridColumn = 2 + col * 2;
        wall.style.gridRow = 1 + row * 2;
        wall.onclick = () => {
          if (phase === 2 && myTurn && moveCount > 0 && !wallPlacedThisTurn && isWallAdjacentToCell(wallId, lastMovedTo)) {
            socket.emit('placeWall', { gameId, wallId, cellIdx: lastMovedTo });
            wallPlacedThisTurn = true;
          } else if (phase === 3) {
            socket.emit('toggleWall', { gameId, wallId });
          }
        };
        boardDiv.appendChild(wall);
      }
    }
    if (row < 2) {
      for (let col = 0; col < 3; col++) {
        const wallId = `h-${row}-${col}`;
        const wall = document.createElement('div');
        wall.className = 'wall horizontal';
        if (walls[wallId]) wall.classList.add('active');
        wall.style.gridColumn = 1 + col * 2;
        wall.style.gridRow = 2 + row * 2;
        wall.onclick = () => {
          if (phase === 2 && myTurn && moveCount > 0 && !wallPlacedThisTurn && isWallAdjacentToCell(wallId, lastMovedTo)) {
            socket.emit('placeWall', { gameId, wallId, cellIdx: lastMovedTo });
            wallPlacedThisTurn = true;
          } else if (phase === 3) {
            socket.emit('toggleWall', { gameId, wallId });
          }
        };
        boardDiv.appendChild(wall);
        if (col < 2) {
          const inter = document.createElement('div');
          inter.style.gridColumn = 2 + col * 2;
          inter.style.gridRow = 2 + row * 2;
          inter.style.width = '12px';
          inter.style.height = '12px';
          inter.style.background = 'transparent';
          boardDiv.appendChild(inter);
        }
      }
    }
  }
}

// Helper to check if a wall is adjacent to a cell
function isWallAdjacentToCell(wallId, cellIdx) {
  const row = Math.floor(cellIdx / 3);
  const col = cellIdx % 3;
  if (wallId.startsWith('v-')) {
    const [_, wRow, wCol] = wallId.split('-').map(Number);
    return (wRow === row && (wCol === col || wCol === col - 1));
  } else if (wallId.startsWith('h-')) {
    const [_, wRow, wCol] = wallId.split('-').map(Number);
    return (wCol === col && (wRow === row || wRow === row - 1));
  }
  return false;
}

socket.on('waiting', () => {
  statusDiv.textContent = 'Waiting for opponent...';
});

socket.on('gameStart', (data) => {
  symbol = data.symbol;
  gameId = data.gameId;
  phase = data.phase || 1;
  placements = data.placements || { X: 0, O: 0 };
  maxPieces = data.maxPieces || 2;
  myTurn = symbol === 'X'; // X always starts first
  moveCount = 0; // Reset move count at game start
  statusDiv.textContent = 'Game started! You are ' + symbol + (myTurn ? ' (your turn)' : '');
  render(Array(9).fill(null), {}, phase, placements, maxPieces);
});

socket.on('update', (data) => {
  render(data.board, data.walls || {}, data.phase || 1, data.placements || { X: 0, O: 0 }, data.maxPieces || 2);
  const board = data.board;
  phase = data.phase || 1;
  placements = data.placements || { X: 0, O: 0 };
  maxPieces = data.maxPieces || 2;
  if (phase === 1) {
    myTurn = (symbol === 'X' && board.filter(Boolean).length % 2 === 0) || (symbol === 'O' && board.filter(Boolean).length % 2 === 1);
    statusDiv.textContent = myTurn ? `Your turn to place a piece (${placements[symbol]}/${maxPieces})` : `Opponent's turn to place a piece (${placements[symbol === 'X' ? 'O' : 'X']}/${maxPieces})`;
  } else  if (phase === 2) {
    // Don't change myTurn here - let endTurn/startTurn events handle it
    if (myTurn) {
      if (moveCount === 0) {
        statusDiv.textContent = 'Your turn - move a piece to begin';
      } else if (moveCount < 2) {
        statusDiv.textContent = `Your turn (${moveCount}/2 moves used)` + (lastMovedTo !== null && !wallPlacedThisTurn ? ' - You may place a wall or continue moving' : '');
      } else {
        statusDiv.textContent = 'You have used your 2 moves. You must place a wall to end your turn.';
      }
    } else {
      statusDiv.textContent = 'Opponent\'s turn';
    }
  }else if (phase === 3) {
    statusDiv.textContent = myTurn ? 'Your turn to place a wall' : 'Opponent\'s turn to place a wall';
  }
});

socket.on('gameOver', (winner) => {
  if (winner) {
    statusDiv.textContent = winner === symbol ? 'You win!' : 'You lose!';
  } else {
    statusDiv.textContent = 'Draw!';
  }
  myTurn = false;
});

socket.on('opponentLeft', () => {
  statusDiv.textContent = 'Opponent left. Refresh to play again.';
  myTurn = false;
});

socket.on('endTurn', () => {
  moveCount = 0;
  myTurn = false;
  selectedPiece = null; // Clear any selected piece when turn ends
  lastMovedTo = null;
  wallPlacedThisTurn = false;
  statusDiv.textContent = 'Waiting for opponent...';
});

socket.on('startTurn', () => {
  moveCount = 0; // Reset move count when turn starts
  myTurn = true;
  selectedPiece = null; // Clear any selected piece when turn starts
  lastMovedTo = null; // Reset for new turn
  wallPlacedThisTurn = false;
  statusDiv.textContent = phase === 2 ? 'Your turn - move a piece to begin' : 'Your turn!';
});
