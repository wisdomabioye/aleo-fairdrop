import {
  setGateAllowedCaller,
  setRefAllowedCaller,
  setProofAllowedCaller,
  setVestAllowedCaller,
} from '@fairdrop/sdk/transactions';
import { config } from '@/env';
import type { UtilityKey } from '../../hooks/useCallerStatus';

export const UTILITIES: { key: UtilityKey; label: string; programId: string }[] = [
  { key: 'gate',  label: 'Gate',  programId: config.programs.gate.programId  },
  { key: 'ref',   label: 'Ref',   programId: config.programs.ref.programId   },
  { key: 'proof', label: 'Proof', programId: config.programs.proof.programId },
  { key: 'vest',  label: 'Vest',  programId: config.programs.vest.programId  },
];

export const SET_CALLER_BUILDERS: Record<
  UtilityKey,
  (addr: string, allowed: boolean, nonce: bigint) => ReturnType<typeof setGateAllowedCaller>
> = {
  gate:  (addr, allowed, nonce) => setGateAllowedCaller(addr, allowed, nonce),
  ref:   (addr, allowed, nonce) => setRefAllowedCaller(addr, allowed, nonce),
  proof: (addr, allowed, nonce) => setProofAllowedCaller(addr, allowed, nonce),
  vest:  (addr, allowed, nonce) => setVestAllowedCaller(addr, allowed, nonce),
};
