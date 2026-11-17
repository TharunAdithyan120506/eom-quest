// Vercel serverless function: shared leaderboard backed by Upstash Redis (REST API, no dependencies).
// Env vars (added automatically when you connect an Upstash Redis store in Vercel):
//   KV_REST_API_URL + KV_REST_API_TOKEN   or   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//
// GET    /api/leaderboard[?id=<uuid>]      -> { top: [...50], total, you: { rank } | null }
// POST   /api/leaderboard  {id, token, name, xp, lessons, pyq, mock}   -> upsert your row
// DELETE /api/leaderboard  {id, token}     -> remove your row
//
// Scores are reported by each browser, so the checks below only keep the board honest-ish:
// a per-player secret token, content-based caps, a limit on how fast XP can grow, and rate limiting.

const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LESSONS = 83, PYQS = 120;
const Z = 'eomq:lb', U = id => `eomq:u:${id}`, RL = id => `eomq:rl:${id}`;

async function redis(commands) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const toObj = arr => { const o = {}; for (let i = 0; arr && i < arr.length; i += 2) o[arr[i]] = arr[i + 1]; return o; };
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const validToken = t => typeof t === 'string' && /^[0-9a-f]{64}$/i.test(t);

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'Leaderboard storage is not connected yet.' });
  try {
    if (req.method === 'GET') {
      const id = req.query && req.query.id;
      const [top, total, rank] = await redis([
        ['ZREVRANGE', Z, '0', '49', 'WITHSCORES'],
        ['ZCARD', Z],
        validId(id) ? ['ZREVRANK', Z, id] : ['PING'],
      ]);
      const ids = []; for (let i = 0; i < top.length; i += 2) ids.push(top[i]);
      const rows = ids.length ? await redis(ids.map(i => ['HMGET', U(i), 'name', 'lessons', 'pyq', 'mock', 'updated'])) : [];
      return res.status(200).json({
        total,
        you: validId(id) && rank !== null && rank !== 'PONG' ? { rank: rank + 1 } : null,
        top: ids.map((pid, k) => ({
          me: pid === id, name: rows[k][0] || 'Player', xp: Number(top[k * 2 + 1]),
          lessons: Number(rows[k][1] || 0), pyq: Number(rows[k][2] || 0), mock: Number(rows[k][3] || 0), updated: Number(rows[k][4] || 0),
        })),
      });
    }

    const b = body(req);
    if (!validId(b.id) || !validToken(b.token)) return res.status(400).json({ error: 'Bad identity.' });
    const [existing] = await redis([['HGETALL', U(b.id)]]);
    const cur = toObj(existing);
    if (cur.th && cur.th !== hash(b.token)) return res.status(403).json({ error: 'This leaderboard entry belongs to someone else.' });

    if (req.method === 'DELETE') {
      await redis([['ZREM', Z, b.id], ['DEL', U(b.id)]]);
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const name = cleanName(b.name);
    if (name.length < 2) return res.status(400).json({ error: 'Name must be 2 to 24 characters.' });
    if (!int(b.lessons, 0, LESSONS) || !int(b.pyq, 0, PYQS) || !int(b.mock, 0, 50) || !int(b.xp, 0, 100000))
      return res.status(400).json({ error: 'Those numbers are not possible in EOM Quest.' });

    // Rate limit: one update every 5 seconds per player.
    const [ok] = await redis([['SET', RL(b.id), '1', 'NX', 'EX', '5']]);
    if (ok === null) return res.status(429).json({ error: 'Too many updates, try again in a few seconds.' });

    const now = Date.now();
    if (cur.th) {
      // Existing player: XP may only rise as fast as the app can award it (a burst allowance plus about 3 XP per second).
      const prev = Number(cur.xp || 0), secs = Math.max(0, (now - Number(cur.updated || now)) / 1000);
      if (b.xp > prev + 400 + secs * 3) return res.status(422).json({ error: 'XP increased faster than the app allows.' });
    } else {
      // New player: XP must fit the progress they report (lessons 50, PYQs 20, card reviews up to 10, mocks up to 200, plus a margin).
      const reviews = int(b.reviews, 0, 1e6) ? b.reviews : 0, mocks = int(b.mocks, 0, 1e4) ? b.mocks : 0;
      if (b.xp > b.lessons * 50 + b.pyq * 20 + reviews * 10 + mocks * 200 + 1000)
        return res.status(422).json({ error: 'XP does not match the reported progress.' });
    }

    await redis([
      ['HSET', U(b.id), 'name', name, 'xp', String(b.xp), 'lessons', String(b.lessons), 'pyq', String(b.pyq), 'mock', String(b.mock), 'updated', String(now), 'th', cur.th || hash(b.token)],
      ['ZADD', Z, String(b.xp), b.id],
      ['ZREVRANK', Z, b.id],
    ]).then(r => res.status(200).json({ ok: true, rank: r[2] + 1 }));
  } catch (e) {
    return res.status(500).json({ error: 'Leaderboard is unavailable right now.' });
  }
};
