import { useState, useEffect, useRef } from "react";

// ── Simulated data store ─────────────────────────────────────────────────────
const STORAGE_KEY_USERS    = "pf_users";
const STORAGE_KEY_TUNNELS  = "pf_tunnels";
const STORAGE_KEY_SESSION  = "pf_session";

const WAN_IP_DEMO = "203.0.113.42"; // demo public IP

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── Port pool ─────────────────────────────────────────────────────────────────
function allocatePort(tunnels) {
  const used = new Set(tunnels.map(t => t.wanPort));
  for (let p = 10000; p < 65000; p++) {
    if (!used.has(p)) return p;
  }
  return null;
}

// ── Icons (inline SVG) ────────────────────────────────────────────────────────
const Icon = {
  lock:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  user:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  plus:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  play:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  stop:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  trash:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  copy:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  globe:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  terminal:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  info:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  logout:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  shield:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

// ── Tunnel status badge ───────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const colors = { active:"#00ff88", stopped:"#ff4466", restarting:"#ffaa00" };
  const color = colors[status] || "#888";
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12,
      color, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:color,
        boxShadow:`0 0 6px ${color}`, display:"inline-block",
        animation: status==="active" ? "pulse 2s infinite" : "none" }} />
      {status}
    </span>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
      style={{ background:"none", border:"none", cursor:"pointer", color: copied?"#00ff88":"#888",
        padding:"2px 4px", transition:"color .2s" }} title="Copy">
      {Icon.copy}
    </button>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [session,   setSession]   = useState(() => loadJSON(STORAGE_KEY_SESSION, null));
  const [page,      setPage]      = useState("dashboard");
  const [authMode,  setAuthMode]  = useState("login");

  function login(user) { setSession(user); saveJSON(STORAGE_KEY_SESSION, user); setPage("dashboard"); }
  function logout()    { setSession(null); saveJSON(STORAGE_KEY_SESSION, null); setPage("dashboard"); setAuthMode("login"); }

  return (
    <div style={{ minHeight:"100vh", background:"#09090f", color:"#e8e8f0",
      fontFamily:"'JetBrains Mono', 'Fira Code', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Bebas+Neue&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:#111; }
        ::-webkit-scrollbar-thumb { background:#333; border-radius:3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px #00ff8833} 50%{box-shadow:0 0 40px #00ff8866} }
        @keyframes spin { to{transform:rotate(360deg)} }
        input, select { background:#111820; border:1px solid #1e2a3a; border-radius:6px;
          color:#e8e8f0; padding:10px 14px; font-family:inherit; font-size:13px; width:100%;
          outline:none; transition:border .2s; }
        input:focus, select:focus { border-color:#00ff88; }
        button { cursor:pointer; font-family:inherit; }
        .card { background:#0d1117; border:1px solid #1e2a3a; border-radius:10px; }
        .btn-primary { background:linear-gradient(135deg,#00cc6a,#00aa55); color:#001a0d;
          border:none; border-radius:7px; padding:11px 22px; font-weight:700; font-size:13px;
          letter-spacing:.5px; transition:all .2s; }
        .btn-primary:hover { filter:brightness(1.15); transform:translateY(-1px); }
        .btn-danger  { background:#1a0810; color:#ff4466; border:1px solid #ff446633;
          border-radius:7px; padding:9px 16px; font-size:12px; transition:all .2s; }
        .btn-danger:hover { background:#ff446622; }
        .btn-ghost  { background:transparent; color:#888; border:1px solid #222;
          border-radius:7px; padding:9px 16px; font-size:12px; transition:all .2s; }
        .btn-ghost:hover { border-color:#444; color:#ccc; }
        .label { font-size:11px; color:#556; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
        .mono { font-family:'JetBrains Mono',monospace; }
      `}</style>

      <Navbar session={session} page={page} setPage={setPage} logout={logout} />

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 20px", animation:"fadeIn .4s ease" }}>
        {!session ? (
          <AuthPage mode={authMode} setMode={setAuthMode} onLogin={login} />
        ) : page === "dashboard" ? (
          <Dashboard session={session} />
        ) : page === "guide" ? (
          <HostingGuide />
        ) : null}
      </div>
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ session, page, setPage, logout }) {
  return (
    <nav style={{ borderBottom:"1px solid #1a2030", padding:"14px 32px",
      display:"flex", alignItems:"center", justifyContent:"space-between",
      background:"#09090fdd", backdropFilter:"blur(12px)", position:"sticky", top:0, zIndex:100 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:32, height:32, background:"linear-gradient(135deg,#00ff88,#00aa55)",
          borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center",
          color:"#001a0d", fontWeight:900, fontSize:16 }}>⇄</div>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:3,
          color:"#e8e8f0" }}>TUNNELFORGE</span>
        <span style={{ fontSize:10, color:"#00ff88", border:"1px solid #00ff8844",
          borderRadius:4, padding:"2px 6px", marginLeft:4 }}>BETA</span>
      </div>
      {session && (
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={()=>setPage("dashboard")}
            className="btn-ghost" style={{ padding:"7px 14px", color: page==="dashboard"?"#00ff88":"#888",
            borderColor: page==="dashboard"?"#00ff8844":"#222" }}>
            {Icon.terminal} <span style={{marginLeft:6}}>Dashboard</span>
          </button>
          <button onClick={()=>setPage("guide")}
            className="btn-ghost" style={{ padding:"7px 14px", color: page==="guide"?"#00ff88":"#888",
            borderColor: page==="guide"?"#00ff8844":"#222" }}>
            {Icon.info} <span style={{marginLeft:6}}>Hosting Guide</span>
          </button>
          <div style={{ width:1, height:24, background:"#1e2a3a", margin:"0 8px" }} />
          <div style={{ display:"flex", alignItems:"center", gap:8, color:"#556", fontSize:13 }}>
            <span style={{ width:28, height:28, borderRadius:"50%", background:"#1a2a1a",
              display:"flex", alignItems:"center", justifyContent:"center", color:"#00ff88" }}>{Icon.user}</span>
            {session.username}
          </div>
          <button onClick={logout} className="btn-ghost" style={{ padding:"7px 12px" }} title="Logout">
            {Icon.logout}
          </button>
        </div>
      )}
    </nav>
  );
}

// ── Auth Page ─────────────────────────────────────────────────────────────────
function AuthPage({ mode, setMode, onLogin }) {
  const [form, setForm] = useState({ username:"", password:"", email:"" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handle(e) { setForm(f=>({...f,[e.target.name]:e.target.value})); setError(""); }

  function submit(e) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const users = loadJSON(STORAGE_KEY_USERS, []);
      if (mode === "signup") {
        if (users.find(u=>u.username===form.username)) { setError("Username already exists"); setLoading(false); return; }
        if (form.password.length < 6) { setError("Password must be ≥ 6 characters"); setLoading(false); return; }
        const user = { id: Date.now(), username:form.username, email:form.email, password:form.password, createdAt: Date.now() };
        users.push(user);
        saveJSON(STORAGE_KEY_USERS, users);
        onLogin(user);
      } else {
        const user = users.find(u=>u.username===form.username && u.password===form.password);
        if (!user) { setError("Invalid credentials"); setLoading(false); return; }
        onLogin(user);
      }
      setLoading(false);
    }, 600);
  }

  return (
    <div style={{ maxWidth:420, margin:"80px auto", animation:"fadeIn .5s ease" }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:48, marginBottom:8 }}>⇄</div>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:40, letterSpacing:4,
          background:"linear-gradient(135deg,#00ff88,#00cc6a)", WebkitBackgroundClip:"text",
          WebkitTextFillColor:"transparent" }}>TUNNELFORGE</h1>
        <p style={{ color:"#556", fontSize:13, marginTop:6 }}>Secure port forwarding & tunnel management</p>
      </div>

      <div className="card" style={{ padding:32 }}>
        <div style={{ display:"flex", gap:0, marginBottom:28, border:"1px solid #1e2a3a", borderRadius:8, overflow:"hidden" }}>
          {["login","signup"].map(m=>(
            <button key={m} onClick={()=>setMode(m)}
              style={{ flex:1, padding:"11px 0", border:"none", fontFamily:"inherit", fontWeight:600,
                fontSize:13, textTransform:"uppercase", letterSpacing:1, transition:"all .2s",
                background: mode===m ? "linear-gradient(135deg,#00cc6a,#009944)" : "transparent",
                color: mode===m ? "#001a0d" : "#556" }}>
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {mode==="signup" && (
            <div>
              <div className="label">Email</div>
              <input name="email" type="email" placeholder="you@example.com" value={form.email} onChange={handle} required />
            </div>
          )}
          <div>
            <div className="label">Username</div>
            <input name="username" placeholder="username" value={form.username} onChange={handle} required />
          </div>
          <div>
            <div className="label">Password</div>
            <input name="password" type="password" placeholder="••••••••" value={form.password} onChange={handle} required />
          </div>
          {error && <div style={{ color:"#ff4466", fontSize:12, padding:"8px 12px",
            background:"#ff446611", borderRadius:6, border:"1px solid #ff446633" }}>{error}</div>}
          <button className="btn-primary" type="submit" style={{ width:"100%", padding:14, fontSize:14, marginTop:4 }}>
            {loading ? <span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>⟳</span>
              : mode==="login" ? "Sign In → " : "Create Account →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ session }) {
  const [tunnels, setTunnels] = useState(() => {
    const all = loadJSON(STORAGE_KEY_TUNNELS, []);
    return all.filter(t => t.userId === session.id);
  });
  const [showAdd, setShowAdd] = useState(false);
  const [wanIP]  = useState(WAN_IP_DEMO);

  function saveTunnels(next) {
    const all = loadJSON(STORAGE_KEY_TUNNELS, []).filter(t => t.userId !== session.id);
    saveJSON(STORAGE_KEY_TUNNELS, [...all, ...next]);
    setTunnels(next);
  }

  function addTunnel(cfg) {
    const allTunnels = loadJSON(STORAGE_KEY_TUNNELS, []);
    // Re-use existing port if same localIP+localPort+protocol already exists for this user
    const existing = tunnels.find(t => t.localIP===cfg.localIP && t.localPort===cfg.localPort && t.protocol===cfg.protocol);
    const wanPort = existing ? existing.wanPort : allocatePort(allTunnels);
    const tunnel = {
      id: existing ? existing.id : `t_${Date.now()}`,
      userId: session.id,
      name: cfg.name || `Tunnel ${tunnels.length+1}`,
      localIP: cfg.localIP,
      localPort: parseInt(cfg.localPort),
      wanPort,
      protocol: cfg.protocol,
      status: "active",
      createdAt: existing ? existing.createdAt : Date.now(),
      traffic: { sent: Math.floor(Math.random()*500), recv: Math.floor(Math.random()*800) },
    };
    const next = existing ? tunnels.map(t=>t.id===existing.id?tunnel:t) : [...tunnels, tunnel];
    saveTunnels(next);
    setShowAdd(false);
  }

  function toggleStatus(id) {
    const next = tunnels.map(t => {
      if (t.id!==id) return t;
      if (t.status==="active") return {...t, status:"stopped"};
      if (t.status==="stopped") {
        // restart: keep same wanPort
        return {...t, status:"restarting"};
      }
      return t;
    });
    saveTunnels(next);
    // simulate restart → active
    const t = next.find(x=>x.id===id);
    if (t?.status==="restarting") {
      setTimeout(()=> {
        setTunnels(cur => {
          const n = cur.map(x => x.id===id ? {...x, status:"active"} : x);
          const all = loadJSON(STORAGE_KEY_TUNNELS, []).filter(tt => tt.userId !== session.id);
          saveJSON(STORAGE_KEY_TUNNELS, [...all, ...n]);
          return n;
        });
      }, 1800);
    }
  }

  function deleteTunnel(id) {
    const next = tunnels.filter(t=>t.id!==id);
    saveTunnels(next);
  }

  const active  = tunnels.filter(t=>t.status==="active").length;
  const stopped = tunnels.filter(t=>t.status==="stopped").length;

  return (
    <div style={{ animation:"fadeIn .4s ease" }}>
      {/* Header */}
      <div style={{ marginBottom:28, display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
        <div>
          <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, letterSpacing:3 }}>TUNNEL DASHBOARD</h2>
          <p style={{ color:"#556", fontSize:13, marginTop:4 }}>Welcome back, <span style={{color:"#00ff88"}}>{session.username}</span></p>
        </div>
        <button className="btn-primary" onClick={()=>setShowAdd(true)}
          style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{width:16,height:16}}>{Icon.plus}</span> New Tunnel
        </button>
      </div>

      {/* WAN IP card */}
      <div className="card" style={{ padding:20, marginBottom:24,
        background:"linear-gradient(135deg,#0a1a0f,#0d1117)", border:"1px solid #00ff8833",
        animation:"glow 4s ease-in-out infinite" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ width:18, height:18, color:"#00ff88" }}>{Icon.globe}</span>
          <span className="label" style={{ marginBottom:0 }}>Your WAN (Public) IP Address</span>
          <code style={{ fontSize:18, color:"#00ff88", fontWeight:700, letterSpacing:2 }}>{wanIP}</code>
          <CopyBtn text={wanIP} />
          <span style={{ marginLeft:"auto", fontSize:11, color:"#334" }}>
            Use this IP to access your tunnels from the internet
          </span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:16, marginBottom:28 }}>
        {[
          { label:"Total Tunnels", value:tunnels.length, color:"#4488ff" },
          { label:"Active",        value:active,          color:"#00ff88" },
          { label:"Stopped",       value:stopped,         color:"#ff4466" },
          { label:"Protocols",     value:[...new Set(tunnels.map(t=>t.protocol))].length||0, color:"#ffaa00" },
        ].map(s=>(
          <div key={s.label} className="card" style={{ padding:20 }}>
            <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:"#556", textTransform:"uppercase", letterSpacing:1, marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tunnels list */}
      {tunnels.length === 0 ? (
        <div className="card" style={{ padding:60, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⇄</div>
          <div style={{ color:"#556", marginBottom:16 }}>No tunnels yet. Create your first tunnel to get started.</div>
          <button className="btn-primary" onClick={()=>setShowAdd(true)}>+ Create Tunnel</button>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {tunnels.map(t => (
            <TunnelCard key={t.id} tunnel={t} wanIP={wanIP}
              onToggle={()=>toggleStatus(t.id)}
              onDelete={()=>deleteTunnel(t.id)} />
          ))}
        </div>
      )}

      {/* Add tunnel modal */}
      {showAdd && <AddTunnelModal onAdd={addTunnel} onClose={()=>setShowAdd(false)} />}
    </div>
  );
}

// ── Tunnel Card ───────────────────────────────────────────────────────────────
function TunnelCard({ tunnel, wanIP, onToggle, onDelete }) {
  const [showCmd, setShowCmd] = useState(false);
  const protoColor = { TCP:"#4488ff", UDP:"#ff8844", HTTPS:"#00ff88", HTTP:"#ffcc00", SSH:"#cc88ff" };
  const color = protoColor[tunnel.protocol] || "#888";

  const accessStr = `${wanIP}:${tunnel.wanPort}`;
  const cmds = {
    TCP:   `nc ${wanIP} ${tunnel.wanPort}`,
    UDP:   `nc -u ${wanIP} ${tunnel.wanPort}`,
    HTTPS: `curl https://${wanIP}:${tunnel.wanPort}`,
    HTTP:  `curl http://${wanIP}:${tunnel.wanPort}`,
    SSH:   `ssh -p ${tunnel.wanPort} user@${wanIP}`,
  };

  return (
    <div className="card" style={{ padding:20, transition:"border .2s",
      borderColor: tunnel.status==="active" ? "#00ff8822" : "#1e2a3a" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        {/* Protocol badge */}
        <span style={{ background:`${color}22`, color, border:`1px solid ${color}55`,
          borderRadius:5, padding:"4px 10px", fontSize:11, fontWeight:700, letterSpacing:1, minWidth:58, textAlign:"center" }}>
          {tunnel.protocol}
        </span>

        {/* Name */}
        <div style={{ flex:1, minWidth:100 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>{tunnel.name}</div>
          <div style={{ fontSize:11, color:"#556", marginTop:2 }}>ID: {tunnel.id}</div>
        </div>

        {/* Route */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <div style={{ textAlign:"center" }}>
            <div className="label">Local</div>
            <code style={{ fontSize:13, color:"#ccc" }}>{tunnel.localIP}:{tunnel.localPort}</code>
          </div>
          <span style={{ color:"#00ff88", fontSize:18 }}>→</span>
          <div style={{ textAlign:"center" }}>
            <div className="label">WAN Access</div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <code style={{ fontSize:13, color:"#00ff88", fontWeight:700 }}>{accessStr}</code>
              <CopyBtn text={accessStr} />
            </div>
          </div>
        </div>

        {/* Status */}
        <StatusBadge status={tunnel.status} />

        {/* Traffic */}
        <div style={{ fontSize:11, color:"#445", textAlign:"right" }}>
          <div>↑ {tunnel.traffic.sent} KB</div>
          <div>↓ {tunnel.traffic.recv} KB</div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>setShowCmd(v=>!v)} className="btn-ghost"
            style={{ padding:"7px 10px", color:"#4488ff" }} title="Show command">
            {Icon.terminal}
          </button>
          <button onClick={onToggle} className="btn-ghost"
            style={{ padding:"7px 10px", color: tunnel.status==="active"?"#ffaa00":"#00ff88" }}
            title={tunnel.status==="active"?"Stop":"Start"}>
            {tunnel.status==="active" ? Icon.stop : tunnel.status==="restarting" ?
              <span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span>
              : Icon.play}
          </button>
          {tunnel.status==="stopped" && (
            <button onClick={onToggle} className="btn-ghost"
              style={{ padding:"7px 10px", color:"#00ff88" }} title="Restart">
              {Icon.refresh}
            </button>
          )}
          <button onClick={onDelete} className="btn-danger" style={{ padding:"7px 10px" }} title="Delete">
            {Icon.trash}
          </button>
        </div>
      </div>

      {/* Command hint */}
      {showCmd && (
        <div style={{ marginTop:14, padding:14, background:"#050a07", borderRadius:8,
          border:"1px solid #0a2010", animation:"fadeIn .2s ease" }}>
          <div className="label">Access Command</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
            <code style={{ flex:1, fontSize:12, color:"#00ff88", wordBreak:"break-all" }}>
              {cmds[tunnel.protocol] || `telnet ${wanIP} ${tunnel.wanPort}`}
            </code>
            <CopyBtn text={cmds[tunnel.protocol] || `telnet ${wanIP} ${tunnel.wanPort}`} />
          </div>
          <div style={{ marginTop:8, fontSize:11, color:"#445" }}>
            Port <strong style={{color:"#aaa"}}>{tunnel.wanPort}</strong> on the WAN maps to your local <strong style={{color:"#aaa"}}>{tunnel.localIP}:{tunnel.localPort}</strong>.
            {" "}This port assignment is <strong style={{color:"#00ff88"}}>permanent</strong> — restarting the tunnel keeps the same WAN port.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Tunnel Modal ──────────────────────────────────────────────────────────
function AddTunnelModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:"", localIP:"192.168.1.", localPort:"", protocol:"TCP" });
  const [error, setError] = useState("");
  function handle(e) { setForm(f=>({...f,[e.target.name]:e.target.value})); setError(""); }
  function submit(e) {
    e.preventDefault();
    if (!form.localIP || !form.localPort) { setError("Local IP and port are required"); return; }
    const port = parseInt(form.localPort);
    if (isNaN(port)||port<1||port>65535) { setError("Port must be 1–65535"); return; }
    const ipRx = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRx.test(form.localIP)) { setError("Invalid IP address"); return; }
    onAdd(form);
  }
  return (
    <div style={{ position:"fixed", inset:0, background:"#000000aa", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}>
      <div className="card" style={{ width:"100%", maxWidth:460, padding:32, animation:"fadeIn .25s ease" }}>
        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:3, marginBottom:24 }}>
          NEW TUNNEL
        </h3>
        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <div className="label">Tunnel Name (optional)</div>
            <input name="name" placeholder="e.g. Home Web Server" value={form.name} onChange={handle} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <div className="label">Local IP Address</div>
              <input name="localIP" placeholder="192.168.1.100" value={form.localIP} onChange={handle} required />
            </div>
            <div>
              <div className="label">Local Port</div>
              <input name="localPort" type="number" placeholder="8080" min="1" max="65535"
                value={form.localPort} onChange={handle} required />
            </div>
          </div>
          <div>
            <div className="label">Protocol / Tunnel Type</div>
            <select name="protocol" value={form.protocol} onChange={handle}>
              <option value="TCP">TCP — General purpose</option>
              <option value="UDP">UDP — Low-latency / games</option>
              <option value="HTTP">HTTP — Web traffic</option>
              <option value="HTTPS">HTTPS — Secure web</option>
              <option value="SSH">SSH — Secure shell</option>
            </select>
          </div>
          <div style={{ padding:12, background:"#0a1a0f", borderRadius:8, border:"1px solid #0a3020",
            fontSize:12, color:"#556", lineHeight:1.6 }}>
            {Icon.shield} <strong style={{color:"#00ff88"}}>Port Persistence:</strong> If you re-add the same
            Local IP + Port + Protocol, the system will assign the <em>exact same WAN port</em> as before.
            Stopping and restarting a tunnel never changes its WAN port.
          </div>
          {error && <div style={{ color:"#ff4466", fontSize:12, padding:"8px 12px",
            background:"#ff446611", borderRadius:6 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, marginTop:4 }}>
            <button type="button" onClick={onClose} className="btn-ghost" style={{ flex:1 }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ flex:2 }}>Create Tunnel →</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Hosting Guide ─────────────────────────────────────────────────────────────
function HostingGuide() {
  const sections = [
    {
      title:"1. GitHub Pages (Frontend Only — FREE)",
      color:"#4488ff",
      steps:[
        "Push your project to a GitHub repository",
        "Go to repo Settings → Pages → Source: Deploy from branch",
        "Select branch: main, folder: /root or /docs",
        "Your site goes live at: https://yourusername.github.io/your-repo",
        "⚠️ GitHub Pages serves STATIC files only — no Node.js backend. Use it for the React frontend only.",
      ],
      cmd:`# Build the React app first
npm run build
# Then push the 'dist' folder to GitHub Pages
# Or use gh-pages package:
npm install -D gh-pages
# In package.json add: "homepage": "https://YOU.github.io/REPO"
# Then: npm run deploy`,
    },
    {
      title:"2. Render.com (Full Stack — FREE tier)",
      color:"#00ff88",
      steps:[
        "Sign up at render.com with GitHub",
        "New → Web Service → connect your repo",
        "Build Command: npm install && npm run build",
        "Start Command: node server/index.js",
        "Add environment variables (PORT, JWT_SECRET, etc.)",
        "Free tier: auto-sleeps after 15 min inactivity, 750 hrs/month",
        "Custom domain supported on free tier",
      ],
      cmd:`# render.yaml (optional auto-deploy config)
services:
  - type: web
    name: tunnelforge
    env: node
    buildCommand: npm install && npm run build
    startCommand: node server/index.js
    envVars:
      - key: JWT_SECRET
        generateValue: true`,
    },
    {
      title:"3. Railway.app (Full Stack — FREE $5 credit)",
      color:"#cc88ff",
      steps:[
        "Sign up at railway.app → New Project → Deploy from GitHub",
        "Railway auto-detects Node.js — no config needed",
        "Set environment variables in the dashboard",
        "Gets a public URL instantly: your-app.up.railway.app",
        "Free: $5 credit/month, enough for small projects",
        "Supports persistent volumes and databases",
      ],
      cmd:`# No config needed — Railway reads package.json
# Make sure you have:
{
  "scripts": {
    "start": "node server/index.js"
  }
}`,
    },
    {
      title:"4. Cloudflare Tunnels (Real Port Forwarding — FREE)",
      color:"#ff8844",
      steps:[
        "Sign up at dash.cloudflare.com — free forever",
        "Install cloudflared: brew install cloudflared (Mac) or download from Cloudflare",
        "Run: cloudflared tunnel login",
        "Create tunnel: cloudflared tunnel create my-tunnel",
        "Configure: edit ~/.cloudflared/config.yml",
        "Start: cloudflared tunnel run my-tunnel",
        "Gets a free subdomain: *.trycloudflare.com",
        "✅ This is real port forwarding — TCP, HTTP, HTTPS, SSH all supported",
      ],
      cmd:`# ~/.cloudflared/config.yml
tunnel: <YOUR-TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: myapp.yourdomain.com
    service: http://localhost:3000
  - hostname: ssh.yourdomain.com
    service: ssh://localhost:22
  - service: http_status:404

# Quick one-off tunnel (no signup needed):
cloudflared tunnel --url http://localhost:3000`,
    },
    {
      title:"5. ngrok (Quick Dev Tunnels — FREE tier)",
      color:"#ffcc00",
      steps:[
        "Sign up at ngrok.com → download ngrok binary",
        "ngrok config add-authtoken YOUR_TOKEN",
        "HTTP tunnel: ngrok http 3000",
        "TCP tunnel: ngrok tcp 22",
        "Gets URL like: https://abc123.ngrok.io",
        "Free tier: 1 online ngrok process, random URLs, 40 conn/min",
        "Paid tier: static domains, multiple tunnels",
      ],
      cmd:`# Install
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# HTTP
ngrok http 3000

# TCP (SSH example)
ngrok tcp 22

# Multiple tunnels (ngrok.yml)
tunnels:
  web:
    addr: 3000
    proto: http
  ssh:
    addr: 22
    proto: tcp`,
    },
  ];

  const [open, setOpen] = useState(0);

  return (
    <div style={{ animation:"fadeIn .4s ease" }}>
      <div style={{ marginBottom:32 }}>
        <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, letterSpacing:3 }}>FREE HOSTING GUIDE</h2>
        <p style={{ color:"#556", fontSize:13, marginTop:6 }}>
          How to host TunnelForge and set up real port forwarding — all free options
        </p>
      </div>

      <div className="card" style={{ padding:20, marginBottom:28, border:"1px solid #ffaa0033",
        background:"#100d00" }}>
        <div style={{ fontSize:12, color:"#ffaa00", lineHeight:1.8 }}>
          <strong>⚠️ Important:</strong> This demo app simulates port forwarding in the browser using localStorage.
          For a <em>real</em> port forwarding system, you need a server running on a machine with a public IP,
          and a tunneling daemon (cloudflared, frp, nginx stream, etc.). See the options below.
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {sections.map((s,i)=>(
          <div key={i} className="card" style={{ overflow:"hidden", borderColor: open===i?`${s.color}44`:"#1e2a3a" }}>
            <button onClick={()=>setOpen(open===i?-1:i)}
              style={{ width:"100%", padding:"18px 24px", background:"none", border:"none", color:"inherit",
                display:"flex", alignItems:"center", gap:12, textAlign:"left", cursor:"pointer",
                fontFamily:"inherit" }}>
              <span style={{ color:s.color, fontSize:11, fontWeight:700, letterSpacing:1,
                border:`1px solid ${s.color}55`, borderRadius:5, padding:"3px 8px", whiteSpace:"nowrap" }}>
                {i+1}/{sections.length}
              </span>
              <span style={{ fontWeight:600, fontSize:14, flex:1 }}>{s.title}</span>
              <span style={{ color:"#444", fontSize:18, transform: open===i?"rotate(180deg)":"none",
                transition:"transform .2s" }}>▾</span>
            </button>

            {open===i && (
              <div style={{ padding:"0 24px 24px", animation:"fadeIn .25s ease" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, flexWrap:"wrap" }}>
                  <div>
                    <div className="label" style={{ marginBottom:10 }}>Steps</div>
                    <ol style={{ paddingLeft:18, lineHeight:2, fontSize:13, color:"#aaa" }}>
                      {s.steps.map((st,j)=><li key={j}>{st}</li>)}
                    </ol>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom:10 }}>Commands / Config</div>
                    <pre style={{ background:"#050a05", border:"1px solid #0a2010",
                      borderRadius:8, padding:16, fontSize:11, color:"#00ff88", overflowX:"auto",
                      lineHeight:1.8, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                      {s.cmd}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
