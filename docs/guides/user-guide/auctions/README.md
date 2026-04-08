# Auction types

Fairdrop supports six auction formats. Choose the one that best fits your token launch goal.

---

## Comparison

| Type | Price movement | Settlement | Early close | Best for |
|---|---|---|---|---|
| **Dutch** | Descends over time | Uniform clearing price | Yes | Price discovery |
| **Sealed** | Commit-reveal | Uniform clearing price | Yes | Maximum bid privacy |
| **Raise** | Fixed (set by creator) | Pro-rata by contribution | Yes | Community rounds |
| **Ascending** | Rises over time | Pay your bid price | Yes | Rewarding early buyers |
| **LBP** | Descends by weight | Pay current price | No | Bot-resistant launches |
| **Quadratic** | Fixed raise target | Pro-rata by √contribution | No | Anti-whale fairness |

---

## Key concepts

**Uniform clearing price** — all winning bidders pay the same final price regardless of when
they bid. Applies to Dutch and Sealed auctions.

**Pay-your-bid** — each bidder pays the price that was active at the moment they bid.
Applies to Ascending and LBP auctions.

**Pro-rata** — tokens are distributed proportionally. In a Raise auction, proportional to
ALEO contributed. In a Quadratic auction, proportional to the square root of ALEO contributed.

**Early close** — the creator can close before the end block once supply is fully subscribed.
Supported by: Dutch, Sealed, Raise, and Ascending.

---

## Detailed guides

- [Dutch](./dutch.md)
- [Sealed](./sealed.md)
- [Raise](./raise.md)
- [Ascending](./ascending.md)
- [LBP](./lbp.md)
- [Quadratic](./quadratic.md)
