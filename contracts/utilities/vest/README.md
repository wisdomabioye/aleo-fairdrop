# fairdrop_vest.aleo

Linear token vesting with cliff. When `vest_enabled` is set on an auction, winning bidders receive a `VestedAllocation` record instead of tokens directly. They call `release` to unlock tokens linearly after the cliff.

Schedule is fixed at auction creation: `vest_cliff_blocks` must pass before any tokens unlock; full unlock at `vest_cliff_blocks + vest_end_blocks`. The schedule is relative to `ended_at_block` (the block when `close_auction` was called).

`release` can be called multiple times — each call transfers the currently unlocked delta. The `VestedAllocation` record tracks cumulative claimed amount.
