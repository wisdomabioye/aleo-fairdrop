import { useState, useMemo }        from 'react';
import { useQueryClient }           from '@tanstack/react-query';
import { Button, Input, Label, Spinner } from '@/components';
import { WizardTxStatus }           from '@/shared/components/WizardTxStatus';
import { formatMicrocredits }       from '@fairdrop/sdk/credits';
import {
  computeConfigOpHash,
  generateNonce,
}                                   from '@fairdrop/sdk/hash';
import {
  CONFIG_OP_KEY,
}                                   from '@fairdrop/sdk/multisig';
import {
  setFeeBps,
  setCreationFee,
  setCloserReward,
  setSlashRewardBps,
  setMaxReferralBps,
  setReferralPoolBps,
  setMinAuctionDuration,
  setPaused,
  type TxSpec,
}                                   from '@fairdrop/sdk/transactions';
import { useProtocolConfig }        from '@/shared/hooks/useProtocolConfig';
import type { ProtocolConfig }      from '@fairdrop/types/domain';
import { SignaturePanel, sigsComplete } from '../shared/SignaturePanel';
import { MsgHashPanel }             from '../shared/MsgHashPanel';
import { useTwoPhaseOp }            from '../shared/useTwoPhaseOp';
import { EMPTY_SIGS, type ThreeSigs } from '../../types';

// ── Param definitions ─────────────────────────────────────────────────────────

interface ParamDef {
  id:          string;
  label:       string;
  unit:        string;
  description: string;
  fnKey:       string;
  placeholder: string;
  /** Convert raw string input → field literal (for op hash) */
  toField:     (raw: string) => string;
  /** Build the execution TxSpec */
  buildSpec:   (raw: string, nonce: bigint) => TxSpec;
  /** Current value display */
  currentDisplay: (pc: ProtocolConfig) => string;
}

const PARAMS: ParamDef[] = [
  {
    id: 'feeBps', label: 'Protocol Fee', unit: 'bps', fnKey: CONFIG_OP_KEY.SET_FEE_BPS,
    description: 'Fee rate on total payments at close_auction. Hard cap 1000 bps (10%).',
    placeholder: '250',
    toField:   (r) => `${Number(r)}field`,
    buildSpec: (r, n) => setFeeBps(Number(r), n),
    currentDisplay: (pc) => `${pc.feeBps} bps`,
  },
  {
    id: 'creationFee', label: 'Creation Fee', unit: 'µcredits', fnKey: CONFIG_OP_KEY.SET_CREATION_FEE,
    description: 'Microcredits charged at create_auction (anti-spam).',
    placeholder: '10000',
    toField:   (r) => `${BigInt(r)}field`,
    buildSpec: (r, n) => setCreationFee(BigInt(r), n),
    currentDisplay: (pc) => formatMicrocredits(BigInt(pc.creationFee)),
  },
  {
    id: 'closerReward', label: 'Closer Reward', unit: 'µcredits', fnKey: CONFIG_OP_KEY.SET_CLOSER_REWARD,
    description: 'Reward paid to the permissionless close_auction caller.',
    placeholder: '10000',
    toField:   (r) => `${BigInt(r)}field`,
    buildSpec: (r, n) => setCloserReward(BigInt(r), n),
    currentDisplay: (pc) => formatMicrocredits(BigInt(pc.closerReward)),
  },
  {
    id: 'slashRewardBps', label: 'Slash Reward', unit: 'bps', fnKey: CONFIG_OP_KEY.SET_SLASH_REWARD_BPS,
    description: "Slasher's share of a forfeited sealed-bid payment. Hard cap 5000 bps.",
    placeholder: '2000',
    toField:   (r) => `${Number(r)}field`,
    buildSpec: (r, n) => setSlashRewardBps(Number(r), n),
    currentDisplay: (pc) => `${pc.slashRewardBps} bps`,
  },
  {
    id: 'maxReferralBps', label: 'Max Referral Commission', unit: 'bps', fnKey: CONFIG_OP_KEY.SET_MAX_REFERRAL_BPS,
    description: 'Maximum commission_bps a single referral code may claim. Hard cap 5000 bps.',
    placeholder: '2000',
    toField:   (r) => `${Number(r)}field`,
    buildSpec: (r, n) => setMaxReferralBps(Number(r), n),
    currentDisplay: (pc) => `${pc.maxReferralBps} bps`,
  },
  {
    id: 'referralPoolBps', label: 'Referral Pool', unit: 'bps', fnKey: CONFIG_OP_KEY.SET_REFERRAL_POOL_BPS,
    description: 'Share of protocol fee allocated as referral budget at close_auction. Hard cap 2000 bps.',
    placeholder: '500',
    toField:   (r) => `${Number(r)}field`,
    buildSpec: (r, n) => setReferralPoolBps(Number(r), n),
    currentDisplay: (pc) => `${pc.referralPoolBps} bps`,
  },
  {
    id: 'minAuctionDuration', label: 'Min Auction Duration', unit: 'blocks', fnKey: CONFIG_OP_KEY.SET_MIN_AUCTION_DURATION,
    description: 'Minimum (end_block − start_block) enforced at create_auction.',
    placeholder: '360',
    toField:   (r) => `${Number(r)}field`,
    buildSpec: (r, n) => setMinAuctionDuration(Number(r), n),
    currentDisplay: (pc) => `${pc.minAuctionDuration} blocks`,
  },
  {
    id: 'paused', label: 'Protocol Paused', unit: 'bool', fnKey: CONFIG_OP_KEY.SET_PAUSED,
    description: 'Pause or unpause all auction interactions.',
    placeholder: 'true / false',
    toField:   (r) => r === 'true' ? '1field' : '0field',
    buildSpec: (r, n) => setPaused(r === 'true', n),
    currentDisplay: (pc) => pc.paused ? 'Paused' : 'Active',
  },
];

