import { create } from 'zustand';

type TxStatus = 'idle' | 'signing' | 'pending' | 'confirmed' | 'failed' | 'rejected';

interface TransactionState {
  txId:      string | null;
  status:    TxStatus;
  label:     string | null;
  setTx:     (txId: string, label: string) => void;
  setStatus: (status: TxStatus) => void;
  reset:     () => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  txId:   null,
  status: 'idle',
  label:  null,

  setTx: (txId, label) => set({ txId, label, status: 'pending' }),

  setStatus: (status) => set({ status }),

  reset: () => set({ txId: null, status: 'idle', label: null }),
}));
