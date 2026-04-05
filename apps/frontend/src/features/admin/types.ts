export interface SigEntry {
  sig:   string;
  admin: string;
}

/** Exactly 3 signature + admin pairs required by every multisig transition. */
export type ThreeSigs = [SigEntry, SigEntry, SigEntry];

export const EMPTY_SIGS: ThreeSigs = [
  { sig: '', admin: '' },
  { sig: '', admin: '' },
  { sig: '', admin: '' },
];
