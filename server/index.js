/**
 * TunnelForge — Backend Server
 * Node.js + Express + net (TCP) + dgram (UDP) + http-proxy
 *
 * Run: node server/index.js
 * Requires: npm install express bcryptjs jsonwebtoken cors http-proxy net-proxy
 */

const express    = require("express");
const http       = require("http");
const net        = require("net");
const dgram      = require("dgram");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");

const app  = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "changeme_in_production_please";

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve React build in production
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// ── Simple JSON "database" (use PostgreSQL/MongoDB in real prod) ──────────────
const DB_PATH = path.join(__dirname, "db.json");
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { users: [], tunnels: [], portCounter: 10000 };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// ── Port assignment: persistent + deterministic ───────────────────────────────
function getOrAssignPort(db, userId, localIP, localPort, protocol) {
  // Check if this exact combo already has a WAN port assigned
  const existing = db.tunnels.find(
    t => t.userId === userId &&
         t.localIP === localIP &&
         t.localPort === localPort &&
         t.protocol === protocol
  );
  if (existing) return existing.wanPort;

  // Assign next available port
  const used = new Set(db.tunnels.map(t => t.wanPort));
  let p = db.portCounter || 10000;
  while (used.has(p)) p++;
  db.portCounter = p + 1;
  return p;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(header.replace("Bearer ", ""), JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}

// ── Routes: Auth ──────────────────────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  const { username, email, password } = req.body;
  const db = loadDB();
  if (db.users.find(u => u.username === username))
    return res.status(400).json({ error: "Username taken" });
  const hash = await bcrypt.hash(password, 12);
  const user = { id: Date.now().toString(), username, email, passwordHash: hash, createdAt: Date.now() };
  db.users.push(user);
  saveDB(db);
  const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, username, email } });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, username, email: user.email } });
});

// ── Routes: Tunnels ───────────────────────────────────────────────────────────
// List all tunnels for current user
app.get("/api/tunnels", auth, (req, res) => {
  const db = loadDB();
  res.json(db.tunnels.filter(t => t.userId === req.user.id));
});

// Create (or reactivate) a tunnel
app.post("/api/tunnels", auth, (req, res) => {
  const { name, localIP, localPort, protocol } = req.body;
  if (!localIP || !localPort || !protocol)
    return res.status(400).json({ error: "localIP, localPort and protocol required" });

  const db = loadDB();
  const wanPort = getOrAssignPort(db, req.user.id, localIP, parseInt(localPort), protocol);

  // Check if tunnel already exists
  const idx = db.tunnels.findIndex(
    t => t.userId === req.user.id && t.localIP === localIP &&
         t.localPort === parseInt(localPort) && t.protocol === protocol
  );

  const tunnel = {
    id: idx >= 0 ? db.tunnels[idx].id : `t_${Date.now()}`,
    userId: req.user.id,
    name: name || `Tunnel ${db.tunnels.length + 1}`,
    localIP,
    localPort: parseInt(localPort),
    wanPort,
    protocol,
    status: "active",
    createdAt: idx >= 0 ? db.tunnels[idx].createdAt : Date.now(),
    updatedAt: Date.now(),
    traffic: { sent: 0, recv: 0 },
  };

  if (idx >= 0) db.tunnels[idx] = tunnel;
  else db.tunnels.push(tunnel);
  saveDB(db);

  // Start the actual tunnel process
  startTunnel(tunnel);

  res.json(tunnel);
});

// Stop a tunnel
app.post("/api/tunnels/:id/stop", auth, (req, res) => {
  const db = loadDB();
  const t = db.tunnels.find(t => t.id === req.params.id && t.userId === req.user.id);
  if (!t) return res.status(404).json({ error: "Tunnel not found" });
  t.status = "stopped";
  saveDB(db);
  stopTunnel(t.id);
  res.json(t);
});

// Restart a tunnel (same WAN port guaranteed)
app.post("/api/tunnels/:id/restart", auth, (req, res) => {
  const db = loadDB();
  const t = db.tunnels.find(t => t.id === req.params.id && t.userId === req.user.id);
  if (!t) return res.status(404).json({ error: "Tunnel not found" });
  t.status = "active";
  saveDB(db);
  stopTunnel(t.id);
  startTunnel(t);
  res.json(t);
});

