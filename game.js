const board = document.querySelector('.board');
const size = 7;
let squareCount = 1;
let wallCount = 1;
// Game state
const squares = [];
const walls = [];
const players = [
  { id: 1, color: '#e74c3c', pieces: [], name: 'Player 1' },
  { id: 2, color: '#27ae60', pieces: [], name: 'Player 2' }
];
let currentPlayer = Math.floor(Math.random() * 2); // Random start
let phase = 'placement'; // 'placement', 'move', 'wall', 'end'
let placedPieces = 0;
let selectedPiece = null;
let moveCount = 0;
let lastMovedPiece = null;
let wallMode = false;
let winner = null;
let moveStep = 0;

// Build board and track squares/walls
for (let row = 0; row < size * 2 - 1; row++) {
  const rowDiv = document.createElement('div');
  rowDiv.className = 'board-row';
  for (let col = 0; col < size * 2 - 1; col++) {
    if (row % 2 === 0 && col % 2 === 0) {
      // Square
      const sq = document.createElement('div');
      sq.className = 'square';
      sq.dataset.square = squareCount;
      sq.dataset.row = row;
      sq.dataset.col = col;
      sq.addEventListener('click', () => onSquareClick(sq));
      squares.push(sq);
      rowDiv.appendChild(sq);
      squareCount++;
    } else if (row % 2 === 0 && col % 2 === 1) {
      // Vertical wall
      const wall = document.createElement('div');
      wall.className = 'wall wall-vertical';
      wall.dataset.wall = wallCount;
      wall.dataset.row = row;
      wall.dataset.col = col;
      wall.dataset.active = 'false';
      wall.addEventListener('click', () => onWallClick(wall));
      walls.push(wall);
      rowDiv.appendChild(wall);
      wallCount++;
    } else if (row % 2 === 1 && col % 2 === 0) {
      // Horizontal wall
      const wall = document.createElement('div');
      wall.className = 'wall wall-horizontal';
      wall.dataset.wall = wallCount;
      wall.dataset.row = row;
      wall.dataset.col = col;
      wall.dataset.active = 'false';
      wall.addEventListener('click', () => onWallClick(wall));
      walls.push(wall);
      rowDiv.appendChild(wall);
      wallCount++;
    } else {
      // Intersection
      const inter = document.createElement('div');
      inter.className = 'intersection';
      rowDiv.appendChild(inter);
    }
  }
  board.appendChild(rowDiv);
}

// Add controls
const placeWallBtn = document.getElementById('placeWallBtn');
const gameStatus = document.getElementById('gameStatus');
placeWallBtn.addEventListener('click', () => {
  if (!isMyTurn()) return;
  if (phase === 'move') {
    phase = 'wall';
    wallMode = true;
    placeWallBtn.disabled = true;
    selectedPiece = null;
    moveStep = 0;
    clearHighlights();
    updateStatus();
  }
});

let socket, myPlayerNum;
let latestState = null;

function setupMultiplayer() {
  // Load Socket.IO client script
  const script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.onload = () => {
    socket = io();
    socket.emit('joinRoom', 'default');
    socket.on('playerNum', (num) => {
      myPlayerNum = num;
      updatePlayerIndicator();
      // Only call updateStatus if it is defined
      if (typeof updateStatus === 'function') updateStatus();
    });
    socket.on('waitingForPlayer', () => {
      if (gameStatus) gameStatus.textContent = 'Waiting for Player 2...';
      if (typeof updateStatus === 'function') updateStatus();
    });
    socket.on('yourTurn', (msg) => {
      gameStatus.textContent = msg;
    });
    socket.on('notYourTurn', (msg) => {
      gameStatus.textContent = msg;
    });
    socket.on('startGame', () => {
      if (typeof updateStatus === 'function') updateStatus();
    });
    socket.on('gameState', (state) => {
      latestState = state;
      renderFromState(state);
      updatePlayerIndicator(); // <-- update indicator on every state change
    });
    socket.on('roomFull', () => {
      alert('Room is full. Only two players allowed.');
    });
  };
  document.head.appendChild(script);
}

function sendIntent(type, data) {
  if (socket && typeof myPlayerNum === 'number') {
    socket.emit('intent', { type, ...data });
  }
}

function renderFromState(state) {
  // Clear board
  squares.forEach(sq => {
    while (sq.firstChild) sq.removeChild(sq.firstChild);
  });
  walls.forEach(wall => {
    wall.dataset.active = 'false';
    wall.classList.remove('active-wall');
    wall.dataset.player = '';
  });
  // Render pieces and walls
  for (let row = 0; row < state.board.length; row++) {
    for (let col = 0; col < state.board[row].length; col++) {
      const cell = state.board[row][col];
      if (!cell) continue;
      if (cell.type === 'piece') {
        const sq = getSquare(row, col);
        if (sq) {
          const player = state.players[cell.player - 1];
          const piece = document.createElement('div');
          piece.className = 'piece';
          piece.style.background = player.color;
          piece.dataset.player = player.id;
          sq.appendChild(piece);
        }
      } else if (cell.type === 'wall') {
        const wall = getWall(row, col);
        if (wall) {
          wall.dataset.active = 'true';
          wall.classList.add('active-wall');
          wall.dataset.player = cell.player;
        }
      }
    }
  }
  // Update turn/phase
  phase = state.phase;
  currentPlayer = state.currentPlayer;
  if (typeof updateStatus === 'function') updateStatus();
}

