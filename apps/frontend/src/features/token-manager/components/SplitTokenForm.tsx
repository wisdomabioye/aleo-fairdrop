import { useState, useMemo } from 'react';
import { useWallet }         from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, TokenAmountInput } from '@/components';
import { RefreshCw }         from 'lucide-react';
import { splitToken }        from '@fairdrop/sdk/token-registry';
import { formatAmount, parseTokenAmount } from '@fairdrop/sdk/format';
import { WizardTxStatus }          from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useTokenRecords }          from '@/shared/hooks/useTokenRecords';
import { useTokenMetadata }         from '@/shared/hooks/useTokenMetadata';
import { parseExecutionError }      from '@/shared/utils/errors';
import { RecordPicker }             from './RecordPicker';
import type { WalletTokenRecord }   from '@fairdrop/types/primitives';

export function SplitTokenForm() {
  const { executeTransaction } = useWallet();

  const { tokenRecords, loading, fetchRecords } = useTokenRecords({ fetchOnMount: false });
  const [fetched,      setFetched]      = useState(false);
  const [selected,     setSelected]     = useState<WalletTokenRecord | null>(null);
  const [splitAmount,  setSplitAmount]  = useState('');

  const activeRecords  = useMemo(() => tokenRecords.filter((r) => !r.spent && r.amount > 0n), [tokenRecords]);
  const uniqueTokenIds = useMemo(() => [...new Set(activeRecords.map((r) => r.token_id))], [activeRecords]);
  const { dataMap: metaMap } = useTokenMetadata(uniqueTokenIds);

  const meta      = metaMap.get(selected?.token_id ?? '');
  const decimals  = meta?.decimals ?? 0;
  const rawAmount = parseTokenAmount(splitAmount, decimals);
  const remainder = (selected?.amount ?? 0n) - rawAmount;
  const splitValid = !!selected && rawAmount > 0n && rawAmount <= (selected.amount ?? 0n);

  async function handleFetch() {
    setSelected(null);
    setSplitAmount('');
    await fetchRecords();
    setFetched(true);
  }

  const steps = [{
    label: 'Split Record',
    execute: async () => {
      const spec   = splitToken(selected!._record, rawAmount);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      if (!result?.transactionId) throw new Error('Wallet did not return a transaction ID.');
      return result.transactionId;
    },
  }];

  const { done, busy, isWaiting, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  const blocked = busy || isWaiting;

  function handleReset() {
    reset();
    setSelected(null);
    setSplitAmount('');
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          Record split — two new records will appear in your wallet once the transaction confirms.
        </div>
        <WizardTxStatus trackedIds={trackedIds} />
        <Button variant="outline" className="w-full" onClick={handleReset}>Split another</Button>
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

      {/* Record picker */}
      {fetched && (
        <RecordPicker
          records={activeRecords}
          metaMap={metaMap}
          selected={selected}
          onSelect={(r) => { setSelected(r); setSplitAmount(''); }}
          disabled={blocked}
          emptyMessage="No active token records found."
        />
      )}

      {/* Amount input */}
      {selected && (
        <TokenAmountInput
          label="Split off amount"
          value={splitAmount}
          onChange={setSplitAmount}
          decimals={decimals}
          symbol={meta?.symbol}
          max={selected.amount - 1n > 0n ? selected.amount - 1n : undefined}
          maxLabel="Leave 1"
          placeholder="0"
          error={rawAmount > (selected.amount ?? 0n) ? 'Exceeds record amount' : undefined}
          hint="The remainder stays in a second record."
        />
      )}

      {/* Preview */}
      {selected && rawAmount > 0n && rawAmount <= (selected.amount ?? 0n) && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3 text-sm">
          <div className="text-center">
            <p className="text-[11px] text-muted-foreground">Original</p>
            <p className="font-semibold tabular-nums">
              {formatAmount(selected.amount, decimals)}{meta?.symbol ? ` ${meta.symbol}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <div className="h-px flex-1 bg-border/40" />
            <span>splits into</span>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Record A</p>
              <p className="font-semibold tabular-nums text-sky-300">
                {formatAmount(rawAmount, decimals)}
              </p>
            </div>
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Record B</p>
              <p className="font-semibold tabular-nums text-emerald-300">
                {formatAmount(remainder, decimals)}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive break-words">
          {parseExecutionError(error)}
        </div>
      )}

      <Button className="w-full" onClick={advance} disabled={!splitValid || blocked}>
        {busy      ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
        : isWaiting ? <><Spinner className="mr-2 size-4" /> Awaiting confirmation…</>
        : !fetched   ? 'Load records first'
        : !selected  ? 'Select a record'
        : !splitValid ? 'Enter split amount'
        : 'Split Record'}
      </Button>
    </div>
  );
}
