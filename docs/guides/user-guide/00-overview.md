# What is Fairdrop?

Fairdrop is a token launch platform built on [Aleo](https://aleo.org) — a blockchain that
uses zero-knowledge proofs to keep data private by default.

---

## The core idea

On most blockchains every bid in a token sale is fully public: anyone can see who bid, how
much they bid, and adjust their own strategy in response. This leads to front-running, whale
coordination, and unfair distribution.

Fairdrop uses Aleo's ZK model to **seal bid quantities during the auction**. While an
auction is live, other participants cannot see how many tokens you are bidding for. The
auction settles fairly once the window closes.

---

## Six auction formats

Fairdrop supports six auction types, each designed for a different launch goal:

| Type | Best for |
|---|---|
| **Dutch** | Price discovery — starts high, drops until demand matches supply |
| **Sealed** | Maximum fairness — all bids hidden until a reveal window |
| **Raise** | Fixed-price community round — everyone pays the same price |
| **Ascending** | Reward early supporters — price rises over time |
| **LBP** | Liquidity bootstrapping — weight-decay prevents bot front-running |
| **Quadratic** | Anti-whale fairness — smaller contributions carry more weight |

See [Auction types](./auctions/README.md) for a full comparison.

---

## Companion features

Every auction on Fairdrop can be extended with:

- **Gate** — restrict who can bid: open to all, allowlist (Merkle proof), or credential
  (off-chain issuer signs eligibility)
- **Vesting** — lock won tokens on a cliff + linear schedule so they release over time
- **Referral** — bidders can share referral links; referrers earn a commission from the
  protocol fee pool
- **Proof** — participation receipts build creator reputation on-chain

---

## How an auction lifecycle works

```
Creator submits → Auction is live → Bidders place bids
      ↓
Auction ends (by block height or early close)
      ↓
Sealed: reveal window → slash window → close
All others: close immediately
      ↓
Bidders claim tokens (or credits refund)
      ↓
Vested tokens release over time (if vesting enabled)
```

---

## Aleo and privacy

Aleo uses ZK proofs so that:

- Your bid source (which wallet credits you spend) is hidden.
- Your bid quantity is sealed during the auction on Sealed-type auctions.
- Gate credentials are verified without revealing the underlying identity data.

Fairdrop is live on Aleo Testnet Beta. Mainnet launch follows testnet stabilisation.

---

## Next steps

- [Compare auction types →](./auctions/README.md)
- [Create your first auction →](./creating/README.md)
- [Place a bid →](./bidding/README.md)
