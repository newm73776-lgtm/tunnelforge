# 🚇 TunnelForge — Port Forwarding Platform

A full-stack port forwarding & tunnel management platform with:
- **User Auth** (signup/login with JWT)
- **Persistent port assignment** (same WAN port every time for same tunnel)
- **TCP / UDP / HTTP / HTTPS / SSH** tunnel types
- **Start / Stop / Restart** controls
- **Free hosting guide** built-in

---

## 📁 Project Structure

```
tunnelforge/
├── server/
│   └── index.js          ← Node.js backend (Express + net + dgram)
├── frontend/
│   └── src/
│       └── App.jsx        ← React frontend (Vite)
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm run install:all
```

### 2. Run in development
```bash
# Terminal 1 — Backend (port 4000)
npm run dev:server

# Terminal 2 — Frontend (port 5173)
npm run dev:client
```

### 3. Build for production
```bash
npm run build
npm start
```

---

## 🌐 Free Hosting Options

### Option A: Render.com (RECOMMENDED for full-stack)
1. Push code to GitHub
2. Go to render.com → New Web Service → Connect repo
3. Build Command: `npm run build`
4. Start Command: `node server/index.js`
5. Add env var: `JWT_SECRET=your_random_secret_here`
6. Deploy! Free tier sleeps after 15 min idle.

### Option B: Railway.app
1. Push to GitHub
2. railway.app → New Project → Deploy from GitHub
3. Auto-detects Node.js, no config needed
4. $5 free credit/month

### Option C: GitHub Pages (FRONTEND ONLY)
GitHub Pages only serves static files — no backend.
You'd need to use the demo/localStorage mode only.

```bash
cd frontend
npm run build
# Install gh-pages
npm install -D gh-pages
# Add to frontend/package.json:
# "homepage": "https://YOURUSERNAME.github.io/REPONAME"
# "scripts": { "deploy": "gh-pages -d dist" }
npm run deploy
```

---

## 🔧 Real Port Forwarding (Self-hosted)

For a **real** tunnel server on your own machine:

### Using Cloudflare Tunnel (FREE)
```bash
# Install cloudflared
curl -L --output cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin

# Login & create tunnel
cloudflared tunnel login
cloudflared tunnel create tunnelforge

# Config: ~/.cloudflared/config.yml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: tunnel.yourdomain.com
    service: http://localhost:4000
  - service: http_status:404

# Run
cloudflared tunnel run tunnelforge
```

### Using frp (Fast Reverse Proxy)
```bash
# On your VPS (with public IP):
# frps.ini
[common]
bind_port = 7000
dashboard_port = 7500
token = your_secret_token

./frps -c frps.ini

# On your local machine:
# frpc.ini
[common]
server_addr = YOUR_VPS_IP
server_port = 7000
token = your_secret_token

[web]
type = tcp
local_ip = 127.0.0.1
local_port = 8080
remote_port = 6000

./frpc -c frpc.ini
# Now YOUR_VPS_IP:6000 → your local 8080
```

### Using ngrok
```bash
npm install -g ngrok
ngrok http 4000         # HTTP tunnel
ngrok tcp 22            # TCP/SSH tunnel
ngrok udp 1194          # UDP tunnel
```

---

## 🔑 Environment Variables

| Variable     | Default         | Description                    |
|--------------|-----------------|--------------------------------|
| PORT         | 4000            | Server port                    |
| JWT_SECRET   | (change this!)  | JWT signing secret             |

---

## 🛡️ Protocol Guide

| Protocol | Use Case                         | Command to Test                        |
|----------|----------------------------------|----------------------------------------|
| TCP      | Any generic TCP service          | `nc WAN_IP WAN_PORT`                   |
| UDP      | Games, VoIP, DNS, VPN            | `nc -u WAN_IP WAN_PORT`                |
| HTTP     | Web servers, APIs                | `curl http://WAN_IP:WAN_PORT`          |
| HTTPS    | Secure web servers               | `curl https://WAN_IP:WAN_PORT`         |
| SSH      | Remote shell access              | `ssh -p WAN_PORT user@WAN_IP`          |

---

## 📌 Port Persistence

The system guarantees **the same WAN port is always assigned** to the same
`(userId + localIP + localPort + protocol)` combination.

- Stop a tunnel → port is held for you
- Restart a tunnel → same port resumes
- Delete and re-create same config → same port reassigned
- Port range: 10000–64999

---

## 📄 License
MIT — Free to use and modify.
