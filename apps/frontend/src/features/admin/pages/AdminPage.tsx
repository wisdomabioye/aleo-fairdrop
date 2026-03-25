import { useEffect }             from 'react';
import { useNavigate }            from 'react-router-dom';
import { useWallet }              from '@provablehq/aleo-wallet-adaptor-react';
import { Spinner, Card, CardContent, CardHeader, CardTitle,
         Tabs, TabsList, TabsTrigger, TabsContent }          from '@/components';
import { ConnectWalletPrompt }    from '@/shared/components/wallet/ConnectWalletPrompt';
import { AppRoutes }              from '@/config';
import { useProtocolConfig }      from '@/shared/hooks/useProtocolConfig';
import { ConfigParamRow }         from '../components/ConfigParamRow';
import { PauseToggle }            from '../components/PauseToggle';
import { AdminTransfer }          from '../components/AdminTransfer';
import { CallerMatrix }           from '../components/CallerMatrix';
import type { ConfigParamRowProps } from '../components/ConfigParamRow';
import type { ProtocolConfig }    from '@fairdrop/types/domain';

export function AdminPage() {
  const { connected, address }  = useWallet();
  const navigate                = useNavigate();
  const { data: pc, isLoading } = useProtocolConfig();

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

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{address}</p>
      </div>

      <Tabs defaultValue="parameters">
        <TabsList>
          <TabsTrigger value="parameters">Parameters</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        {/* ── Parameters tab ──────────────────────────────────────────────── */}
        <TabsContent value="parameters" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Protocol Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              {buildParams(pc).map((p) => (
                <ConfigParamRow key={p.transition} {...p} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Contracts tab ───────────────────────────────────────────────── */}
        <TabsContent value="contracts" className="mt-4">
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
        </TabsContent>

        {/* ── Danger Zone tab ─────────────────────────────────────────────── */}
        <TabsContent value="danger" className="mt-4 space-y-4">
          <Card className={pc.paused ? 'border-destructive' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-destructive">Emergency Pause</CardTitle>
            </CardHeader>
            <CardContent>
              <PauseToggle paused={pc.paused} />
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-destructive">Transfer Protocol Admin</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminTransfer />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Param definitions ──────────────────────────────────────────────────────

function buildParams(pc: ProtocolConfig): ConfigParamRowProps[] {
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
    },
  ];
}
