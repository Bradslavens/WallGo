const board = document.querySelector('.board');
const size = 3;
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

function onSquareClick(sq) {
  if (phase === 'placement') {
    if (sq.querySelector('.piece')) return;
    const player = players[currentPlayer];
    if (player.pieces.length >= 2) return;
    placePiece(sq, player);
    placedPieces++;
    if (placedPieces < 4) {
      currentPlayer = 1 - currentPlayer;
    } else {
      phase = 'move';
      currentPlayer = Math.floor(Math.random() * 2); // Random start for moves
    }
    updateStatus();
  } else if (phase === 'move' && !wallMode) {
    // Only allow selecting a piece if no piece has been selected yet this turn
    const piece = sq.querySelector('.piece');
    if (piece && +piece.dataset.player === players[currentPlayer].id && !selectedPiece) {
      selectedPiece = { sq, piece };
      moveStep = 0;
      highlightMoves(sq);
    } else if (selectedPiece && isValidMove(selectedPiece.sq, sq)) {
      movePiece(selectedPiece.sq, sq);
      selectedPiece.sq = sq;
      moveStep++;
      clearHighlights();
      if (moveStep < 2) {
        highlightMoves(sq);
      }
      lastMovedPiece = sq;
      placeWallBtn.disabled = false;
    }
  }
}

function onWallClick(wall) {
  if (phase === 'wall' && wallMode && wall.dataset.active === 'false') {
    // Only allow adjacent to last moved piece
    if (lastMovedPiece && isAdjacentWall(lastMovedPiece, wall)) {
      wall.dataset.active = 'true';
      wall.classList.add('active-wall');
      wall.dataset.player = players[currentPlayer].id; // Assign wall to current player
      wallMode = false;
      phase = 'move';
      placeWallBtn.disabled = true;
      currentPlayer = 1 - currentPlayer;
      updateStatus();
      calculateAndLogAreas(); // Log areas each time a wall is placed
      checkGameEnd();
    }
  }
}

function placePiece(sq, player) {
  const piece = document.createElement('div');
  piece.className = 'piece';
  piece.style.background = player.color;
  piece.dataset.player = player.id;
  sq.appendChild(piece);
  player.pieces.push(sq);
}

