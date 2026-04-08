# credentialUrl Convention

When a creator sets up a credential-gated auction, they provide the public URL of their `credential-signer` instance. This URL is stored in off-chain IPFS metadata and committed on-chain via `metadata_hash`.

---

## How the URL flows through the system

**At auction creation (wizard step 4 — Gate & Vesting):**

1. Creator enters the `credential-signer` URL in the Fairdrop wizard
2. The URL is included in the `MetadataInput` payload uploaded to IPFS:
   ```json
   {
     "name": "My Auction",
     "description": "...",
     "credentialUrl": "https://my-signer.example.com",
     ...
   }
   ```
3. The IPFS CID is hashed (BHP256) and stored on-chain in `AuctionConfig.metadata_hash`

**At bid time:**

1. The frontend fetches `auction.metadata.credentialUrl` from the API
2. `CredentialGateForm` calls `GET <credentialUrl>/public-key` to confirm the service is reachable and retrieve the issuer address
3. The bidder's wallet signs the challenge; the frontend POSTs to `<credentialUrl>/credentials/issue`
4. The credential is returned and submitted via `verify_credential`

---

## What `credentialUrl` must point to

The URL must be the root of a running `credential-signer` instance. The frontend appends `/public-key` and `/credentials/issue` to this base URL. Examples:

```
https://gate.myproject.com          ✓ root URL
https://gate.myproject.com/signer   ✓ path prefix is fine
https://gate.myproject.com/         ✓ trailing slash is fine

https://gate.myproject.com/credentials/issue  ✗ do not include the endpoint path
```

---

## CORS

The frontend calls the credential-signer directly from the browser. Set `CORS_ORIGIN` to your Fairdrop frontend URL in production:

```env
CORS_ORIGIN=https://fairdrop.xyz
```

The default `CORS_ORIGIN=*` is acceptable for development and testing but not recommended for production — it allows any origin to call your credential endpoint.

---

## What happens if `credentialUrl` is null or missing

If the auction has `gate_mode = 2` but no `credentialUrl` in its metadata (or no metadata at all), the `CredentialGateForm` component falls back to a **manual paste mode**. The bidder requests a credential out-of-band (e.g. by emailing the creator) and pastes the JSON into the form.

The JSON format to paste:
```json
{
  "signature": "sign1...",
  "expiry":    1234567,
  "issuer":    "aleo1abc..."
}
```

This is a degraded experience. Creators should always provide a reachable `credentialUrl`.

---

## Self-hosted vs managed

**Self-hosted**: The creator runs `credential-signer` on their own infrastructure and provides the URL at auction creation. They control the private key and the check logic.

**Managed** (future option): Fairdrop could operate a shared `credential-signer` for simple strategies (allowlist, token-gate). The creator uploads a CSV or sets a token ID; the platform runs the service on their behalf. This is a product decision not yet implemented.
