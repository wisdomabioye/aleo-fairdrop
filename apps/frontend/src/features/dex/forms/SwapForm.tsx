import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { TokenAmountInput } from '@/components/fairdrop/token-amount-input';
import { computeSwapOutput, applySlippage } from '@fairdrop/sdk/dex';
import { parseTokenAmount, formatAmount } from '@fairdrop/sdk/format';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useTokenBalance } from '@/shared/hooks/useTokenBalance';
import { useTokenRecords } from '@/shared/hooks/useTokenRecords';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { PrivacyModeToggle } from '@/shared/components/PrivacyModeToggle';
import { useDexClient } from '../hooks/useDexClient';
import { getSwapDirection, computePriceImpact, formatPriceImpact } from '../utils/format';
import {
  SwapPreviewPanel,
  DexSubmitButton,
  DexErrorBanner,
  DexFormBlockerNotice,
  TokenRecordSelect,
} from './_parts';
import type { PoolState } from '@fairdrop/sdk/dex';
import type { TokenDisplay } from '@/config/well-known-tokens';
import type { Field, U128, Address } from '@fairdrop/types/primitives';

interface SwapFormProps {
  tokenIn:       string | null;
  tokenOut:      string | null;
  pool:          PoolState | null;
  poolLoading:   boolean;
  slippageBps:   number;
  tokenInMeta:   TokenDisplay | null;
  tokenOutMeta:  TokenDisplay | null;
}

