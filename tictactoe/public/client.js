const socket = io();
let symbol = null;
let myTurn = false;
let gameId = null;

const statusDiv = document.getElementById('status');
const boardDiv = document.getElementById('board');

function render(board) {
  boardDiv.innerHTML = '';
  board.forEach((cell, i) => {
    const d = document.createElement('div');
    d.className = 'cell' + (cell ? ' taken' : '');
    d.textContent = cell || '';
    d.onclick = () => {
      if (myTurn && !cell) {
        socket.emit('makeMove', { gameId, index: i });
      }
    };
    boardDiv.appendChild(d);
  });
}

socket.on('waiting', () => {
  statusDiv.textContent = 'Waiting for opponent...';
});

socket.on('gameStart', (data) => {
  symbol = data.symbol;
  gameId = data.gameId;
  myTurn = symbol === 'X';
  statusDiv.textContent = 'Game started! You are ' + symbol + (myTurn ? ' (your turn)' : '');
  render(Array(9).fill(null));
});

socket.on('update', (board) => {
  render(board);
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
