// Simple Express + WebSocket server for checkers game
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store games and connections in memory (for demo)
const games: Record<string, any> = {};

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    // Handle incoming messages (e.g., join, move)
    // TODO: Implement game logic
    ws.send(JSON.stringify({ type: 'ack', data: message.toString() }));
  });
});

app.get('/', (_req, res) => {
  res.send('Checkers server running');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
