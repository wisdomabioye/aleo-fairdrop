# Webhook Security

Applies to anyone running a `webhook` or `custom` strategy that calls an external HTTP endpoint.

---

## Layer 1 is always enforced by credential-signer

Before your webhook is called, the credential-signer has already verified that the bidder controls `holderAddress` by checking their wallet signature against the challenge string:

```
fairdrop-credential-request:<auctionId>:<holderAddress>
```

Your webhook receives a pre-verified address. You do not need to re-verify wallet ownership.

---

## Shared secret header

The credential-signer does not add a shared secret header to webhook calls by default. If your webhook is publicly reachable, anyone could call it directly and potentially obtain information about whether an address is approved.

To protect your webhook, add a middleware to your server that validates a shared secret:

```ts
// In your Express webhook server
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.use('/gate/check', (req, res, next) => {
  const provided = req.headers['x-webhook-secret'];
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});
```

Then pass the secret as a custom header from a forked/extended credential-signer, or accept the trade-off that the webhook endpoint reveals only approval status (not private data).

---

## HTTPS required

Run your webhook behind HTTPS in production. The `WEBHOOK_URL` is sent over the network — plain HTTP exposes `{ address, auctionId }` in transit.

```env
# Always use https:// in production
WEBHOOK_URL=https://yourapp.com/gate/check
```

The credential-signer does not enforce HTTPS on `WEBHOOK_URL` — you are responsible for this.

---

## Return 200 for denied requests

Return HTTP 200 with `{ allowed: false }` for addresses that fail your check. Do not return 4xx from your webhook endpoint — the credential-signer treats any non-200 response as a server error and returns HTTP 500 to the bidder.

| Your response | Bidder sees |
|---|---|
| 200 `{ allowed: true }` | Credential issued |
| 200 `{ allowed: false }` | HTTP 403 — access denied |
| 4xx or 5xx | HTTP 500 — server error |
| Timeout / unreachable | HTTP 500 — server error |

---

## Rate limiting

The credential-signer rate-limits at 5 requests per 60-second window per `(address, auctionId)` pair, before the webhook is called. Your webhook will not be flooded by a single bidder retrying rapidly.

If your webhook calls an external provider with its own rate limits, add caching in your bridge service (e.g. cache the approval result for the TTL period).

---

## Credential TTL and expiry

Set `CREDENTIAL_TTL_BLOCKS` based on how long the approval should stay valid:

```env
CREDENTIAL_TTL_BLOCKS=720   # ~3 h — for regulated sales or short auctions
CREDENTIAL_TTL_BLOCKS=5760  # ~24 h — general purpose (default)
```

After expiry, the on-chain gate rejects the credential. The bidder must request a new one — which triggers your webhook again. This is the correct behaviour for cases where approval can be revoked (e.g. KYC status changes, token sold).

---

## Timeouts and availability

Keep your webhook fast and available for the duration of the auction. If the credential-signer cannot reach your webhook, bidders receive HTTP 500 and cannot obtain credentials. Use a process manager, health checks, and uptime monitoring.

A slow webhook (> 5 s) also degrades the bidder experience since credential issuance is synchronous.