function isMyTurn() {
  if (!latestState) return false;
  if (latestState.phase === 'placement') {
    return myPlayerNum === ((latestState.placedPieces % 2) + 1);
  }
  if (latestState.phase === 'move' || latestState.phase === 'wall') {
    return myPlayerNum === (latestState.currentPlayer + 1);
  }
  return false;
}

// Patch UI event handlers to use server state
function onSquareClick(sq) {
  if (!isMyTurn()) return;
  const row = +sq.dataset.row, col = +sq.dataset.col;
  if (phase === 'placement') {
    // Only allow the player whose turn it is to place their piece
    if (myPlayerNum !== ((latestState.placedPieces % 2) + 1)) return;
    sendIntent('placePiece', { row, col });
  } else if (phase === 'move' && !wallMode) {
    // Only allow selecting/moving if it's your piece
    const piece = sq.querySelector('.piece');
    if (piece && +piece.dataset.player === myPlayerNum && !selectedPiece) {
      selectedPiece = { sq, piece };
      moveStep = 0;
      highlightMoves(sq);
    } else if (selectedPiece && isValidMove(selectedPiece.sq, sq)) {
      sendIntent('movePiece', {
        fromRow: +selectedPiece.sq.dataset.row, fromCol: +selectedPiece.sq.dataset.col,
        toRow: row, toCol: col
      });
      selectedPiece = null;
      clearHighlights();
    }
  }
}

function onWallClick(wall) {
  if (!isMyTurn()) return;
  if (phase === 'wall' && wallMode && wall.dataset.active === 'false') {
    const row = +wall.dataset.row, col = +wall.dataset.col;
    sendIntent('placeWall', { row, col });
  }
}

function updatePlayerIndicator() {
  const indicator = document.getElementById('playerIndicator');
  if (!indicator) return;
  // Use latestState if available for correct player mapping
  let playerNum = myPlayerNum;
  // Use playerNum as 1 or 2, but only if it is 1 or 2
  if (playerNum === 1 || playerNum === 2) {
    // Use static color and name mapping
    const color = playerNum === 1 ? '#e74c3c' : '#27ae60';
    const name = playerNum === 1 ? 'Player 1' : 'Player 2';
    indicator.innerHTML = `You are <span style="color:${color}; font-weight:bold;">${name}</span>`;
  } else {
    indicator.textContent = '';
  }
}

function getSquare(row, col) {
  return squares.find(sq => +sq.dataset.row === row && +sq.dataset.col === col);
}

function highlightMoves(sq) {
  // Highlight valid moves for the selected piece
  squares.forEach(target => {
    target.classList.remove('highlight');
    if (isValidMove(sq, target)) {
      target.classList.add('highlight');
    }
  });
}

function clearHighlights() {
  squares.forEach(sq => sq.classList.remove('highlight'));
}

function isValidMove(fromSq, toSq) {
  // Only squares, not occupied, not through wall, not diagonal, only 1 space up/down/left/right
  if (toSq.querySelector('.piece')) return false;
  const fr = +fromSq.dataset.row, fc = +fromSq.dataset.col;
  const tr = +toSq.dataset.row, tc = +toSq.dataset.col;
  const dr = tr - fr;
  const dc = tc - fc;
  // Only allow 1 space up, down, left, or right
  if ((Math.abs(dr) === 2 && dc === 0) || (Math.abs(dc) === 2 && dr === 0)) {
    // Check for wall in between
    return !isBlocked(fromSq, toSq);
  }
  return false;
}

function isBlocked(fromSq, toSq) {
  // Check for wall in the path
  const fr = +fromSq.dataset.row, fc = +fromSq.dataset.col;
  const tr = +toSq.dataset.row, tc = +toSq.dataset.col;
  const wallRow = (fr + tr) / 2;
  const wallCol = (fc + tc) / 2;
  const wall = getWall(wallRow, wallCol);
  return wall && wall.dataset.active === 'true';
}

function getWall(row, col) {
  return walls.find(w => +w.dataset.row === row && +w.dataset.col === col);
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('overlay');
  const startGameBtn = document.getElementById('startGameBtn');
  if (overlay && startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
      setupMultiplayer(); // Only join multiplayer after clicking Join
    });
  }
  // Remove auto-call to setupMultiplayer here
  if (typeof updateStatus === 'function') updateStatus();
});
