import { useState, useMemo } from 'react';
import { useWallet }         from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner }   from '@/components';
import { RefreshCw }         from 'lucide-react';
import { SYSTEM_PROGRAMS }  from '@fairdrop/sdk/constants';
import { formatAmount }      from '@fairdrop/sdk/format';
import { WizardTxStatus }          from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useTokenRecords }          from '@/shared/hooks/useTokenRecords';
import { useTokenMetadata }         from '@/shared/hooks/useTokenMetadata';
import { parseExecutionError }      from '@/shared/utils/errors';
import { TX_DEFAULT_FEE }           from '@/env';
import { RecordPicker }             from './RecordPicker';
import type { WalletTokenRecord }   from '@fairdrop/types/primitives';

const TOKEN_REGISTRY = SYSTEM_PROGRAMS.tokenRegistry;

export function JoinTokenForm() {
  const { executeTransaction } = useWallet();

  const { tokenRecords, loading, fetchRecords } = useTokenRecords({ fetchOnMount: false });
  const [fetched, setFetched] = useState(false);
  const [rec1, setRec1]       = useState<WalletTokenRecord | null>(null);
  const [rec2, setRec2]       = useState<WalletTokenRecord | null>(null);

  const activeRecords  = useMemo(() => tokenRecords.filter((r) => !r.spent && r.amount > 0n), [tokenRecords]);
  const uniqueTokenIds = useMemo(() => [...new Set(activeRecords.map((r) => r.token_id))], [activeRecords]);
  const { dataMap: metaMap } = useTokenMetadata(uniqueTokenIds);

  // Second picker: same token as rec1, excluding rec1 by both id and _record content
  const rec2Options = useMemo(
    () => activeRecords.filter(
      (r) => rec1 && r.token_id === rec1.token_id && r.id !== rec1.id && r._record !== rec1._record,
    ),
    [activeRecords, rec1],
  );

  const meta     = metaMap.get(rec1?.token_id ?? '');
  const decimals = meta?.decimals ?? 0;
  const combined = (rec1?.amount ?? 0n) + (rec2?.amount ?? 0n);
  const joinValid = !!rec1 && !!rec2;

  async function handleFetch() {
    setRec1(null);
    setRec2(null);
    await fetchRecords();
    setFetched(true);
  }

  const steps = [{
    label: 'Join Records',
    execute: async () => {
      const result = await executeTransaction({
        program:    TOKEN_REGISTRY,
        function:   'join',
        inputs:     [rec1!._record, rec2!._record],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      if (!result?.transactionId) throw new Error('Wallet did not return a transaction ID.');
      return result.transactionId;
    },
  }];

  const { done, busy, isWaiting, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  const blocked = busy || isWaiting;

  function handleReset() {
    reset();
    setRec1(null);
    setRec2(null);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          Records joined — the combined record will appear in your wallet once the transaction confirms.
        </div>
        <WizardTxStatus trackedIds={trackedIds} />
        <Button variant="outline" className="w-full" onClick={handleReset}>Join more</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Load records */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {fetched ? `${activeRecords.length} active record${activeRecords.length !== 1 ? 's' : ''}` : 'Load your token records to begin.'}
        </p>
        <Button variant="outline" size="sm" disabled={loading || blocked} onClick={handleFetch}
          className="h-7 gap-1.5 px-2 text-xs">
          {loading ? <Spinner className="size-3" /> : <RefreshCw className="size-3" />}
          {fetched ? 'Refresh' : 'Load Records'}
        </Button>
      </div>

      {/* First record */}
      {fetched && (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">First record</p>
            <RecordPicker
              records={activeRecords}
              metaMap={metaMap}
              selected={rec1}
              onSelect={(r) => { setRec1(r); setRec2(null); }}
              disabled={blocked}
              emptyMessage="No active token records found."
            />
          </div>

          {/* Second record — only shown after first is picked */}
          {rec1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Second record (same token)</p>
              <RecordPicker
                records={rec2Options}
                metaMap={metaMap}
                selected={rec2}
                onSelect={setRec2}
                disabled={blocked}
                emptyMessage="No other records with the same token found."
              />
            </div>
          )}
        </>
      )}

      {/* Preview */}
      {rec1 && rec2 && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3 text-sm">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="rounded-md border border-border/50 bg-background/40 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Record 1</p>
              <p className="font-semibold tabular-nums">{formatAmount(rec1.amount, decimals)}</p>
            </div>
            <span className="text-sm font-bold text-muted-foreground">+</span>
            <div className="rounded-md border border-border/50 bg-background/40 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Record 2</p>
              <p className="font-semibold tabular-nums">{formatAmount(rec2.amount, decimals)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <div className="h-px flex-1 bg-border/40" />
            <span>combined into</span>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Combined</p>
            <p className="font-semibold tabular-nums text-emerald-300">
              {formatAmount(combined, decimals)}{meta?.symbol ? ` ${meta.symbol}` : ''}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive break-words">
          {parseExecutionError(error)}
        </div>
      )}
      
      <Button className="w-full" onClick={advance} disabled={!joinValid || blocked}>
        {busy      ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
        : isWaiting ? <><Spinner className="mr-2 size-4" /> Awaiting confirmation…</>
        : !fetched   ? 'Load records first'
        : !rec1      ? 'Select first record'
        : !rec2      ? 'Select second record'
        : 'Join Records'}
      </Button>
    </div>
  );
}
