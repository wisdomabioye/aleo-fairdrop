# Fairdrop Feature Backlog

Candidate features for future development, grouped by theme. Items are not ordered by priority within a group — see the priority table at the bottom.

---

## 1. Developer Experience

### TypeScript SDK
Wrap all contract interactions in a TypeScript library: op_hash computation, multisig signing flows, bid submission, record management, and full auction lifecycle state. The single highest-leverage investment — without it, integration friction blocks adoption entirely.

### Private Portfolio View
Given a user's private keys, reconstruct all their Bid records, participation receipts, vesting allocations, and unrealized gains across all auctions. Requires scanning and decrypting private records off-chain. Table stakes for a usable launchpad UX.

---

## 2. Liquidity & Trading

### Post-auction AMM Seeding
After `close_auction`, creator atomically seeds a private AMM pool using their revenue + unsold supply in a single transaction. Uses the existing `private_dex.aleo` contract. Flow: `withdraw_payments` + `withdraw_unsold` → `add_liquidity`. "Launch and immediately list" with no manual step. No other launchpad does this natively.

### Private Secondary OTC Desk
Private bilateral trades using the record model. Seller signs a sealed offer (price + token record), buyer matches it. Both sides remain private. Useful for large post-auction positions where trading on a public DEX would move price.

### Buyback Program
Creator pre-configures X% of protocol fees to accumulate in a buyback reserve. After launch, anyone can trigger `execute_buyback`, which purchases the sale token from the DEX at market price and burns it. Creates a natural price floor funded by the launch itself.

---

## 3. Auction Mechanics

### Multi-currency Auctions
Currently hardcoded to `credits.aleo`. Allow any `token_registry` token as the payment currency — stablecoin-denominated raises remove ALEO price risk from the raise amount. Significant barrier to adoption right now.

### Anti-sniping Extension
If a bid arrives within the last N blocks of an ascending auction, extend the end time by M blocks. Prevents bot-driven last-second sniping. Standard in NFT auctions, absent from most token launchpads.

### Private Reserve Price
Creator sets an encrypted reserve price alongside the public floor. If clearing price hits the public floor but not the private reserve, the creator can reject. Adds negotiation flexibility without revealing true valuation — a pure mechanism design advantage.

### Conditional / Contingent Auctions
Auction A only executes if Auction B also hits its target. Useful for coordinated launches: a protocol + its insurance pool, or a multi-tranche raise where tranche 2 only proceeds if tranche 1 clears. A coordination primitive that does not exist on other launchpads.

### Auction Insurance via Partial Fill
Creator over-commits supply (e.g., 120% of target). If the raise lands 80–120% of target, supply is distributed proportionally rather than voided. Reduces binary all-or-nothing risk for both creators and bidders.

### Recurring / Scheduled Auctions
Creators configure emission schedules (e.g., weekly Dutch auctions for a fixed supply). Each round auto-inherits the prior round's config. Useful for DAOs doing continuous token distribution.

---

## 4. Access Control & Compliance

### ZK Credential Expansion
Gate mode 2 (credential) is already plumbed. Expand to: prove you hold a token on another chain via Aleo's bridge, prove unique humanity, prove jurisdiction — without revealing identity. The privacy-native killer feature for gated launches.

### Compliance Mode (ZK KYC / AML)
Creator enables compliance mode: bidders attach a ZK proof from an accredited KYC provider proving jurisdiction/accreditation without doxxing themselves. Enables institutional-grade and regulated token sales — opens a market that privacy-agnostic launchpads cannot serve.

### NFT-gated Private Rounds
Prove ownership of a specific NFT via ZK without revealing the holding wallet. Enables token-gated early access without an on-chain allowlist that leaks participant identity.

---

## 5. Creator Tools

### Automatic Revenue Splits
Creator configures a split table at `create_auction`: e.g., 60% founder, 30% DAO treasury, 10% advisors. `withdraw_payments` distributes proportionally in one transaction. No trust required — programmatic and immutable once set.

### Gasless Bids / Sponsored Auctions
Creator pre-deposits credits to cover transaction fees for bidders below a threshold. Lowers the barrier for retail participation — especially effective for community rounds.

### Batch / Portfolio Token Launches
Launch multiple related tokens in a single coordinated auction. Bidders allocate budget across all tokens. Private cross-token allocation. Useful for game studios, DeFi protocols with multiple assets, etc.

---

## 6. Reputation & Trust

### Creator Reputation & Escrow
Creators lock collateral before launch, auto-returned after `withdraw_payments` completes. The `proof` contract already tracks participation receipts — extend it to track creator delivery history. Bidders can optionally gate participation on creator reputation score.

### Reputation-gated Priority Access
Bidders above a proof reputation threshold get a 24-hour priority window before the auction opens publicly. Rewards loyal protocol participants without a separate token or off-chain whitelist.

---

## 7. Analytics & Transparency

### Privacy-preserving Aggregate Statistics
ZK proofs that attest to aggregate auction facts without revealing individual bids: number of unique bidders, Gini coefficient of token distribution, median bid size. A trust signal no other launchpad can offer — requires Aleo's ZK model.

---

## Priority Overview

| Feature | Theme | Why high value |
|---|---|---|
| TypeScript SDK | DX | Unlocks all adoption; everything else depends on it |
| Multi-currency auctions | Mechanics | Removes ALEO price risk; immediate adoption barrier |
| Automatic revenue splits | Creator tools | Needed on day 1 for most creator teams |
| Post-auction AMM seeding | Liquidity | Unique end-to-end flow; leverages existing DEX |
| ZK aggregate stats | Analytics | Trust primitive only possible on Aleo |
| Anti-sniping extension | Mechanics | Table stakes for ascending auctions |
| Compliance mode / ZK KYC | Compliance | Opens institutional and regulated market |
| Conditional auctions | Mechanics | Novel coordination primitive |
| Private portfolio view | DX | UX table stakes for bidders |
| Creator escrow + reputation | Trust | Reduces creator fraud risk |
| Buyback program | Liquidity | Post-launch tokenomics tool |
| Private reserve price | Mechanics | Mechanism design advantage |
| Gasless bids | Creator tools | Retail accessibility |
| Recurring auctions | Mechanics | DAO / continuous distribution use case |
| Private secondary OTC | Trading | Large position management |
| ZK credential expansion | Access | Privacy-native gating |
| Reputation-gated access | Trust | Loyalty economy without a token |
| NFT-gated rounds | Access | Identity-preserving gating |
| Auction insurance | Mechanics | Reduces binary risk |
| Batch launches | Mechanics | Multi-asset coordination |
