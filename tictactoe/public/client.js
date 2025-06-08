const socket = io();
let symbol = null;
let myTurn = false;
let gameId = null;

const statusDiv = document.getElementById('status');
const boardDiv = document.getElementById('board');

function render(board, walls = {}) {
  boardDiv.innerHTML = '';
  // 3x3 board, so 4x4 grid for cells and wall spaces
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // Cell
      const cellIdx = row * 3 + col;
      const d = document.createElement('div');
      d.className = 'cell' + (board[cellIdx] ? ' taken' : '');
      d.textContent = board[cellIdx] || '';
      d.style.gridColumn = 1 + col * 2;
      d.style.gridRow = 1 + row * 2;
      d.onclick = () => {
        if (myTurn && !board[cellIdx]) {
          socket.emit('makeMove', { gameId, index: cellIdx });
        }
      };
      boardDiv.appendChild(d);
      // Vertical wall (except after last col)
      if (col < 2) {
        const wallId = `v-${row}-${col}`;
        const wall = document.createElement('div');
        wall.className = 'wall';
        if (walls[wallId]) wall.classList.add('active');
        wall.style.gridColumn = 2 + col * 2;
        wall.style.gridRow = 1 + row * 2;
        wall.onclick = () => {
          socket.emit('toggleWall', { gameId, wallId });
        };
        boardDiv.appendChild(wall);
      }
    }
    // Horizontal walls (except after last row)
    if (row < 2) {
      for (let col = 0; col < 3; col++) {
        const wallId = `h-${row}-${col}`;
        const wall = document.createElement('div');
        wall.className = 'wall horizontal';
        if (walls[wallId]) wall.classList.add('active');
        wall.style.gridColumn = 1 + col * 2;
        wall.style.gridRow = 2 + row * 2;
        wall.onclick = () => {
          socket.emit('toggleWall', { gameId, wallId });
        };
        boardDiv.appendChild(wall);
        // Add vertical wall at intersection (optional, for aesthetics)
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
  myTurn = symbol === 'X';
  statusDiv.textContent = 'Game started! You are ' + symbol + (myTurn ? ' (your turn)' : '');
  render(Array(9).fill(null), {});
});

socket.on('update', (data) => {
  // data: { board, walls }
  render(data.board, data.walls || {});
  const board = data.board;
  myTurn = (symbol === 'X' && board.filter(Boolean).length % 2 === 0) || (symbol === 'O' && board.filter(Boolean).length % 2 === 1);
  statusDiv.textContent = myTurn ? 'Your turn' : 'Opponent\'s turn';
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
