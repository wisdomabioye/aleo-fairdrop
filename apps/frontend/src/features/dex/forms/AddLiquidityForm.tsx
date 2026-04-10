import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { TokenAmountInput } from '@/components/fairdrop/token-amount-input';
import { Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components';
import {
  computeAddLiquidityAmounts,
  computeLpToMint,
  applySlippage,
} from '@fairdrop/sdk/dex';
import { parseTokenAmount, formatAmount } from '@fairdrop/sdk/format';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useTokenBalance } from '@/shared/hooks/useTokenBalance';
import { useTokenRecords } from '@/shared/hooks/useTokenRecords';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { PrivacyModeToggle } from '@/shared/components/PrivacyModeToggle';
import { useDexClient } from '../hooks/useDexClient';
import {
  LiquidityPreviewPanel,
  DexSubmitButton,
  DexErrorBanner,
  DexFormBlockerNotice,
  TokenRecordSelect,
} from './_parts';
import type { PoolState } from '@fairdrop/sdk/dex';
import type { TokenDisplay } from '@/config/well-known-tokens';
import type { Field, U128, Address } from '@fairdrop/types/primitives';

const FEE_TIERS = [
  { label: '0.30%', bps: 30 },
  { label: '0.50%', bps: 50 },
  { label: '1.00%', bps: 100 },
];

interface AddLiquidityFormProps {
  tokenA:      string | null;
  tokenB:      string | null;
  tokenAMeta:  TokenDisplay | null;
  tokenBMeta:  TokenDisplay | null;
  pool:        PoolState | null;
  poolLoading: boolean;
  slippageBps: number;
}

