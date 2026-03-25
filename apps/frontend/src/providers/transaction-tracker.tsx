import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useWallet } from "@provablehq/aleo-wallet-adaptor-react";
import { TransactionStatus } from "@provablehq/aleo-types";
import { useRefresh } from "./refresh-provider";

export type TrackedTxStatus = "pending" | "confirmed" | "failed";

export interface TrackedTx {
  id: string;
  /** Wallet-internal transaction ID returned by executeTransaction */
  txId: string;
  /** On-chain Aleo transaction ID (at1…) — available as soon as the wallet indexes it */
  aleoId?: string;
  label: string;
  status: TrackedTxStatus;
  timestamp: number;
}

export interface TransactionTrackerContextValue {
  transactions: TrackedTx[];
  track: (txId: string, label: string) => void;
  clearCompleted: () => void;
}

const TransactionTrackerContext = createContext<TransactionTrackerContextValue | undefined>(undefined);

const MAX_POLL_ATTEMPTS = 72; // 72 × 5 s ≈ 6 min before marking failed

function updateTx(
  list: TrackedTx[],
  txId: string,
  patch: Partial<TrackedTx>,
): TrackedTx[] {
  return list.map((tx) => (tx.txId === txId ? { ...tx, ...patch } : tx));
}

export function TransactionTrackerProvider({ children }: { children: ReactNode }) {
  const { transactionStatus } = useWallet();
  const { refreshAll } = useRefresh();

  const [transactions, setTransactions] = useState<TrackedTx[]>([]);

  // Stable refs so the polling interval always sees the latest values
  const txRef = useRef(transactions);
  txRef.current = transactions;
  const statusFnRef = useRef(transactionStatus);
  statusFnRef.current = transactionStatus;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef<Map<string, number>>(new Map());

  const confirmTx = useCallback(
    (txId: string, aleoId?: string) => {
      setTransactions((prev) =>
        updateTx(prev, txId, { status: "confirmed", ...(aleoId ? { aleoId } : {}) }),
      );
      attemptsRef.current.delete(txId);
      refreshAll();
    },
    [refreshAll],
  );

  const failTx = useCallback((txId: string) => {
    setTransactions((prev) => updateTx(prev, txId, { status: "failed" }));
    attemptsRef.current.delete(txId);
  }, []);

  const attachAleoId = useCallback((txId: string, aleoId: string) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.txId === txId && !tx.aleoId ? { ...tx, aleoId } : tx)),
    );
  }, []);

  const pollPending = useCallback(async () => {
    const pending = txRef.current.filter((t) => t.status === "pending");
    if (pending.length === 0) return;

    await Promise.all(
      pending.map(async ({ txId }) => {
        const attempts = (attemptsRef.current.get(txId) ?? 0) + 1;
        attemptsRef.current.set(txId, attempts);

        if (attempts > MAX_POLL_ATTEMPTS) {
          failTx(txId);
          return;
        }

        try {
          const statusFn = statusFnRef.current;
          if (!statusFn) return;
          const result = await statusFn(txId);
          const s = result.status.toLowerCase();

          if (result.transactionId) attachAleoId(txId, result.transactionId);

          if (s === TransactionStatus.ACCEPTED) {
            confirmTx(txId, result.transactionId);
          } else if (s === TransactionStatus.FAILED || s === TransactionStatus.REJECTED) {
            failTx(txId);
          }
        } catch {
          /* network / wallet error — retry next tick */
        }
      }),
    );
  }, [attachAleoId, confirmTx, failTx]);

  // Start / stop polling based on pending transactions
  const hasPending = transactions.some((t) => t.status === "pending");

  useEffect(() => {
    if (!hasPending) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (!intervalRef.current) {
      intervalRef.current = setInterval(pollPending, 5_000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasPending, pollPending]);

  const track = useCallback((txId: string, label: string) => {
    attemptsRef.current.set(txId, 0);
    setTransactions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), txId, label, status: "pending", timestamp: Date.now() },
    ]);
  }, []);

  const clearCompleted = useCallback(() => {
    setTransactions((prev) => prev.filter((t) => t.status === "pending"));
  }, []);

  return (
    <TransactionTrackerContext.Provider value={{ transactions, track, clearCompleted }}>
      {children}
    </TransactionTrackerContext.Provider>
  );
}

export function useTransactionTracker(): TransactionTrackerContextValue {
  const ctx = useContext(TransactionTrackerContext);
  if (!ctx) {
    throw new Error("useTransactionTracker must be used within a TransactionTrackerProvider");
  }
  return ctx;
}

export function useTrackedTransaction(txId: string | null | undefined) {
  const { transactions } = useTransactionTracker();
  return txId ? transactions.find((tx) => tx.txId === txId) : undefined;
}
