import { useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, TokenAmountInput } from '@/components';
import { Info } from 'lucide-react';
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useTokenInfo }    from '@/shared/hooks/useTokenInfo';
import { useTokenRecords } from '@/shared/hooks/useTokenRecords';
import { parseExecutionError } from '@/shared/utils/errors';
import type { WalletTokenRecord } from '@fairdrop/types/primitives';
import { TX_DEFAULT_FEE } from '@/env';

const TOKEN_REGISTRY = SYSTEM_PROGRAMS.tokenRegistry;

export function BurnTokenForm() {
  const { executeTransaction } = useWallet();
  const { tokenRecords, loading: fetching, fetchRecords } = useTokenRecords({ fetchOnMount: false });

  const [tokenId,     setTokenId]     = useState('');
  const [selectedRec, setSelectedRec] = useState<WalletTokenRecord | null>(null);
  const [amount,      setAmount]      = useState('');
  const [fetchError,  setFetchError]  = useState<string | null>(null);

  const { data: tokenInfo } = useTokenInfo(tokenId.endsWith('field') ? tokenId : null);
  const decimals  = tokenInfo?.decimals ?? 0;
  const filtered  = tokenRecords.filter((r) => r.token_id === tokenId && !r.spent);
  const recAmount = selectedRec?.amount ?? 0n;
  const rawAmount = parseTokenAmount(amount, decimals);
  const burnValid = !!selectedRec && rawAmount > 0n && rawAmount <= recAmount;

  async function handleFetch() {
    if (!tokenId.endsWith('field')) return;
    setFetchError(null);
    setSelectedRec(null);
    try {
      await fetchRecords();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : parseExecutionError(err));
    }
  }

  // Single-step flow — stepsRef in hook ensures latest selectedRec/rawAmount is used
  const steps = [{
    label: 'Burn Tokens',
    execute: async () => {
      const result = await executeTransaction({
        program:    TOKEN_REGISTRY,
        function:   'burn_private',
        inputs:     [selectedRec!._record, `${rawAmount}u128`],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      return result?.transactionId;
    },
  }];

  const { done, busy, isWaiting, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  const blocked = busy || isWaiting;

  function handleReset() {
    reset();
    setSelectedRec(null);
    setAmount('');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <p className="text-muted-foreground">
          Only the token admin or an account with <strong className="text-foreground">BURNER_ROLE</strong> can burn tokens.
        </p>
      </div>

      {done ? (
        <div className="space-y-4">
          <WizardTxStatus trackedIds={trackedIds} />
          <Button variant="outline" className="w-full" onClick={handleReset}>
            Burn another
          </Button>
        </div>
      ) : (
        <>
          {/* Token ID */}
          <div className="space-y-1.5">
            <Label>Token ID</Label>
            <div className="flex gap-2">
              <Input
                className="flex-1 font-mono text-xs"
                placeholder="123...field"
                value={tokenId}
                onChange={(e) => { setTokenId(e.target.value); setSelectedRec(null); }}
                disabled={blocked}
              />
              <Button
                variant="outline" size="sm"
                onClick={handleFetch}
                disabled={!tokenId.endsWith('field') || fetching || blocked}
              >
                {fetching ? <Spinner className="size-4" /> : 'Fetch'}
              </Button>
            </div>
            {tokenInfo && (
              <p className="text-xs text-muted-foreground">
                Found: <strong className="text-foreground">{tokenInfo.name}</strong> ({tokenInfo.symbol}) · {tokenInfo.decimals} decimals
              </p>
            )}
          </div>

          {/* Record picker */}
          {filtered.length > 0 && (
            <div className="space-y-1.5">
              <Label>Select Record</Label>
              <div className="space-y-1.5">
                {filtered.map((rec, i) => (
                  <button
                    key={rec.id}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors
                      ${selectedRec?.id === rec.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/40'}`}
                    onClick={() => setSelectedRec(rec)}
                    disabled={blocked}
                  >
                    <span className="font-mono text-muted-foreground">Record {i + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount */}
          {selectedRec && (
            <TokenAmountInput
              label="Amount to burn"
              value={amount}
              onChange={setAmount}
              decimals={decimals}
              symbol={tokenInfo?.symbol ?? undefined}
              max={recAmount}
              maxLabel="Burn all"
              error={rawAmount > recAmount ? 'Exceeds record amount' : undefined}
            />
          )}

          {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
          {error      && <p className="text-xs text-destructive">{parseExecutionError(error)}</p>}

          <WizardTxStatus trackedIds={trackedIds} />

          <Button
            variant="destructive"
            className="w-full"
            onClick={advance}
            disabled={!burnValid || blocked}
          >
            {busy      ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
            : isWaiting ? <><Spinner className="mr-2 size-4" /> Awaiting confirmation…</>
            : !selectedRec  ? 'Fetch records first'
            : rawAmount <= 0n ? 'Enter amount'
            : 'Burn Tokens'}
          </Button>
        </>
      )}
    </div>
  );
}
