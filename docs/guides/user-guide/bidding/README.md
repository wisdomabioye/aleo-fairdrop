# How bidding works

Every auction on Fairdrop uses the same bid panel on the auction detail page. Connect your
wallet, complete any gate verification, then fill in the bid form.

---

## Private vs public bids

All auction types let you choose how your bid is submitted:

| Mode | What it hides | What is visible |
|---|---|---|
| **Private** | The source wallet (which credit UTXO you spend) | Bid quantity (public on-chain) |
| **Public** | Nothing | Source wallet and bid quantity |

> On Sealed auctions, quantity is additionally hidden during the commit phase — private
> bid mode further hides the source wallet identity.

For a private bid you must select a **credit record** — a private ALEO credit UTXO from
your wallet. The wallet adapter loads your available records automatically.

---

## Referral codes

Any Fairdrop user can generate a referral link from an auction page. If you received a
referral link, the code is automatically pre-filled in the bid form. You can also toggle
the referral field and enter a code manually.

Using a referral code does not change your bid price or allocation. The referrer earns a
commission from the protocol fee pool — not from your payment.

---

## Gate verification (if required)

If the auction has a gate, you must pass verification **before** the bid form appears.

### Merkle (allowlist) gate

1. Obtain your Merkle proof JSON from the auction creator.
2. Paste the proof into the form and click **Prove Merkle gate**.
3. Confirm the transaction in your wallet.
4. Once confirmed on-chain, the bid form unlocks.

The proof JSON requires a `siblings` array of exactly 20 field elements and a `pathBits`
integer encoding your position in the Merkle tree.

### Credential gate

1. Click **Request credential** (if the credential service URL is configured) or visit the
   credential service URL provided by the creator.
2. Follow the issuer's verification flow.
3. Paste the issued credential JSON into the form and click **Prove credential gate**.
4. Confirm the transaction in your wallet.
5. Once confirmed on-chain, the bid form unlocks.

Verification is recorded on-chain per wallet address per auction. You only need to verify
once per auction.

---

## Bid form guides

- [Dutch](./dutch.md)
- [Sealed — commit & reveal](./sealed.md)
- [Raise](./raise.md)
- [Ascending](./ascending.md)
- [LBP](./lbp.md)
- [Quadratic](./quadratic.md)