// ── Single param row ──────────────────────────────────────────────────────────

interface ParamRowProps {
  def:        ParamDef;
  current:    string;
  onSuccess:  () => void;
}

function ParamRow({ def, current, onSuccess }: ParamRowProps) {
  const [input,     setInput]     = useState('');
  const [sigs,      setSigs]      = useState<ThreeSigs>(EMPTY_SIGS);
  const [opNonce]   = useState<bigint>(() => generateNonce());
  const [requestId] = useState<bigint>(() => generateNonce());
  const [open,      setOpen]      = useState(false);

  const opHash = useMemo(() => {
    if (!input.trim()) return '';
    try { return computeConfigOpHash(def.fnKey, def.toField(input.trim()), opNonce); }
    catch { return ''; }
  }, [def, input, opNonce]);

  const { msgHash, currentStep, busy, isWaiting, done, error, trackedIds, advance, reset } =
    useTwoPhaseOp({
      opHash,
      requestId,
      sigs,
      phase2Label: `Set ${def.label}`,
      buildPhase2: () => def.buildSpec(input.trim(), opNonce),
    });

  const canSubmit = !!opHash && sigsComplete(sigs) && !busy && !isWaiting;

  if (done) {
    onSuccess();
    reset();
    setInput('');
    setSigs(EMPTY_SIGS);
    setOpen(false);
  }

  return (
    <div className="space-y-2 border-b border-border/50 pb-4 last:border-0 last:pb-0">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{def.label}</p>
          <p className="text-[11px] text-muted-foreground">{def.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-xs text-muted-foreground">{current}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : 'Update'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor={def.id} className="text-xs">New value ({def.unit})</Label>
            <Input
              id={def.id}
              className="h-7 text-xs"
              placeholder={def.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>

          {opHash && (
            <>
              <MsgHashPanel msgHash={msgHash} />
              <SignaturePanel value={sigs} onChange={setSigs} />
            </>
          )}

          {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}

          {error && <p className="text-xs text-destructive">{error.message}</p>}

          <Button
            size="sm"
            className="w-full"
            disabled={!canSubmit}
            onClick={() => void advance()}
          >
            {busy || isWaiting
              ? <><Spinner className="mr-1.5 h-3 w-3" />{currentStep === 0 ? 'Submitting approval…' : 'Executing…'}</>
              : currentStep === 0 ? 'Submit Approval' : `Set ${def.label}`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── ConfigPanel ───────────────────────────────────────────────────────────────

export function ConfigPanel() {
  const queryClient              = useQueryClient();
  const { data: pc, isLoading }  = useProtocolConfig();

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>;
  if (!pc)       return <p className="text-sm text-muted-foreground">Could not load protocol config.</p>;

  return (
    <div className="space-y-4">
      {PARAMS.map((def) => (
        <ParamRow
          key={def.id}
          def={def}
          current={def.currentDisplay(pc)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['protocolConfig'] })}
        />
      ))}
    </div>
  );
}