function movePiece(fromSq, toSq) {
  const piece = fromSq.querySelector('.piece');
  if (!piece) return;
  toSq.appendChild(piece);
  // Update player's piece reference
  const player = players[currentPlayer];
  player.pieces = player.pieces.map(s => (s === fromSq ? toSq : s));
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

function placeWall(wall) {
  wall.dataset.active = 'true';
  wall.classList.add('active-wall');
}

function removeWall(wall) {
  wall.dataset.active = 'false';
  wall.classList.remove('active-wall');
}

function getSquare(row, col) {
  return squares.find(sq => +sq.dataset.row === row && +sq.dataset.col === col);
}
function getWall(row, col) {
  return walls.find(w => +w.dataset.row === row && +w.dataset.col === col);
}
function isAdjacentWall(sq, wall) {
  const sr = +sq.dataset.row, sc = +sq.dataset.col;
  const wr = +wall.dataset.row, wc = +wall.dataset.col;
  return (Math.abs(sr - wr) + Math.abs(sc - wc)) === 1;
}
function highlightMoves(sq) {
  clearHighlights();
  squares.forEach(target => {
    if (isValidMove(sq, target)) {
      target.classList.add('highlight');
    }
  });
}
function clearHighlights() {
  squares.forEach(sq => sq.classList.remove('highlight'));
}
function updateStatus() {
  if (phase === 'placement') {
    gameStatus.textContent = `${players[currentPlayer].name}'s turn to place a piece.`;
  } else if (phase === 'move') {
    gameStatus.textContent = `${players[currentPlayer].name}'s turn to move.`;
  } else if (phase === 'wall') {
    gameStatus.textContent = `${players[currentPlayer].name}: Place a wall adjacent to your piece.`;
  } else if (phase === 'end') {
    gameStatus.textContent = winner ? `${winner} wins!` : 'Game over!';
  }
}
function checkGameEnd() {
  // End if no moves or all pieces are in fully enclosed areas (cannot increase area)
  let canMove = false;
  players.forEach(player => {
    player.pieces.forEach(sq => {
      squares.forEach(target => {
        if (isValidMove(sq, target)) canMove = true;
      });
    });
  });
  // If any piece can move, game is not over
  if (canMove) return;

  // Check if any wall placement could increase a player's area
  let canIncreaseArea = false;
  walls.forEach(wall => {
    if (wall.dataset.active === 'false') {
      // Simulate placing the wall for each player
      wall.dataset.active = 'true';
      players.forEach(player => {
        const areaBefore = player.pieces.reduce((sum, sq) => sum + getFloodArea(sq), 0);
        // Remove wall and recalculate
        wall.dataset.active = 'false';
        const areaAfter = player.pieces.reduce((sum, sq) => sum + getFloodArea(sq), 0);
        wall.dataset.active = 'true'; // restore for next player
        if (areaAfter > areaBefore) canIncreaseArea = true;
      });
      wall.dataset.active = 'false'; // restore
    }
  });
  if (canIncreaseArea) return;

  // If no moves and no wall placement can increase area, game ends
  phase = 'end';
  calculateAndLogAreas();
  updateStatus();
}

function getFloodArea(sq) {
  // Returns the size of the area reachable from sq (excluding other pieces)
  const visited = new Set();
  function flood(sq) {
    const key = sq.dataset.square;
    if (visited.has(key)) return;
    visited.add(key);
    const dirs = [ [0,2], [0,-2], [2,0], [-2,0] ];
    for (const [dr,dc] of dirs) {
      const nr = +sq.dataset.row + dr;
      const nc = +sq.dataset.col + dc;
      const nextSq = getSquare(nr, nc);
      if (nextSq && !isBlocked(sq, nextSq) && !nextSq.querySelector('.piece')) {
        flood(nextSq);
      }
    }
  }
  flood(sq);
  return visited.size;
}

function floodFillArea(sq, areaSquares, areaPlayers, visited) {
  const key = sq.dataset.square;
  if (visited.has(key)) return;
  visited.add(key);
  areaSquares.add(sq);
  const piece = sq.querySelector('.piece');
  if (piece) areaPlayers.add(+piece.dataset.player);
  const dirs = [ [0,2], [0,-2], [2,0], [-2,0] ];
  for (const [dr,dc] of dirs) {
    const nr = +sq.dataset.row + dr;
    const nc = +sq.dataset.col + dc;
    const nextSq = getSquare(nr, nc);
    if (nextSq && !isBlocked(sq, nextSq)) {
      floodFillArea(nextSq, areaSquares, areaPlayers, visited);
    }
  }
}
function calculateAndLogAreas() {
  // Find all unique areas and which player's pieces are in them
  const visited = new Set();
  const areaList = [];
  squares.forEach(sq => {
    if (!visited.has(sq.dataset.square) && !sq.querySelector('.piece')) {
      const areaSquares = new Set();
      const areaPlayers = new Set();
      floodFillArea(sq, areaSquares, areaPlayers, visited);
      if (areaPlayers.size > 0) {
        areaList.push({ squares: areaSquares, players: areaPlayers });
      }
    }
  });
  // Also check for areas containing pieces
  players.forEach(player => {
    player.pieces.forEach(sq => {
      if (!visited.has(sq.dataset.square)) {
        const areaSquares = new Set();
        const areaPlayers = new Set();
        floodFillArea(sq, areaSquares, areaPlayers, visited);
        if (areaPlayers.size > 0) {
          areaList.push({ squares: areaSquares, players: areaPlayers });
        }
      }
    });
  });
  // Calculate totals for each player
  const playerTotals = [0, 0];
  areaList.forEach(area => {
    area.players.forEach(pid => {
      playerTotals[pid-1] += area.squares.size;
    });
  });
  // Log the results
  console.log(`${players[0].name} area:`, playerTotals[0]);
  console.log(`${players[1].name} area:`, playerTotals[1]);
  areaList.forEach((area, i) => {
    const playerNames = Array.from(area.players).map(pid => players[pid-1].name).join(', ');
    console.log(`Area ${i+1}: size=${area.squares.size}, players=[${playerNames}]`);
  });
  // Show overlay if either area is less than total
  const totalArea = size * size;
  if (playerTotals[0] < totalArea || playerTotals[1] < totalArea) {
    showEndOverlay(playerTotals);
  }
}

function showEndOverlay(playerTotals) {
  const endOverlay = document.getElementById('endOverlay');
  const areaResults = document.getElementById('areaResults');
  const totalArea = size * size;
  let winnerText = '';
  if (playerTotals[0] > playerTotals[1]) {
    winnerText = `${players[0].name} wins!`;
  } else if (playerTotals[1] > playerTotals[0]) {
    winnerText = `${players[1].name} wins!`;
  } else {
    winnerText = "It's a tie!";
  }
  areaResults.innerHTML = `
    <p>${players[0].name} area: <strong>${playerTotals[0]}</strong></p>
    <p>${players[1].name} area: <strong>${playerTotals[1]}</strong></p>
    <h3>${winnerText}</h3>
  `;
  endOverlay.style.display = 'flex';
}

function hideEndOverlay() {
  const endOverlay = document.getElementById('endOverlay');
  endOverlay.style.display = 'none';
}

// Attach restart logic
if (document.getElementById('restartGameBtn')) {
  document.getElementById('restartGameBtn').onclick = () => window.location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('overlay');
  const startGameBtn = document.getElementById('startGameBtn');
  if (overlay && startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
  }
  const endGameBtn = document.getElementById('endGameBtn');
  if (endGameBtn) {
    endGameBtn.addEventListener('click', () => {
      phase = 'end';
      calculateAndLogAreas();
      updateStatus();
    });
  }
});
updateStatus();
