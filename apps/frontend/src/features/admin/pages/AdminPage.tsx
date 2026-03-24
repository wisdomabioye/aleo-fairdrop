import { useState, useEffect }   from 'react';
import { useNavigate }            from 'react-router-dom';
import { useWallet }              from '@provablehq/aleo-wallet-adaptor-react';
import { Spinner, Card, CardContent, CardHeader, CardTitle } from '@/components';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { config }                 from '@/env';
import { AppRoutes }                 from '@/config';
import { parseExecutionError }    from '@/shared/utils/errors';
import { useTransactionStore }    from '@/stores/transaction.store';
import { useProtocolConfig }      from '../../auctions/hooks/useProtocolConfig';
import { ConfigParamRow }         from '../components/ConfigParamRow';
import { PauseToggle }            from '../components/PauseToggle';
import { AdminTransfer }          from '../components/AdminTransfer';
import { CallerMatrix }           from '../components/CallerMatrix';
import type { ConfigParamRowProps } from '../components/ConfigParamRow';
import type { ProtocolConfig } from '@fairdrop/types/domain';

const CFG_PROGRAM = config.programs.config.programId;

export function AdminPage() {
  const { connected, address, executeTransaction } = useWallet();
  const navigate                 = useNavigate();
  const { setTx }                = useTransactionStore();
  const { data: pc, isLoading }  = useProtocolConfig();

  const [paramBusy,   setParamBusy]   = useState<string | null>(null);
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({});

  const isAdmin = connected && pc && address === pc.protocolAdmin;

  useEffect(() => {
    if (!isLoading && pc && connected && address && address !== pc.protocolAdmin) {
      navigate(AppRoutes.dashboard, { replace: true });
    }
  }, [pc, connected, address, isLoading, navigate]);

  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <ConnectWalletPrompt message="Connect your wallet to access the admin panel." />
      </div>
    );
  }

  // Protocol config still loading — brief spinner while we check admin status
  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>;
  }

  // Config loaded but not admin — useEffect will redirect; show nothing while it fires
  if (!isAdmin) {
    return null;
  }

  async function runParam(fn: string, value: string, type: 'u16' | 'u32' | 'u128') {
    setParamErrors((e) => ({ ...e, [fn]: '' }));
    setParamBusy(fn);
    try {
      const result = await executeTransaction({
        program:  CFG_PROGRAM,
        function: fn,
        inputs:   [`${value}${type}`],
        fee:      0.05,
      });
      if (result?.transactionId) setTx(result.transactionId, fn);
    } catch (err) {
      setParamErrors((e) => ({ ...e, [fn]: parseExecutionError(err) }));
    } finally {
      setParamBusy(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{address}</p>
      </div>

      {/* ── Protocol parameters ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Protocol Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          {PARAMS(pc, paramBusy, paramErrors, runParam).map((p) => (
            <ConfigParamRow key={p.transition} {...p} />
          ))}
        </CardContent>
      </Card>

      {/* ── Emergency pause ───────────────────────────────────────────────── */}
      <Card className={pc.paused ? 'border-destructive' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-destructive">Emergency Pause</CardTitle>
        </CardHeader>
        <CardContent>
          <PauseToggle paused={pc.paused} />
        </CardContent>
      </Card>

      {/* ── Allowed callers ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Auction Contract Authorization</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Each auction contract must be authorized on all 4 utility contracts
            before it can call <code className="font-mono">register_gate</code>,{' '}
            <code className="font-mono">record_referral</code>,{' '}
            <code className="font-mono">create_vest</code>, and{' '}
            <code className="font-mono">issue_receipt</code> via CPI.
          </p>
          <CallerMatrix />
        </CardContent>
      </Card>

      {/* ── Admin transfer ─────────────────────────────────────────────────── */}
      <Card className="border-destructive">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-destructive">Transfer Protocol Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTransfer />
        </CardContent>
      </Card>
    </div>
  );
}

function PARAMS(
  pc:          ProtocolConfig,
  busy:        string | null,
  errors:      Record<string, string>,
  onSave:      (fn: string, v: string, t: 'u16' | 'u32' | 'u128') => Promise<void>,
): ConfigParamRowProps[] {
  return [
    {
      label:       'Protocol Fee',
      description: 'Fee rate on total payments at close_auction.',
      currentRaw:  String(pc.feeBps),
      hardCap:     '1000 bps (10%)',
      unit:        'bps',
      transition:  'set_fee_bps',
      inputType:   'u16',
      maxValue:    1000,
      busy:        busy === 'set_fee_bps',
      onSave,
      error:       errors['set_fee_bps'],
    },
    {
      label:       'Creation Fee',
      description: 'Microcredits deducted from creator at create_auction (anti-spam).',
      currentRaw:  pc.creationFee,
      hardCap:     '1,000,000,000 µcredits (1000 ALEO)',
      unit:        'microcredits',
      transition:  'set_creation_fee',
      inputType:   'u128',
      maxValue:    1_000_000_000n,
      busy:        busy === 'set_creation_fee',
      onSave,
      error:       errors['set_creation_fee'],
    },
    {
      label:       'Closer Reward',
      description: 'Microcredits rewarded to the permissionless close_auction caller.',
      currentRaw:  pc.closerReward,
      hardCap:     '1,000,000,000 µcredits (1000 ALEO)',
      unit:        'microcredits',
      transition:  'set_closer_reward',
      inputType:   'u128',
      maxValue:    1_000_000_000n,
      busy:        busy === 'set_closer_reward',
      onSave,
      error:       errors['set_closer_reward'],
    },
    {
      label:       'Slash Reward',
      description: "Slasher's share of a forfeited sealed-bid payment.",
      currentRaw:  String(pc.slashRewardBps),
      hardCap:     '5000 bps (50%)',
      unit:        'bps',
      transition:  'set_slash_reward_bps',
      inputType:   'u16',
      maxValue:    5000,
      busy:        busy === 'set_slash_reward_bps',
      onSave,
      error:       errors['set_slash_reward_bps'],
    },
    {
      label:       'Max Referral Commission',
      description: 'Maximum commission_bps a single referral code may claim from the pool.',
      currentRaw:  String(pc.maxReferralBps),
      hardCap:     '5000 bps (50% of pool)',
      unit:        'bps',
      transition:  'set_max_referral_bps',
      inputType:   'u16',
      maxValue:    5000,
      busy:        busy === 'set_max_referral_bps',
      onSave,
      error:       errors['set_max_referral_bps'],
    },
    {
      label:       'Referral Pool',
      description: 'Share of protocol fee allocated as the referral budget at close_auction.',
      currentRaw:  String(pc.referralPoolBps),
      hardCap:     '2000 bps (20%)',
      unit:        'bps',
      transition:  'set_referral_pool_bps',
      inputType:   'u16',
      maxValue:    2000,
      busy:        busy === 'set_referral_pool_bps',
      onSave,
      error:       errors['set_referral_pool_bps'],
    },
    {
      label:       'Min Auction Duration',
      description: 'Minimum (end_block − start_block) at create_auction. Set to 0 to disable.',
      currentRaw:  String(pc.minAuctionDuration),
      hardCap:     'none',
      unit:        'blocks',
      transition:  'set_min_auction_duration',
      inputType:   'u32',
      maxValue:    4_294_967_295,
      busy:        busy === 'set_min_auction_duration',
      onSave,
      error:       errors['set_min_auction_duration'],
    },
  ];
}
