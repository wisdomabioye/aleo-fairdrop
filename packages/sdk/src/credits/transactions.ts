/**
 * Transaction builders for credits.aleo (system program).
 */
import { DEFAULT_TX_FEE, type TxSpec } from '../transactions/_types';

/**
 * transfer_public_to_private — move credits from public balance into a private record.
 *
 * @param recipient  Address to receive the private record.
 * @param amount     Amount in microcredits.
 */
export function shieldCredits(
  recipient: string,
  amount:    bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:    'credits.aleo',
    function:   'transfer_public_to_private',
    inputs:     [recipient, `${amount}u64`],
    fee,
    privateFee: false,
  };
}
