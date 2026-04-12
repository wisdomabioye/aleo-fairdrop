import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import type { WalletRecord } from '@fairdrop/types/primitives';

interface Options {
  pollInterval?:  number;
  fetchOnMount?:  boolean;
}

function isWalletRecord(value: unknown): value is WalletRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['recordName']      === 'string' &&
    typeof r['recordPlaintext'] === 'string' &&
    typeof r['spent']           === 'boolean'
  );
}

/**
 * Base primitive: fetches all decrypted records for one program.
 * Build domain-specific hooks (useTokenRecords, useBidRecords, …) on top of this.
 *
 * @param programId - Program to fetch records from (e.g. "fairdrop_dutch_v4.aleo")
 * @param opts.fetchOnMount - Fetch automatically when wallet connects (default: true)
 * @param opts.pollInterval - Re-fetch every N ms (optional)
 */
export function useWalletRecords(programId: string, opts: Options = {}) {
  const { fetchOnMount = true, pollInterval } = opts;
  const { address, requestRecords } = useWallet();

  const [entries, setEntries] = useState<WalletRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecords = useCallback(async () => {
    if (!address || !requestRecords) return;
    setLoading(true);
    try {
      const raw = await (requestRecords as (p: string, includePlaintext: boolean) => Promise<unknown[]>)(programId, true);
      setEntries((raw ?? []).filter(isWalletRecord));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const silent =
        e instanceof Error && (
          e.name === 'WalletNotConnectedError' ||
          msg.includes('No response')
        );
      if (!silent) console.error(`[useWalletRecords:${programId}]`, e);
    } finally {
      setLoading(false);
    }
  }, [address, requestRecords, programId]);

  useEffect(() => {
    if (address && fetchOnMount) fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    if (!address || !pollInterval) return;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await fetchRecords();
      timeout = setTimeout(poll, pollInterval);
    };
    poll();
    return () => clearTimeout(timeout);
  }, [address, pollInterval, fetchRecords]);

  return { entries, loading, fetchRecords };
}
