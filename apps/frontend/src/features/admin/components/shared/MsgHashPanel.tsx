import { CopyField } from '@/components';

interface MsgHashPanelProps {
  msgHash: string;
}

/**
 * Displays the message hash that 3 admins must sign off-chain.
 * The hash is the BHP256(ApproveOpMsg { op_hash, request_id }) field value.
 */
export function MsgHashPanel({ msgHash }: MsgHashPanelProps) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Each of the 3 admins must sign this field value with their Aleo private key,
        then paste the resulting <span className="font-mono">sign1…</span> signature below.
      </p>
      <CopyField label="Message hash to sign" value={msgHash} truncate={false} />
    </div>
  );
}
