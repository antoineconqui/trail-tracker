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

    // ══ POST /subscribe ─ inscription pré-course (sans sid requis) ════════
    if (req.method === "POST" && u.pathname === "/subscribe") {
      const { name, vid } = await req.json();
      if (!vid) return json({ error: "missing vid" }, 400);
      let registry = await env.KV.get("subscribers", "json") || {};
      if (vid === "__clear__") { registry = {}; }
      else if (name === "__del__") { delete registry[vid]; }
      else if (name && name.trim()) registry[vid] = { name: String(name).slice(0, 30), ts: Date.now() };
      // name vide → pas d'entrée fantôme
      await env.KV.put("subscribers", JSON.stringify(registry), { expirationTtl: 86400 * 4 }); // TTL 4 jours
      const subs = Object.values(registry).sort((a, b) => a.ts - b.ts);
      return json({ ok: true, count: subs.length, subscribers: subs.map(v => v.name) });
    }

    // ══ GET /subscribers ─ liste des inscrits pré-course ═════════════════
    if (req.method === "GET" && u.pathname === "/subscribers") {
      const registry = await env.KV.get("subscribers", "json") || {};
      const subs = Object.values(registry).sort((a, b) => a.ts - b.ts);
      return json({ subscribers: subs.map(v => v.name), count: subs.length });
    }

    // ══ POST /viewers ─ heartbeat spectateur avec nom (registre unique) ══
    if (req.method === "POST" && u.pathname === "/viewers") {
      const { sid, vid, name } = await req.json();
      if (!sid || !vid) return json({ error: "missing fields" }, 400);
      let registry = await env.KV.get(`viewers:${sid}`, "json") || {};
      const now = Date.now();
      if (vid === "__clear__") { registry = {}; }
      else if (name === "__del__") { delete registry[vid]; }
      else if (name && name.trim()) registry[vid] = { name: String(name).slice(0, 30), ts: now };
      // name vide ou absent → pas d'entrée fantôme
      // Pruner les inactifs (> 300s)
      for (const [k, v] of Object.entries(registry))
        if (now - v.ts > 300_000) delete registry[k];
      await env.KV.put(`viewers:${sid}`, JSON.stringify(registry), { expirationTtl: 3600 });
      const active = Object.values(registry);
      return json({ ok: true, count: active.length, viewers: active.map(v => v.name) });
    }

    // ══ GET /viewers ─ liste des spectateurs actifs ═══════════
    if (req.method === "GET" && u.pathname === "/viewers") {
      const sid = u.searchParams.get("sid");
      if (!sid) return json({ error: "missing sid" }, 400);
      const registry = await env.KV.get(`viewers:${sid}`, "json") || {};
      const now = Date.now();
      const active = Object.values(registry).filter(v => now - v.ts < 300_000);
      return json({ viewers: active.map(v => v.name), count: active.length });
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