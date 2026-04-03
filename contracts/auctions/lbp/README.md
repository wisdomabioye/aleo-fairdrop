# fairdrop_lbp_v2.aleo

Liquidity Bootstrapping Pool auction. Token price starts high and decays over time via a weighted AMM curve. Buying pressure pushes the price back up; sell pressure drives it down. Self-correcting price discovery that discourages front-running and bots.

Different from Dutch in that the curve is AMM-driven (weight shifts) rather than linear time-decay, allowing more organic price discovery over longer windows.

## Status

Design complete. Implementation pending.
