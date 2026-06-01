// Garmin LiveTrack — Worker v4 (session auto-detect + race config)
// KV bindings requis : variable "KV"
// Secrets requis     : ADMIN_SECRET (Workers Settings → Variables → chiffré)

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  "Content-Type":                 "application/json",
};
const json = (d, s=200) => new Response(JSON.stringify(d), { status:s, headers:CORS });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const u = new URL(req.url);

    // ══ GET /current ─ session active auto-détectée ══════════
    if (req.method === "GET" && u.pathname === "/current") {
      const cur = await env.KV.get("current", "json");
      return json(cur || { sid: null });
    }

    // ══ GET /config ─ race config dynamique ══════════════════
    if (req.method === "GET" && u.pathname === "/config") {
      const cfg = await env.KV.get("raceConfig", "json");
      return json(cfg || {});
    }

    // ══ POST /config ─ admin (X-Admin-Secret requis) ══════════
    if (req.method === "POST" && u.pathname === "/config") {
      if (req.headers.get("X-Admin-Secret") !== env.ADMIN_SECRET)
        return json({ error: "unauthorized" }, 401);
      const cfg = await req.json();
      await env.KV.put("raceConfig", JSON.stringify(cfg));
      return json({ ok: true });
    }

    // ══ POST /relay ─ extension → KV ══════════════════════════
    if (req.method === "POST" && u.pathname === "/relay") {
      const { type, sid, data } = await req.json();
      if (!sid) return json({ error: "missing sid" }, 400);

      if (type === "session") {
        await env.KV.put(`${sid}:meta`, JSON.stringify(data));
        // Stocker la session courante avec TTL 24h
        await env.KV.put("current",
          JSON.stringify({ sid, start: data.start, name: data.userDisplayName }),
          { expirationTtl: 86400 }
        );
      } else if (type === "trackpoints") {
        const pts = data.trackPoints || [];
        if (pts.length) {
          const existing = await env.KV.get(`${sid}:pts`, "json") || [];
          await env.KV.put(`${sid}:pts`, JSON.stringify([...existing, ...pts]));
        }
      }
      return json({ ok: true });
    }

    // ══ GET /data ─ dashboard ══════════════════════════════════
    if (req.method === "GET" && u.pathname === "/data") {
      const sid = u.searchParams.get("sid"), since = u.searchParams.get("since");
      if (!sid) return json({ error: "missing sid" }, 400);
      const [meta, allPts] = await Promise.all([
        env.KV.get(`${sid}:meta`, "json"),
        env.KV.get(`${sid}:pts`,  "json"),
      ]);
      const points = (allPts||[]).filter(p => !since || p.dateTime > since);
      return json({ meta, points });
    }

    // ══ POST /chat ═════════════════════════════════════════════
    if (req.method === "POST" && u.pathname === "/chat") {
      const { sid, name, msg, type } = await req.json();
      if (!sid || !name || !msg) return json({ error: "missing fields" }, 400);
      const m = { id: Date.now(), name: String(name).slice(0,30), msg: String(msg).slice(0,280), type: type||"msg", ts: new Date().toISOString() };
      const existing = await env.KV.get(`${sid}:chat`, "json") || [];
      await env.KV.put(`${sid}:chat`, JSON.stringify([...existing, m].slice(-150)));
      return json({ ok: true, msg: m });
    }

    // ══ POST /viewers ─ heartbeat spectateurs (TTL 90s par viewer) ══
    if (req.method === "POST" && u.pathname === "/viewers") {
      const { sid, vid } = await req.json();
      if (!sid || !vid) return json({ error: "missing fields" }, 400);
      // Stocke une clé par viewer avec TTL 90s — expire automatiquement si le tab se ferme
      await env.KV.put(`viewer:${sid}:${vid}`, "1", { expirationTtl: 90 });
      const list = await env.KV.list({ prefix: `viewer:${sid}:` });
      return json({ ok: true, count: list.keys.length });
    }

    // ══ GET /chat ══════════════════════════════════════════════
    if (req.method === "GET" && u.pathname === "/chat") {
      const sid = u.searchParams.get("sid"), since = u.searchParams.get("since");
      if (!sid) return json({ error: "missing sid" }, 400);
      const msgs = await env.KV.get(`${sid}:chat`, "json") || [];
      return json({ messages: since ? msgs.filter(m => m.ts > since) : msgs });
    }

    return json({ error: "unknown route" }, 404);
  }
};