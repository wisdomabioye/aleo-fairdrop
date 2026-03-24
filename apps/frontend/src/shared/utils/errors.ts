/**
 * Parse known contract revert patterns into user-friendly messages.
 * Called by UI after useSequentialTx captures a step error.
 */
export function parseExecutionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('assert_config'))
    return 'Protocol config changed while the wizard was open. Review the updated fee and resubmit.';

  if (msg.includes('check_not_paused'))
    return 'The protocol is currently paused. Check status and try again later.';

  if (msg.includes('finalize_claim_commission'))
    return 'Commission amount changed (another credit ran concurrently). Retrying with the updated amount…';

  return 'Transaction failed. Check your wallet for details.';
}
