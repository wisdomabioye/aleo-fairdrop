import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { TokenAmountInput } from '@/components/fairdrop/token-amount-input';
import {
  computePoolKey,
  computeRemoveLiquidityAmounts,
  applySlippage,
} from '@fairdrop/sdk/dex';
import { parseTokenAmount, formatAmount } from '@fairdrop/sdk/format';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { PrivacyModeToggle } from '@/shared/components/PrivacyModeToggle';
import { useDexClient } from '../hooks/useDexClient';
import { useLpBalance } from '../hooks/useLpBalance';
import { useLpTokenRecords } from '../hooks/useLpTokenRecords';
import {
  LiquidityPreviewPanel,
  LpRecordSelect,
  DexSubmitButton,
  DexErrorBanner,
  DexFormBlockerNotice,
} from './_parts';
import type { PoolState } from '@fairdrop/sdk/dex';
import type { TokenDisplay } from '@/config/well-known-tokens';
import type { Field, U128, Address } from '@fairdrop/types/primitives';

interface RemoveLiquidityFormProps {
  tokenA:      string | null;
  tokenB:      string | null;
  tokenAMeta:  TokenDisplay | null;
  tokenBMeta:  TokenDisplay | null;
  pool:        PoolState | null;
  slippageBps: number;
}

export function RemoveLiquidityForm({
  tokenA,
  tokenB,
  tokenAMeta,
  tokenBMeta,
  pool,
  slippageBps,
}: RemoveLiquidityFormProps) {
  const { connected, address } = useWallet();
  const client = useDexClient();

  const [lpAmountInput, setLpAmountInput] = useState('');
  const [mode,          setMode]          = useState<'private' | 'public'>('public');
  const [selectedLpRecordId, setSelectedLpRecordId] = useState('');

  // Pool key (WASM — call in useMemo)
  const poolKey = useMemo(() => {
    if (!tokenA || !tokenB) return null;
    try { return computePoolKey(tokenA, tokenB); }
    catch { return null; }
  }, [tokenA, tokenB]);

  // Public LP balance
  const { data: lpBalance } = useLpBalance(address ?? null, poolKey);

  // Private LP records filtered by pool
  const { records: allLpRecords, loading: lpRecordsLoading } = useLpTokenRecords();
  const pairLpRecords = useMemo(
    () => poolKey ? allLpRecords.filter((r) => !r.spent && r.poolKey === poolKey) : [],
    [allLpRecords, poolKey],
  );
  const selectedLpRecord = pairLpRecords.find((r) => r.id === selectedLpRecordId) ?? null;

  // Derived
  const decimalsA = tokenAMeta?.decimals ?? 6;
  const decimalsB = tokenBMeta?.decimals ?? 6;

  const lpAmount = mode === 'private' && selectedLpRecord
    ? selectedLpRecord.amount
    : parseTokenAmount(lpAmountInput, 0);

  const { amountA, amountB } = pool && lpAmount > 0n
    ? computeRemoveLiquidityAmounts(pool.reserveA, pool.reserveB, pool.lpSupply, lpAmount)
    : { amountA: 0n, amountB: 0n };

  const minA = applySlippage(amountA, slippageBps);
  const minB = applySlippage(amountB, slippageBps);

  // Form blocker
  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect your wallet.';
    if (!client)    return 'Wallet not ready.';
    if (!tokenA || !tokenB) return 'Select a token pair.';
    if (!pool)      return 'No pool exists for this pair.';
    if (mode === 'public') {
      if (lpAmount <= 0n) return 'Enter LP amount.';
      if (lpBalance != null && lpAmount > lpBalance) return 'Insufficient LP balance.';
    } else {
      if (!selectedLpRecord) return 'Select an LP record.';
    }
    return null;
  }, [connected, client, tokenA, tokenB, pool, mode, lpAmount, lpBalance, selectedLpRecord]);

  // Steps
  const steps = useMemo(() => {
    const label = mode === 'private' ? 'Private Remove Liquidity' : 'Remove Liquidity';
    return [{
      label,
      execute: async () => {
        if (!client || !pool || !address) return undefined;

        if (mode === 'private') {
          if (!selectedLpRecord) return undefined;
          const txId = await client.removeLiquidityPrivate({
            lp:          selectedLpRecord._record,
            token_a_id:  pool.tokenA as Field,
            token_b_id:  pool.tokenB as Field,
            amount_a:    String(amountA) as U128,
            amount_b:    String(amountB) as U128,
            min_a:       String(minA) as U128,
            min_b:       String(minB) as U128,
            recipient:   address as Address,
          });
          return txId;
        }

        if (lpAmount <= 0n) return undefined;
        const txId = await client.removeLiquidity({
          token_a_id:  pool.tokenA as Field,
          token_b_id:  pool.tokenB as Field,
          lp_amount:   String(lpAmount) as U128,
          min_a:       String(minA) as U128,
          min_b:       String(minB) as U128,
          recipient:   address as Address,
        });
        return txId;
      },
    }];
  }, [client, pool, address, mode, lpAmount, amountA, amountB, minA, minB, selectedLpRecord]);

  const {
    done, busy, isWaiting, error, trackedIds,
    advance, reset,
  } = useConfirmedSequentialTx(steps);

  useEffect(() => {
    if (!done) return;
    setLpAmountInput('');
    setSelectedLpRecordId('');
    reset();
  }, [done]);

  const isDisabled = !!formBlocker || busy || isWaiting;

  const previewRows: ([string, string] | false)[] = [
    amountA > 0n && [`Receive ${tokenAMeta?.symbol ?? 'A'}`, formatAmount(amountA, decimalsA)],
    amountB > 0n && [`Receive ${tokenBMeta?.symbol ?? 'B'}`, formatAmount(amountB, decimalsB)],
    minA > 0n    && [`Min ${tokenAMeta?.symbol ?? 'A'} (slippage)`, formatAmount(minA, decimalsA)],
    minB > 0n    && [`Min ${tokenBMeta?.symbol ?? 'B'} (slippage)`, formatAmount(minB, decimalsB)],
  ];

  return (
    <div className="space-y-3">
      <PrivacyModeToggle
        mode={mode}
        onChange={(m) => {
          setMode(m);
          setLpAmountInput('');
          setSelectedLpRecordId('');
        }}
      />

      {mode === 'public' ? (
        <TokenAmountInput
          label="LP Amount"
          value={lpAmountInput}
          onChange={setLpAmountInput}
          decimals={0}
          symbol="LP"
          max={lpBalance ?? undefined}
          placeholder="0"
        />
      ) : (
        <LpRecordSelect
          records={pairLpRecords}
          loading={lpRecordsLoading}
          value={selectedLpRecordId}
          onChange={setSelectedLpRecordId}
          label="LP record (full amount burned)"
        />
      )}

      {mode === 'private' && selectedLpRecord && (
        <p className="text-xs text-muted-foreground">
          Burning full LP record: {selectedLpRecord.amount.toLocaleString()} LP
        </p>
      )}

      <LiquidityPreviewPanel rows={previewRows} />

      {!!formBlocker && <DexFormBlockerNotice message={formBlocker} />}

      <DexSubmitButton
        busy={busy}
        waiting={isWaiting}
        disabled={isDisabled}
        onClick={() => void advance()}
        label={mode === 'private' ? 'Private Remove Liquidity' : 'Remove Liquidity'}
      />

      <DexErrorBanner error={error} />
      <WizardTxStatus trackedIds={trackedIds} />
    </div>
  );
}
