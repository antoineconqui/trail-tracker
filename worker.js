// Garmin LiveTrack — Worker v5 (batch storage, freshness marker, optimised KV)
// KV bindings requis : variable "KV"
// Secrets requis     : ADMIN_SECRET

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  "Content-Type":                 "application/json",
};
const json = (d, s=200) => new Response(JSON.stringify(d), { status:s, headers:CORS });
const TTL_RACE = 90_000;   // 25h — données de course
const TTL_CHAT = 90_000;
const TTL_VIEW = 3_600;    // 1h — viewers live

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const u = new URL(req.url);

    // ══ GET /current ══════════════════════════════════════════
    if (req.method === "GET" && u.pathname === "/current") {
      const cur = await env.KV.get("current", "json");
      return json(cur || { sid: null });
    }

    // ══ GET /config ═══════════════════════════════════════════
    if (req.method === "GET" && u.pathname === "/config") {
      const cfg = await env.KV.get("raceConfig", "json");
      return json(cfg || {});
    }

    // ══ POST /config ─ admin ══════════════════════════════════
    if (req.method === "POST" && u.pathname === "/config") {
      if (req.headers.get("X-Admin-Secret") !== env.ADMIN_SECRET)
        return json({ error: "unauthorized" }, 401);
      const cfg = await req.json();
      await env.KV.put("raceConfig", JSON.stringify(cfg));
      return json({ ok: true });
    }

    // ══ POST /relay ───────────────────────────────────────────
    // Optimisation v5 : batch storage — chaque flush = 1 petite clé
    // au lieu de relire + réécrire l'array complet (~25 000 pts à mi-course)
    if (req.method === "POST" && u.pathname === "/relay") {
      const { type, sid, data } = await req.json();
      if (!sid) return json({ error: "missing sid" }, 400);

      if (type === "session") {
        await Promise.all([
          env.KV.put(`${sid}:meta`, JSON.stringify(data), { expirationTtl: TTL_RACE }),
          env.KV.put("current",
            JSON.stringify({ sid, start: data.start, name: data.userDisplayName }),
            { expirationTtl: 86400 }),
        ]);

      } else if (type === "trackpoints") {
        const pts = data.trackPoints || [];
        if (!pts.length) return json({ ok: true });

          // ID sémantique = dateTime du DERNIER point (pas le temps de traitement)
        // → garantit que since/lu comparent des espaces temporels homogènes
        // → fonctionne aussi bien pour la vraie course que pour la simulation
        const lastPtDt = pts.length > 0 ? (pts[pts.length - 1].dateTime || "") : "";
        const batchId  = lastPtDt || new Date().toISOString();

        // Index des batch IDs (JSON array trié, max 2000 entrées ≈ 16h à 30s)
        const idx = await env.KV.get(`${sid}:idx`, "json") || [];
        idx.push(batchId);
        const trimIdx = idx.slice(-2000);

        await Promise.all([
          // Batch isolé (taille fixe ~4 Ko, TTL 25h)
          env.KV.put(`${sid}:b:${batchId}`, JSON.stringify(pts), { expirationTtl: TTL_RACE }),
          // Index mis à jour
          env.KV.put(`${sid}:idx`, JSON.stringify(trimIdx), { expirationTtl: TTL_RACE }),
          // Marqueur de fraîcheur = dernier point dateTime
          env.KV.put(`${sid}:lu`, batchId, { expirationTtl: TTL_RACE }),
        ]);
      }
      return json({ ok: true });
    }

    // ══ GET /data ─────────────────────────────────────────────
    // Optimisation v5 :
    // 1. Lecture du marqueur lu (1 read) → si rien de neuf, retour immédiat
    // 2. Lecture de l'index + batches filtrés en parallèle
    // 3. Fallback vers l'ancien format ${sid}:pts pour rétro-compat
    if (req.method === "GET" && u.pathname === "/data") {
      const sid = u.searchParams.get("sid"), since = u.searchParams.get("since");
      if (!sid) return json({ error: "missing sid" }, 400);

      // — Freshness check —
      if (since) {
        const lu = await env.KV.get(`${sid}:lu`, "text");
        if (lu && lu <= since) {
          // Aucun nouveau point → 1 seul read KV, meta null (déjà connu du client)
          return json({ meta: null, points: [], updated: false });
        }
      }

      // — Lecture complète —
      const [meta, idx] = await Promise.all([
        env.KV.get(`${sid}:meta`, "json"),
        env.KV.get(`${sid}:idx`, "json"),
      ]);

      let points = [];
      if (idx) {
        // Nouveau format batch
        const relevantIds = since ? idx.filter(id => id > since) : idx;
        if (relevantIds.length) {
          // Lectures parallèles par chunks de 20 pour respecter les limites KV
          for (let i = 0; i < relevantIds.length; i += 20) {
            const chunk = relevantIds.slice(i, i + 20);
            const batches = await Promise.all(chunk.map(id => env.KV.get(`${sid}:b:${id}`, "json")));
            points.push(...batches.flat().filter(Boolean));
          }
        }
      } else {
        // Fallback : ancien format (migration transparente)
        const legacy = await env.KV.get(`${sid}:pts`, "json") || [];
        points = since ? legacy.filter(p => p.dateTime > since) : legacy;
      }

      return json({ meta, points, updated: true });
    }

    // ══ POST /chat ════════════════════════════════════════════
    if (req.method === "POST" && u.pathname === "/chat") {
      const { sid, name, msg, type } = await req.json();
      if (!sid || !name || !msg) return json({ error: "missing fields" }, 400);
      const m = { id: Date.now(), name: String(name).slice(0,30), msg: String(msg).slice(0,280), type: type||"msg", ts: new Date().toISOString() };
      const existing = await env.KV.get(`${sid}:chat`, "json") || [];
      await env.KV.put(`${sid}:chat`, JSON.stringify([...existing, m].slice(-150)), { expirationTtl: TTL_CHAT });
      return json({ ok: true, msg: m });
    }

    // ══ GET /chat ═════════════════════════════════════════════
    if (req.method === "GET" && u.pathname === "/chat") {
      const sid = u.searchParams.get("sid"), since = u.searchParams.get("since");
      if (!sid) return json({ error: "missing sid" }, 400);
      const msgs = await env.KV.get(`${sid}:chat`, "json") || [];
      return json({ messages: since ? msgs.filter(m => m.ts > since) : msgs });
    }

    // ══ POST /subscribe ─ inscription pré-course ══════════════
    if (req.method === "POST" && u.pathname === "/subscribe") {
      const { name, vid } = await req.json();
      if (!vid) return json({ error: "missing vid" }, 400);
      let registry = await env.KV.get("subscribers", "json") || {};
      if (vid === "__clear__") { registry = {}; }
      else if (name === "__del__") { delete registry[vid]; }
      else if (name && name.trim()) {
        const clean = String(name).trim().slice(0, 30);
        // Supprimer toute entrée existante avec le même nom (multi-device, re-inscription)
        for (const k of Object.keys(registry))
          if (k !== vid && registry[k].name.toLowerCase() === clean.toLowerCase()) delete registry[k];
        registry[vid] = { name: clean, ts: Date.now() };
      }
      await env.KV.put("subscribers", JSON.stringify(registry), { expirationTtl: 86400 * 4 });
      const subs = Object.values(registry).sort((a, b) => a.ts - b.ts);
      return json({ ok: true, count: subs.length, subscribers: subs.map(v => v.name) });
    }

    // ══ GET /subscribers ══════════════════════════════════════
    if (req.method === "GET" && u.pathname === "/subscribers") {
      const registry = await env.KV.get("subscribers", "json") || {};
      const subs = Object.values(registry).sort((a, b) => a.ts - b.ts);
      return json({ subscribers: subs.map(v => v.name), count: subs.length });
    }

    // ══ POST /viewers ─ heartbeat live ════════════════════════
    if (req.method === "POST" && u.pathname === "/viewers") {
      const { sid, vid, name } = await req.json();
      if (!sid || !vid) return json({ error: "missing fields" }, 400);
      let registry = await env.KV.get(`viewers:${sid}`, "json") || {};
      const now = Date.now();
      if (vid === "__clear__") { registry = {}; }
      else if (name === "__del__") { delete registry[vid]; }
      else if (name && name.trim()) registry[vid] = { name: String(name).slice(0, 30), ts: now };
      for (const [k, v] of Object.entries(registry))
        if (now - v.ts > 300_000) delete registry[k];
      await env.KV.put(`viewers:${sid}`, JSON.stringify(registry), { expirationTtl: TTL_VIEW });
      const active = Object.values(registry);
      return json({ ok: true, count: active.length, viewers: active.map(v => v.name) });
    }

    // ══ GET /viewers ══════════════════════════════════════════
    if (req.method === "GET" && u.pathname === "/viewers") {
      const sid = u.searchParams.get("sid");
      if (!sid) return json({ error: "missing sid" }, 400);
      const registry = await env.KV.get(`viewers:${sid}`, "json") || {};
      const now = Date.now();
      const active = Object.values(registry).filter(v => now - v.ts < 300_000);
      return json({ viewers: active.map(v => v.name), count: active.length });
    }

    // ══ POST /admin/flush ─ purge complète via KV.list() ════════
    if (req.method === "POST" && u.pathname === "/admin/flush") {
      if (req.headers.get("X-Admin-Secret") !== env.ADMIN_SECRET)
        return json({ error: "unauthorized" }, 401);

      const keepConfig = u.searchParams.get("full") !== "1";
      const deleted = [];

      // KV.list() pour lister TOUTES les clés et les supprimer
      let cursor = undefined;
      do {
        const res = cursor
          ? await env.KV.list({ limit: 100, cursor })
          : await env.KV.list({ limit: 100 });

        for (const key of res.keys) {
          if (keepConfig && key.name === "raceConfig") continue;
          await env.KV.delete(key.name);
          deleted.push(key.name);
        }

        cursor = res.list_complete ? undefined : res.cursor;
      } while (cursor);

      return json({ ok: true, deleted, count: deleted.length });
    }

    return json({ error: "unknown route" }, 404);
  }
};

