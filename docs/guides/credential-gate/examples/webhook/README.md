# Example: Webhook Delegation

Delegate the access decision to an HTTP endpoint you control. Use this when your access logic already lives in your own backend — allowlists in a database, KYC approvals, Discord role membership, email verification, or any other condition your server can evaluate.

---

## How it works

When a bidder requests a credential, the credential-signer POSTs to your endpoint:

```http
POST https://yourapp.com/gate/check
Content-Type: application/json

{ "address": "aleo1abc...", "auctionId": "12345field" }
```

Your endpoint responds with:

```json
{ "allowed": true }
```

or

```json
{ "allowed": false }
```

The credential-signer issues a credential if `allowed` is `true`, and returns HTTP 403 if `false`. Any non-200 response or network error is treated as a server error (500).

---

## Setup

**Step 1 — configure the credential-signer**

```env
CHECK_STRATEGY=webhook
WEBHOOK_URL=https://yourapp.com/gate/check
```

That is the only credential-signer change needed.

**Step 2 — add the check endpoint to your server**

See `server.ts` in this directory for a minimal Express example. The only contract is:
- Accept `POST` with JSON body `{ address: string, auctionId: string }`
- Respond with HTTP 200 and JSON body `{ allowed: boolean }`

---

## server.ts

A minimal Express server with a Postgres allowlist. Replace the database logic with whatever your backend uses.

```ts
import express from 'express';
import { Pool } from 'pg';

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json());

/**
 * POST /gate/check
 * Called by credential-signer for each credential request.
 * Body: { address: string, auctionId: string }
 * Response: { allowed: boolean }
 */
app.post('/gate/check', async (req, res) => {
  const { address, auctionId } = req.body as { address: string; auctionId: string };

  if (!address || !auctionId) {
    res.status(400).json({ error: 'missing address or auctionId' });
    return;
  }

  try {
    // Example: check a DB table of approved addresses per auction
    const { rows } = await pool.query(
      `SELECT 1 FROM gate_allowlist
       WHERE address = $1 AND (auction_id = $2 OR auction_id = 'all')
       LIMIT 1`,
      [address, auctionId],
    );

    res.json({ allowed: rows.length > 0 });
  } catch (err) {
    console.error('[gate/check] db error', err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.listen(3001, () => {
  console.log('gate check server listening on :3001');
});
```

**Test it:**

```bash
curl -s -X POST https://yourapp.com/gate/check \
  -H 'Content-Type: application/json' \
  -d '{"address":"aleo1abc...","auctionId":"12345field"}'

# Expected:
{ "allowed": true }
```

---

## Securing the webhook

See [webhook-security.md](../../webhook-security.md) for full guidance. Key points:

- **Shared secret**: send a secret header from the credential-signer side if your webhook implementation supports it (add a custom middleware), and validate it in your server before processing the request.
- **HTTPS only**: credential-signer will not enforce HTTPS on `WEBHOOK_URL` — you must ensure your endpoint is behind TLS.
- **Timeouts**: the credential-signer expects a response within a reasonable time. Keep your check logic fast (< 2 s).
- **Non-200 responses**: any non-200 response causes a 500 error to the bidder. Return 200 with `{ allowed: false }` for denied requests — do not return 403 from your webhook.

---

## Common use cases

| Use case | What the webhook checks |
|---|---|
| Email-verified users | Lookup address in a DB of verified emails |
| KYC/AML | Delegate to a KYC provider API (see [compliance-kyc example](../compliance-kyc/README.md)) |
| Discord role | Use Discord OAuth to map wallet → Discord user → role membership |
| Dynamic allowlist | Addresses stored in your DB, editable by the creator at any time |
| Quota limits | Max N credentials issued per auction — tracked in your DB |
