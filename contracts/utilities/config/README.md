# fairdrop_config_v3.aleo

Protocol parameter registry. Stores global constants (fee BPS, creation fee, closer reward, slash reward) that auction programs read via CPI at auction creation time.

The caller reads current params off-chain and passes them as `ConfigSnapshot` to the auction transition. Finalize calls `fairdrop_config_v3.aleo/get_config` and asserts the snapshot matches — ensuring no stale values are used (D11 pattern).

Only the protocol admin address can update params. Updates take effect on the next auction created; existing auctions keep the snapshot from creation time.
