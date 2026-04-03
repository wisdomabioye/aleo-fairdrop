# fairdrop_quadratic_v2.aleo

Quadratic funding auction. Each participant's contribution is counted as the square root of their payment; the matching pool amplifies smaller contributions. Designed to fund public goods by weighting breadth of participation over depth of capital.

Requires gate integration (`fairdrop_gate_v2.aleo`) to enforce one-identity-per-address and prevent Sybil attacks — without gating, quadratic funding is trivially exploitable.

## Status

Design complete. Implementation pending.
