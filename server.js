const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const GAME_FILE = path.join(__dirname, 'battle_survival_pro.html');
const MAX_PLAYERS = 4;
const rooms = new Map();
const clients = new Map();
const quickQueue = [];
let quickTimer = null;

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function safeName(value) {
  return String(value || 'Jogador').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Jogador';
}
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function playerView(p) {
  return { id: p.id, name: p.name, skin: p.skin, x: p.x, y: p.y, angle: p.angle, hp: p.hp, alive: p.alive };
}
function roomView(room) {
  return { code: room.code, hostId: room.hostId, status: room.status, map: room.map, players: [...room.players.values()].map(playerView) };
}
function broadcastRoom(room, message) {
  for (const p of room.players.values()) send(p.ws, message);
}
function updateRoom(room) { broadcastRoom(room, { type: 'roomUpdate', room: roomView(room) }); }
function removeFromQueue(p) {
  const i = quickQueue.indexOf(p);
  if (i >= 0) quickQueue.splice(i, 1);
}
function leaveRoom(p) {
  removeFromQueue(p);
  const room = p.roomCode && rooms.get(p.roomCode);
  if (!room) { p.roomCode = null; return; }
  room.players.delete(p.id);
  p.roomCode = null;
  for (const other of room.players.values()) send(other.ws, { type: 'playerLeft', id: p.id });
  if (!room.players.size) rooms.delete(room.code);
  else {
    if (!room.players.has(room.hostId)) room.hostId = room.players.keys().next().value;
    updateRoom(room);
    if (room.status === 'playing') checkMatchEnd(room);
  }
}
function createRoom(p, data) {
  leaveRoom(p);
  const code = makeCode();
  const room = { code, hostId: p.id, status: 'waiting', map: String(data.map || 'island'), players: new Map() };
  room.players.set(p.id, p);
  p.roomCode = code;
  p.name = safeName(data.name); p.skin = String(data.skin || 'blue'); p.x = .5; p.y = .5; p.angle = 0; p.hp = 100; p.alive = true;
  rooms.set(code, room);
  send(p.ws, { type: 'room', room: roomView(room) });
}
function joinRoom(p, data) {
  const code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const room = rooms.get(code);
  if (!room) return send(p.ws, { type: 'error', message: 'Sala não encontrada. Confira o código.' });
  if (room.status !== 'waiting') return send(p.ws, { type: 'error', message: 'Essa partida já começou.' });
  if (room.players.size >= MAX_PLAYERS) return send(p.ws, { type: 'error', message: 'Sala cheia (máximo 4 jogadores).' });
  leaveRoom(p);
  p.name = safeName(data.name); p.skin = String(data.skin || 'blue'); p.x = .5; p.y = .5; p.angle = 0; p.hp = 100; p.alive = true; p.roomCode = code;
  room.players.set(p.id, p);
  send(p.ws, { type: 'room', room: roomView(room) });
  updateRoom(room);
}
function startMatch(room) {
  if (!room || room.status !== 'waiting') return;
  if (room.players.size < 2) {
    for (const p of room.players.values()) send(p.ws, { type: 'error', message: 'É preciso pelo menos 2 jogadores para iniciar.' });
    return;
  }
  room.status = 'playing';
  let i = 0;
  for (const p of room.players.values()) {
    const slots = [[.18,.22],[.82,.22],[.18,.78],[.82,.78]];
    p.x = slots[i][0]; p.y = slots[i][1]; p.angle = 0; p.hp = 100; p.alive = true; p.lastShot = 0; i++;
  }
  const players = [...room.players.values()].map(playerView);
  broadcastRoom(room, { type: 'matchStart', room: roomView(room), players, map: room.map });
}
function quickMatch(p, data) {
  leaveRoom(p);
  p.name = safeName(data.name); p.skin = String(data.skin || 'blue'); p.map = String(data.map || 'island');
  p.roomCode = null; p.x = .5; p.y = .5; p.hp = 100; p.alive = true;
  if (!quickQueue.includes(p)) quickQueue.push(p);
  send(p.ws, { type: 'queue', message: 'Procurando jogadores… a sala inicia quando houver pelo menos 2 (máximo 4).' });
  scheduleQuickMatch();
}
function scheduleQuickMatch() {
  if (quickTimer) return;
  quickTimer = setTimeout(() => {
    quickTimer = null;
    while (quickQueue.length && (!quickQueue[0].ws || quickQueue[0].ws.readyState !== WebSocket.OPEN)) quickQueue.shift();
    if (quickQueue.length >= 2) {
      const group = quickQueue.splice(0, Math.min(MAX_PLAYERS, quickQueue.length));
      const code = makeCode();
      const room = { code, hostId: group[0].id, status: 'waiting', map: group[0].map || 'island', players: new Map() };
      rooms.set(code, room);
      for (const p of group) { p.roomCode = code; p.x=.5; p.y=.5; p.hp=100; p.alive=true; room.players.set(p.id,p); }
      startMatch(room);
    } else if (quickQueue.length === 1) {
      send(quickQueue[0].ws, { type: 'queue', message: 'Ainda procurando pelo menos mais 1 jogador…' });
      scheduleQuickMatch();
    }
  }, 3500);
}
function handleShoot(p, data) {
  const room = p.roomCode && rooms.get(p.roomCode);
  if (!room || room.status !== 'playing' || !p.alive) return;
  const now = Date.now();
  const weapon = Number(data.weapon) || 0;
  const cooldown = weapon === 1 ? 100 : weapon === 2 ? 420 : 220;
  if (now - (p.lastShot || 0) < cooldown) return;
  p.lastShot = now;
  const angle = Number(data.angle) || 0;
  const sx = p.x * 1280, sy = p.y * 720;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const range = weapon === 1 ? 640 : weapon === 2 ? 330 : 470;
  const spread = weapon === 2 ? 3 : 1;
  let best = null, bestAlong = Infinity;
  for (const target of room.players.values()) {
    if (target.id === p.id || !target.alive) continue;
    const tx = target.x * 1280, ty = target.y * 720;
    const along = (tx-sx)*dx + (ty-sy)*dy;
    if (along < 0 || along > range) continue;
    const perpendicular = Math.abs((tx-sx)*dy - (ty-sy)*dx);
    const radius = weapon === 2 ? 33 : 22;
    if (perpendicular <= radius * spread && along < bestAlong) { best = target; bestAlong = along; }
  }
  if (best) {
    const damage = weapon === 2 ? 28 : weapon === 1 ? 12 : 18;
    best.hp = Math.max(0, best.hp - damage);
    if (best.hp <= 0) best.alive = false;
    const msg = { type: 'playerHit', shooterId: p.id, targetId: best.id, hp: best.hp, damage, killed: !best.alive };
    for (const other of room.players.values()) send(other.ws, msg);
    checkMatchEnd(room);
  }
}
function checkMatchEnd(room) {
  if (!room || room.status !== 'playing') return;
  const alive = [...room.players.values()].filter(p => p.alive);
  if (alive.length <= 1) {
    room.status = 'finished';
    const winner = alive[0];
    broadcastRoom(room, { type: 'matchEnd', winnerId: winner?.id || null, message: winner ? `🏆 ${winner.name} venceu a partida!` : 'Partida encerrada: todos foram eliminados.' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, service: 'Battle Survival PRO multiplayer', rooms: rooms.size, players: clients.size })); }
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/battle_survival_pro.html') {
    fs.readFile(GAME_FILE, (err, data) => { if (err) { res.writeHead(500); return res.end('Game file missing'); } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(data); }); return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Não encontrado');
});
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  const p = { id: require('crypto').randomUUID(), ws, name: 'Jogador', skin: 'blue', roomCode: null, x: .5, y: .5, angle: 0, hp: 100, alive: true, lastShot: 0 };
  clients.set(p.id, p); send(ws, { type: 'welcome', id: p.id });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'createRoom') return createRoom(p, m);
    if (m.type === 'joinRoom') return joinRoom(p, m);
    if (m.type === 'quickMatch') return quickMatch(p, m);
    if (m.type === 'startMatch') { const room = p.roomCode && rooms.get(p.roomCode); if (room && room.hostId === p.id) startMatch(room); return; }
    if (m.type === 'leaveRoom') { leaveRoom(p); return; }
    if (m.type === 'died') { p.hp = 0; p.alive = false; const room = p.roomCode && rooms.get(p.roomCode); if (room) { for (const other of room.players.values()) send(other.ws, { type: 'state', players: [...room.players.values()].map(playerView) }); checkMatchEnd(room); } return; }
    if (m.type === 'move') {
      if (!p.roomCode) return;
      p.x = Math.max(.01, Math.min(.99, Number(m.x) || .5)); p.y = Math.max(.01, Math.min(.99, Number(m.y) || .5));
      p.angle = Number(m.angle) || 0; p.skin = String(m.skin || p.skin); p.name = safeName(m.name);
      const room = rooms.get(p.roomCode); if (room && room.status === 'playing') { for (const other of room.players.values()) if (other.id !== p.id) send(other.ws, { type: 'state', players: [...room.players.values()].map(playerView) }); }
      return;
    }
    if (m.type === 'shoot') return handleShoot(p, m);
    if (m.type === 'rejoin' && m.room) { const room = rooms.get(String(m.room).toUpperCase()); if (room && room.status === 'waiting' && room.players.size < MAX_PLAYERS) joinRoom(p, { code: room.code, name: m.name, skin: m.skin }); }
  });
  ws.on('close', () => { leaveRoom(p); clients.delete(p.id); });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Battle Survival PRO server listening on ${PORT}`));
