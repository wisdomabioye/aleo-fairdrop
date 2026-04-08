/**
 * KYC provider bridge — reference implementation.
 *
 * Translates between the credential-signer webhook format and a KYC provider API.
 * Deploy this as a separate service from the credential-signer.
 *
 * Replace isKycApproved() with a call to your actual KYC provider.
 *
 * credential-signer .env:
 *   CHECK_STRATEGY=webhook
 *   WEBHOOK_URL=https://your-kyc-bridge.example.com/gate/check
 */
import express from 'express';

const app = express();
app.use(express.json());

// ── KYC provider call ─────────────────────────────────────────────────────────

interface KycStatusResponse {
  status:          string;   // e.g. "approved" | "pending" | "rejected"
  jurisdiction_ok: boolean;  // jurisdiction restriction check
}

/**
 * Check whether an Aleo address has a KYC-approved identity.
 *
 * Prerequisites: the bidder must have completed your KYC onboarding flow and
 * associated their Aleo address with a verified identity in your provider's system.
 */
async function isKycApproved(address: string): Promise<boolean> {
  const url    = process.env.KYC_PROVIDER_URL;
  const apiKey = process.env.KYC_API_KEY;

  if (!url || !apiKey) throw new Error('KYC_PROVIDER_URL or KYC_API_KEY not set');

  const res = await fetch(`${url}/v1/status?address=${encodeURIComponent(address)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) return false;

  const data = await res.json() as KycStatusResponse;
  return data.status === 'approved' && data.jurisdiction_ok;
}

// ── Webhook endpoint ──────────────────────────────────────────────────────────

interface CheckBody {
  address:   string;
  auctionId: string;
}

app.post('/gate/check', async (req, res) => {
  const { address } = req.body as CheckBody;

  if (!address) {
    res.status(400).json({ error: 'missing address' });
    return;
  }

  try {
    const allowed = await isKycApproved(address);
    res.json({ allowed });
  } catch (err) {
    console.error('[kyc-bridge] provider error', err);
    res.status(500).json({ error: 'KYC provider unavailable' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = Number(process.env.PORT ?? 3003);
app.listen(PORT, () => console.log(`[kyc-bridge] listening on :${PORT}`));
