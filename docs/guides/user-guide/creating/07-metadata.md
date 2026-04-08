# Step 7 — Metadata

Add a name, description, and optional branding for your auction. Metadata is pinned to
IPFS when you submit the auction — it is not stored on-chain directly.

---

## Fields

| Field | Required | Description |
|---|---|---|
| **Name** | Yes | Public display name for your auction |
| **Description** | Yes | A brief explanation of the auction and its goals |
| **Logo image** | No | Uploaded to IPFS; shown as the auction thumbnail |
| **Website** | No | External link shown on the auction detail page |
| **Twitter / X** | No | Your project's Twitter/X profile link |

---

## Logo upload

- Accepted formats: any image format (JPEG, PNG, SVG, WebP).
- The logo is uploaded to IPFS via the Fairdrop pinning service.
- If the upload fails you can still proceed — the auction will display a letter avatar
  based on the name instead.

---

## IPFS pinning

When you submit the auction in the Review step, the metadata (name, description, logo CID,
social links) is bundled and pinned to IPFS. The resulting IPFS CID is included in the
on-chain auction record.

---

## Next step

Click **Next** to review and submit.
