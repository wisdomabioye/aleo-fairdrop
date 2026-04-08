/**
 * Example webhook server for credential-signer delegation.
 *
 * This is a minimal Express server that checks a Postgres allowlist.
 * Replace the DB logic with your own access control.
 *
 * The credential-signer POSTs { address, auctionId } and expects { allowed: boolean }.
 *
 * USAGE:
 *   npm install express pg @types/express @types/pg
 *   DATABASE_URL=postgres://... node server.ts
 */
import express from 'express';
import { Pool } from 'pg';

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json());

interface CheckBody {
  address:   string;
  auctionId: string;
}

/**
 * POST /gate/check
 *
 * Called by credential-signer for each credential request (after wallet sig verified).
 * Respond 200 + { allowed: boolean } — do NOT return 4xx for denied requests.
 */
app.post('/gate/check', async (req, res) => {
  const { address, auctionId } = req.body as CheckBody;

  if (!address || !auctionId) {
    res.status(400).json({ error: 'missing address or auctionId' });
    return;
  }

  try {
    // Check the gate_allowlist table for this address.
    // auction_id = 'all' means approved for every auction on this server.
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM gate_allowlist
         WHERE address = $1
           AND (auction_id = $2 OR auction_id = 'all')
       ) AS exists`,
      [address, auctionId],
    );

    res.json({ allowed: rows[0]?.exists ?? false });
  } catch (err) {
    console.error('[gate/check] db error', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Health check — useful for uptime monitoring
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`[gate-webhook] listening on :${PORT}`);
});