export function AddLiquidityForm({
  tokenA,
  tokenB,
  tokenAMeta,
  tokenBMeta,
  pool,
  poolLoading,
  slippageBps,
}: AddLiquidityFormProps) {
  const { connected, address } = useWallet();
  const client = useDexClient();

  const [amountA,     setAmountA]     = useState('');
  const [amountB,     setAmountB]     = useState('');
  const [feeBps,      setFeeBps]      = useState(30);
  const [mode,        setMode]        = useState<'private' | 'public'>('public');
  const [recordAId,   setRecordAId]   = useState('');
  const [recordBId,   setRecordBId]   = useState('');

  const decimalsA = tokenAMeta?.decimals ?? 6;
  const decimalsB = tokenBMeta?.decimals ?? 6;

  // Public balances
  const { data: balanceA } = useTokenBalance(tokenA);
  const { data: balanceB } = useTokenBalance(tokenB);

  // Private records
  const { tokenRecords, loading: recordsLoading } = useTokenRecords();
  const recordsA = useMemo(
    () => tokenA ? tokenRecords.filter((r) => !r.spent && r.token_id === tokenA) : [],
    [tokenRecords, tokenA],
  );
  const recordsB = useMemo(
    () => tokenB ? tokenRecords.filter((r) => !r.spent && r.token_id === tokenB) : [],
    [tokenRecords, tokenB],
  );
  const selectedRecordA = recordsA.find((r) => r.id === recordAId) ?? null;
  const selectedRecordB = recordsB.find((r) => r.id === recordBId) ?? null;

  // Derived amounts
  const isNewPool = !pool;

  const rawA = mode === 'private' && selectedRecordA
    ? selectedRecordA.amount
    : parseTokenAmount(amountA, decimalsA);

  const rawB = useMemo(() => {
    if (mode === 'private' && selectedRecordB) return selectedRecordB.amount;
    if (isNewPool) return parseTokenAmount(amountB, decimalsB);
    if (pool && rawA > 0n) return computeAddLiquidityAmounts(pool.reserveA, pool.reserveB, pool.lpSupply, rawA).amountB;
    return 0n;
  }, [mode, selectedRecordB, isNewPool, pool, rawA, amountB, decimalsB]);

  // LP preview
  const lpMint = useMemo(() => {
    if (rawA <= 0n || rawB <= 0n) return 0n;
    if (pool) {
      // Canonical sort for private path
      if (mode === 'private' && selectedRecordA) {
        const isACanonical = selectedRecordA.token_id === pool.tokenA;
        const canonA = isACanonical ? rawA : rawB;
        const canonB = isACanonical ? rawB : rawA;
        return computeLpToMint(pool.reserveA, pool.reserveB, pool.lpSupply, canonA, canonB);
      }
      return computeLpToMint(pool.reserveA, pool.reserveB, pool.lpSupply, rawA, rawB);
    }
    return computeLpToMint(0n, 0n, 0n, rawA, rawB);
  }, [pool, rawA, rawB, mode, selectedRecordA]);

  const minLp = applySlippage(lpMint, slippageBps);

  // Auto-update derived amountB display for existing pool (public mode)
  useEffect(() => {
    if (mode !== 'public' || isNewPool || !pool || rawA <= 0n) return;
    const derived = computeAddLiquidityAmounts(pool.reserveA, pool.reserveB, pool.lpSupply, rawA).amountB;
    setAmountB(formatAmount(derived, decimalsB));
  }, [mode, isNewPool, pool, rawA, decimalsB]);

  // Form blocker
  const formBlocker = useMemo(() => {
    if (!connected) return 'Connect your wallet.';
    if (!client)    return 'Wallet not ready.';
    if (!tokenA)    return 'Select token A.';
    if (!tokenB)    return 'Select token B.';
    if (poolLoading) return 'Loading pool…';
    if (mode === 'public') {
      if (rawA <= 0n) return 'Enter amount A.';
      if (rawB <= 0n) return isNewPool ? 'Enter amount B.' : 'Derived amount B is zero.';
      if (balanceA != null && rawA > balanceA) return 'Insufficient balance for token A.';
      if (balanceB != null && rawB > balanceB) return 'Insufficient balance for token B.';
    } else {
      if (!selectedRecordA) return 'Select a record for token A.';
      if (!selectedRecordB) return 'Select a record for token B.';
    }
    return null;
  }, [connected, client, tokenA, tokenB, poolLoading, mode, rawA, rawB, isNewPool, balanceA, balanceB, selectedRecordA, selectedRecordB]);

  // Steps
  const steps = useMemo(() => {
    const label = mode === 'private' ? 'Private Add Liquidity' : 'Add Liquidity';
    return [{
      label,
      execute: async () => {
        if (!client || !tokenA || !tokenB || !address) return undefined;

        if (mode === 'private') {
          if (!selectedRecordA || !selectedRecordB) return undefined;
          const txId = await client.addLiquidityPrivate({
            record_a:   selectedRecordA._record,
            record_b:   selectedRecordB._record,
            lp_to_mint: String(lpMint) as U128,
            min_lp:     String(minLp)  as U128,
            fee_bps:    feeBps,
            recipient:  address as Address,
          });
          return txId;
        }

        if (rawA <= 0n || rawB <= 0n) return undefined;
        const txId = await client.addLiquidity({
          token_a_id: tokenA  as Field,
          token_b_id: tokenB  as Field,
          amount_a:   String(rawA) as U128,
          amount_b:   String(rawB) as U128,
          fee_bps:    feeBps,
          min_lp:     String(minLp) as U128,
          recipient:  address as Address,
        });
        return txId;
      },
    }];
  }, [client, tokenA, tokenB, address, mode, rawA, rawB, lpMint, minLp, feeBps, selectedRecordA, selectedRecordB]);

  const {
    done, busy, isWaiting, error, trackedIds,
    advance, reset,
  } = useConfirmedSequentialTx(steps);

  useEffect(() => {
    if (!done) return;
    setAmountA(''); setAmountB('');
    setRecordAId(''); setRecordBId('');
    reset();
  }, [done]);

  const isDisabled = !!formBlocker || busy || isWaiting;

  const previewRows: ([string, string] | false)[] = [
    rawA > 0n     && [`Deposit ${tokenAMeta?.symbol ?? 'A'}`, formatAmount(rawA, decimalsA)],
    rawB > 0n     && [`Deposit ${tokenBMeta?.symbol ?? 'B'}`, formatAmount(rawB, decimalsB)],
    lpMint > 0n   && ['LP to mint', lpMint.toLocaleString()],
    minLp > 0n    && ['Min LP (slippage)', minLp.toLocaleString()],
  ];

  return (
    <div className="space-y-3">
      <PrivacyModeToggle
        mode={mode}
        onChange={(m) => {
          setMode(m);
          setAmountA(''); setAmountB('');
          setRecordAId(''); setRecordBId('');
        }}
      />

      {/* Fee tier selector — shown for new pool in both modes */}
      {isNewPool && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Fee Tier</Label>
          <Select value={String(feeBps)} onValueChange={(v) => setFeeBps(Number(v))}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEE_TIERS.map((t) => (
                <SelectItem key={t.bps} value={String(t.bps)} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === 'public' ? (
        <>
          <TokenAmountInput
            label={`Amount ${tokenAMeta?.symbol ?? 'A'}`}
            value={amountA}
            onChange={setAmountA}
            decimals={decimalsA}
            symbol={tokenAMeta?.symbol}
            max={balanceA ?? undefined}
            placeholder="0"
          />
          <TokenAmountInput
            label={`Amount ${tokenBMeta?.symbol ?? 'B'}`}
            value={amountB}
            onChange={isNewPool ? setAmountB : () => {}}
            decimals={decimalsB}
            symbol={tokenBMeta?.symbol}
            max={isNewPool ? (balanceB ?? undefined) : undefined}
            placeholder="0"
            hint={!isNewPool && pool ? 'Derived from pool ratio' : undefined}
          />
        </>
      ) : (
        <>
          <TokenRecordSelect
            records={recordsA}
            loading={recordsLoading}
            value={recordAId}
            onChange={setRecordAId}
            decimals={decimalsA}
            symbol={tokenAMeta?.symbol}
            label={`${tokenAMeta?.symbol ?? 'A'} record`}
          />
          <TokenRecordSelect
            records={recordsB}
            loading={recordsLoading}
            value={recordBId}
            onChange={setRecordBId}
            decimals={decimalsB}
            symbol={tokenBMeta?.symbol}
            label={`${tokenBMeta?.symbol ?? 'B'} record`}
          />
          {selectedRecordA && selectedRecordB && pool && (
            <p className="text-[11px] text-muted-foreground">
              Both records consumed in full. Excess returned as dust if ratio doesn't match pool.
            </p>
          )}
        </>
      )}

      <LiquidityPreviewPanel rows={previewRows} />

      {!!formBlocker && <DexFormBlockerNotice message={formBlocker} />}

      <DexSubmitButton
        busy={busy}
        waiting={isWaiting}
        disabled={isDisabled}
        onClick={() => void advance()}
        label={isNewPool ? 'Create Pool & Add Liquidity' : mode === 'private' ? 'Private Add Liquidity' : 'Add Liquidity'}
      />

      <DexErrorBanner error={error} />
      <WizardTxStatus trackedIds={trackedIds} />
    </div>
  );
}
