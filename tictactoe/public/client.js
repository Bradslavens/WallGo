const socket = io();
let symbol = null;
let myTurn = false;
let gameId = null;
let phase = 1;
let placements = { X: 0, O: 0 };
let maxPieces = 2;
let selectedPiece = null;

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
          if (selectedPiece === null) {
            // Select a piece to move
            if (board[cellIdx] === symbol) {
              selectedPiece = cellIdx;
              render(board, walls, phase, placements, maxPieces);
            }
          } else {
            // Try to move to this cell
            if (!board[cellIdx] && isAdjacent(selectedPiece, cellIdx)) {
              socket.emit('movePiece', { gameId, from: selectedPiece, to: cellIdx });
              selectedPiece = null;
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
          if (phase === 3) socket.emit('toggleWall', { gameId, wallId });
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
          if (phase === 3) socket.emit('toggleWall', { gameId, wallId });
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

socket.on('waiting', () => {
  statusDiv.textContent = 'Waiting for opponent...';
});

socket.on('gameStart', (data) => {
  symbol = data.symbol;
  gameId = data.gameId;
  phase = data.phase || 1;
  placements = data.placements || { X: 0, O: 0 };
  maxPieces = data.maxPieces || 2;
  myTurn = symbol === 'X';
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
  } else if (phase === 2) {
    myTurn = (symbol === 'X' && board.filter(Boolean).length % 2 === 0) || (symbol === 'O' && board.filter(Boolean).length % 2 === 1);
    statusDiv.textContent = myTurn ? 'Your turn' : 'Opponent\'s turn';
  } else if (phase === 3) {
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