// Delete a tunnel
app.delete("/api/tunnels/:id", auth, (req, res) => {
  const db = loadDB();
  const idx = db.tunnels.findIndex(t => t.id === req.params.id && t.userId === req.user.id);
  if (idx < 0) return res.status(404).json({ error: "Tunnel not found" });
  stopTunnel(req.params.id);
  db.tunnels.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});

// Get public WAN IP
app.get("/api/wan-ip", (req, res) => {
  // In production, use https://api.ipify.org or check request IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim()
          || req.socket.remoteAddress
          || "unknown";
  res.json({ ip });
});

// ── Tunnel Engine ─────────────────────────────────────────────────────────────
const activeTunnels = new Map(); // id → { server, connections }

function startTunnel(tunnel) {
  if (activeTunnels.has(tunnel.id)) stopTunnel(tunnel.id);

  if (tunnel.protocol === "TCP" || tunnel.protocol === "HTTP" ||
      tunnel.protocol === "HTTPS" || tunnel.protocol === "SSH") {
    startTCPTunnel(tunnel);
  } else if (tunnel.protocol === "UDP") {
    startUDPTunnel(tunnel);
  }
}

function startTCPTunnel(tunnel) {
  const connections = new Set();

  const server = net.createServer((clientSocket) => {
    connections.add(clientSocket);
    const targetSocket = net.createConnection({ host: tunnel.localIP, port: tunnel.localPort }, () => {
      clientSocket.pipe(targetSocket);
      targetSocket.pipe(clientSocket);
    });
    targetSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => targetSocket.destroy());
    clientSocket.on("close", () => { connections.delete(clientSocket); targetSocket.destroy(); });
  });

  server.listen(tunnel.wanPort, "0.0.0.0", () => {
    console.log(`[TCP] Tunnel ${tunnel.id}: WAN :${tunnel.wanPort} → ${tunnel.localIP}:${tunnel.localPort}`);
  });

  server.on("error", (err) => {
    console.error(`[TCP] Tunnel ${tunnel.id} error:`, err.message);
    if (err.code === "EADDRINUSE") {
      console.log(`[TCP] Port ${tunnel.wanPort} in use, retrying in 3s...`);
      setTimeout(() => startTCPTunnel(tunnel), 3000);
    }
  });

  activeTunnels.set(tunnel.id, { server, connections });
}

function startUDPTunnel(tunnel) {
  const proxy = dgram.createSocket("udp4");
  const clientMap = new Map(); // "clientIP:port" → target socket

  proxy.on("message", (msg, rinfo) => {
    const key = `${rinfo.address}:${rinfo.port}`;
    if (!clientMap.has(key)) {
      const target = dgram.createSocket("udp4");
      clientMap.set(key, target);
      target.on("message", (resp) => {
        proxy.send(resp, rinfo.port, rinfo.address);
      });
    }
    const target = clientMap.get(key);
    target.send(msg, tunnel.localPort, tunnel.localIP);
  });

  proxy.bind(tunnel.wanPort, "0.0.0.0", () => {
    console.log(`[UDP] Tunnel ${tunnel.id}: WAN :${tunnel.wanPort} → ${tunnel.localIP}:${tunnel.localPort}`);
  });

  activeTunnels.set(tunnel.id, { server: proxy, connections: clientMap });
}

function stopTunnel(id) {
  const t = activeTunnels.get(id);
  if (!t) return;
  if (t.connections instanceof Set) {
    t.connections.forEach(s => s.destroy());
  } else if (t.connections instanceof Map) {
    t.connections.forEach(s => s.close());
  }
  t.server.close(() => console.log(`[Tunnel] ${id} stopped`));
  activeTunnels.delete(id);
}

// ── On startup: restart all previously active tunnels ─────────────────────────
function restoreActiveTunnels() {
  const db = loadDB();
  const active = db.tunnels.filter(t => t.status === "active");
  console.log(`[Boot] Restoring ${active.length} active tunnel(s)...`);
  active.forEach(startTunnel);
}

// ── Catch-all: serve React app ────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
http.createServer(app).listen(PORT, () => {
  console.log(`\n🚇 TunnelForge server running on port ${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}\n`);
  restoreActiveTunnels();
});