export function SwapForm({
  tokenIn,
  tokenOut,
  pool,
  poolLoading,
  slippageBps,
  tokenInMeta,
  tokenOutMeta,
}: SwapFormProps) {
  const { connected, address } = useWallet();
  const client = useDexClient();

  const [amountIn,         setAmountIn]         = useState('');
  const [amountTouched,    setAmountTouched]     = useState(false);
  const [mode,             setMode]             = useState<'private' | 'public'>('public');
  const [selectedRecordId, setSelectedRecordId] = useState('');

  // Public balance
  const { data: publicBalance } = useTokenBalance(tokenIn);

  // Private records (for private path)
  const { tokenRecords, loading: recordsLoading } = useTokenRecords();
  const tokenInRecords = useMemo(
    () => tokenIn ? tokenRecords.filter((r) => !r.spent && r.token_id === tokenIn) : [],
    [tokenRecords, tokenIn],
  );
  const selectedRecord = tokenInRecords.find((r) => r.id === selectedRecordId) ?? null;

  // Derived amounts
  const decimalsIn  = tokenInMeta?.decimals ?? 6;
  const decimalsOut = tokenOutMeta?.decimals ?? 6;

  const rawIn = mode === 'private' && selectedRecord
    ? selectedRecord.amount
    : parseTokenAmount(amountIn, decimalsIn);

  const { reserveIn, reserveOut } = pool && tokenIn
    ? getSwapDirection(pool, tokenIn)
    : { reserveIn: 0n, reserveOut: 0n };

  const preview = pool && rawIn > 0n
    ? computeSwapOutput(reserveIn, reserveOut, rawIn, pool.feeBps)
    : null;

  const minOut = preview !== null ? applySlippage(preview, slippageBps) : 0n;

  const impact = preview !== null
    ? computePriceImpact(reserveIn, reserveOut, rawIn, preview)
    : null;

  // Form blocker
  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect your wallet.';
    if (!client)    return 'Wallet not ready.';
    if (!tokenIn)   return 'Select input token.';
    if (!tokenOut)  return 'Select output token.';
    if (poolLoading) return 'Loading pool…';
    if (!pool)      return 'No pool exists for this pair.';
    if (mode === 'public') {
      if (rawIn <= 0n) return 'Enter an amount.';
      if (publicBalance != null && rawIn > publicBalance) return 'Insufficient balance.';
    } else {
      if (!selectedRecord) return 'Select a token record.';
    }
    return null;
  }, [connected, client, tokenIn, tokenOut, poolLoading, pool, mode, rawIn, publicBalance, selectedRecord]);

  // Steps
  const steps = useMemo(() => {
    const label = mode === 'private'
      ? `Private Swap ${tokenInMeta?.symbol ?? ''} → ${tokenOutMeta?.symbol ?? ''}`
      : `Swap ${tokenInMeta?.symbol ?? ''} → ${tokenOutMeta?.symbol ?? ''}`;

    return [{
      label,
      execute: async () => {
        if (!client || !tokenIn || !tokenOut || !address || !pool) return undefined;

        if (mode === 'private') {
          if (!selectedRecord || preview === null) return undefined;
          const txId = await client.swapPrivate({
            token_in:     selectedRecord._record,
            token_out_id: tokenOut as Field,
            amount_out:   String(preview) as U128,
            min_out:      String(minOut) as U128,
            recipient:    address as Address,
          });
          return txId;
        }

        if (rawIn <= 0n) return undefined;
        const txId = await client.swap({
          token_in_id:  tokenIn  as Field,
          token_out_id: tokenOut as Field,
          amount_in:    String(rawIn) as U128,
          min_out:      String(minOut) as U128,
          recipient:    address as Address,
        });
        return txId;
      },
    }];
  }, [client, tokenIn, tokenOut, address, pool, mode, rawIn, minOut, preview, selectedRecord, tokenInMeta, tokenOutMeta]);

  const {
    done, busy, isWaiting, error, trackedIds,
    advance, reset,
  } = useConfirmedSequentialTx(steps);

  useEffect(() => {
    if (!done) return;
    setAmountIn('');
    setAmountTouched(false);
    setSelectedRecordId('');
    reset();
  }, [done]);

  const isDisabled = !!formBlocker || busy || isWaiting;

  // Preview rows
  const impactFmt = impact !== null ? formatPriceImpact(impact) : null;
  const previewRows: ([string, string] | null | false)[] = [
    preview !== null && ['Expected output',  formatAmount(preview, decimalsOut)],
    preview !== null && ['Minimum received',  formatAmount(minOut, decimalsOut)],
    impactFmt       && ['Price impact',       impactFmt.text],
    pool            && ['Fee',                `${(pool.feeBps / 100).toFixed(2)}%`],
  ];

  return (
    <div className="space-y-3">
      <PrivacyModeToggle
        mode={mode}
        onChange={(m) => {
          setMode(m);
          setSelectedRecordId('');
          setAmountIn('');
          setAmountTouched(false);
        }}
      />

      {mode === 'public' ? (
        <TokenAmountInput
          label="You pay"
          value={amountIn}
          onChange={(v) => { if (!amountTouched) setAmountTouched(true); setAmountIn(v); }}
          decimals={decimalsIn}
          symbol={tokenInMeta?.symbol}
          max={publicBalance ?? undefined}
          placeholder="0"
        />
      ) : (
        <TokenRecordSelect
          records={tokenInRecords}
          loading={recordsLoading}
          value={selectedRecordId}
          onChange={setSelectedRecordId}
          decimals={decimalsIn}
          symbol={tokenInMeta?.symbol}
          label="Token record (full amount swapped)"
        />
      )}

      {mode === 'private' && selectedRecord && (
        <p className="text-xs text-muted-foreground">
          Swapping full record: {formatAmount(selectedRecord.amount, decimalsIn)} {tokenInMeta?.symbol ?? ''}
        </p>
      )}

      <SwapPreviewPanel rows={previewRows} />

      {!!formBlocker && <DexFormBlockerNotice message={formBlocker} />}

      <DexSubmitButton
        busy={busy}
        waiting={isWaiting}
        disabled={isDisabled}
        onClick={() => void advance()}
        label={!pool ? 'No Pool' : mode === 'private' ? 'Private Swap' : 'Swap'}
      />

      <DexErrorBanner error={error} />
      <WizardTxStatus trackedIds={trackedIds} />
    </div>
  );
}
