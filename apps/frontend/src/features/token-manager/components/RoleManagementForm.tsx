import { useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner } from '@/components';
import { ShieldCheck } from 'lucide-react';
import { setRole, removeRole } from '@fairdrop/sdk/token-registry';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { parseExecutionError } from '@/shared/utils/errors';

const ROLE_OPTIONS = [
  { value: 1, label: 'MINTER_ROLE (1)' },
  { value: 2, label: 'BURNER_ROLE (2)' },
  { value: 3, label: 'SUPPLY_MANAGER_ROLE (3)' },
];

export function RoleManagementForm() {
  const { executeTransaction } = useWallet();

  const [tokenId, setTokenId] = useState('');
  const [account, setAccount] = useState('');
  const [role,    setRoleValue] = useState(1);
  const [action,  setAction]  = useState<'set' | 'remove'>('set');

  const tokenOk = tokenId.trim().endsWith('field');
  const addrOk  = account.trim().startsWith('aleo1') && account.trim().length > 10;
  const valid   = tokenOk && addrOk;

  // Single-step flow — stepsRef in hook ensures latest action/role/tokenId/account is used
  const steps = [{
    label: action === 'set' ? 'Set Role' : 'Remove Role',
    execute: async () => {
      const spec   = action === 'set'
        ? setRole(tokenId.trim(), account.trim(), role)
        : removeRole(tokenId.trim(), account.trim());
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }];

  const { done, busy, isWaiting, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  const blocked = busy || isWaiting;

  function handleReset() {
    reset();
    setTokenId('');
    setAccount('');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          Only the address set as <strong className="text-foreground">admin</strong> on the token can assign or revoke roles.
        </p>
      </div>

      {done ? (
        <div className="space-y-4">
          <WizardTxStatus trackedIds={trackedIds} />
          <Button variant="outline" className="w-full" onClick={handleReset}>
            New role action
          </Button>
        </div>
      ) : (
        <>
          {/* Set / Remove toggle */}
          <div className="flex gap-2">
            {(['set', 'remove'] as const).map((a) => (
              <Button
                key={a}
                variant={action === a ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setAction(a)}
                disabled={blocked}
              >
                {a === 'set' ? 'Assign Role' : 'Revoke Role'}
              </Button>
            ))}
          </div>

          {/* Token ID */}
          <div className="space-y-1.5">
            <Label>Token ID</Label>
            <Input
              className="font-mono text-xs"
              placeholder="123...field"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              disabled={blocked}
            />
            {tokenId && !tokenOk && <p className="text-xs text-destructive">Must end with 'field'</p>}
          </div>

          {/* Account */}
          <div className="space-y-1.5">
            <Label>Account address</Label>
            <Input
              className="font-mono text-xs"
              placeholder="aleo1..."
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              disabled={blocked}
            />
            {account && !addrOk && <p className="text-xs text-destructive">Invalid Aleo address</p>}
          </div>

          {/* Role picker (only for assign) */}
          {action === 'set' && (
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors
                      ${role === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'}`}
                    onClick={() => setRoleValue(opt.value)}
                    disabled={blocked}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{parseExecutionError(error)}</p>}

          <WizardTxStatus trackedIds={trackedIds} />

          <Button className="w-full" onClick={advance} disabled={!valid || blocked}>
            {busy      ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
            : isWaiting ? <><Spinner className="mr-2 size-4" /> Awaiting confirmation…</>
            : action === 'set' ? 'Assign Role' : 'Revoke Role'}
          </Button>
        </>
      )}
    </div>
  );
}
