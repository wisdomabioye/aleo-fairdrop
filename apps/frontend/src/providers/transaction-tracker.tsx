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

export type TrackedTxStatus = "signing" | "pending" | "confirmed" | "failed" | "rejected";

export interface TrackedTx {
  /** Internal UUID — stable across the full lifecycle */
  id: string;
  /** Wallet-internal transaction ID returned by executeTransaction (absent during signing) */
  txId?: string;
  /** On-chain Aleo transaction ID (at1…) — arrives once the wallet indexes it */
  aleoId?: string;
  label: string;
  status: TrackedTxStatus;
  timestamp: number;
}

export interface TransactionTrackerContextValue {
  transactions: TrackedTx[];
  /**
   * Call before executeTransaction to show "waiting for wallet" state.
   * Returns the internal id — pass it to confirmSigning or failEntry.
   */
  startSigning: (label: string) => string;
  /**
   * Call after executeTransaction resolves. Transitions signing → pending
   * and begins polling for on-chain confirmation.
   */
  confirmSigning: (id: string, txId: string) => void;
  /**
   * Convenience: adds a transaction directly as pending (skips signing phase).
   */
  track: (txId: string, label: string) => void;
  /**
   * Mark an entry as failed by its internal id.
   * Use when executeTransaction throws while the entry is still in signing state.
   */
  failEntry: (id: string) => void;
  /** Remove a single entry by its internal id (any status). */
  removeEntry: (id: string) => void;
  /** Remove all terminal (confirmed/failed/rejected) entries. */
  clearCompleted: () => void;
  /** Remove every entry regardless of status. */
  clearAll: () => void;
}

const TransactionTrackerContext = createContext<TransactionTrackerContextValue | undefined>(
  undefined,
);

const MAX_POLL_ATTEMPTS = 72; // 72 × 5 s ≈ 6 min before marking failed

function patchById(
  list: TrackedTx[],
  id: string,
  patch: Partial<TrackedTx>,
): TrackedTx[] {
  return list.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx));
}

function patchByTxId(
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

  // ── Lifecycle mutations ───────────────────────────────────────────────────

  const startSigning = useCallback((label: string): string => {
    const id = crypto.randomUUID();
    setTransactions((prev) => [
      ...prev,
      { id, label, status: "signing", timestamp: Date.now() },
    ]);
    return id;
  }, []);

  const confirmSigning = useCallback((id: string, txId: string) => {
    attemptsRef.current.set(txId, 0);
    setTransactions((prev) =>
      patchById(prev, id, { txId, status: "pending" }),
    );
  }, []);

  const track = useCallback((txId: string, label: string) => {
    const id = crypto.randomUUID();
    attemptsRef.current.set(txId, 0);
    setTransactions((prev) => [
      ...prev,
      { id, txId, label, status: "pending", timestamp: Date.now() },
    ]);
  }, []);

  const failEntry = useCallback((id: string) => {
    setTransactions((prev) => patchById(prev, id, { status: "failed" }));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTransactions((prev) =>
      prev.filter((t) => t.status === "signing" || t.status === "pending"),
    );
  }, []);

  const clearAll = useCallback(() => {
    setTransactions([]);
    attemptsRef.current.clear();
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  const confirmTx = useCallback(
    (txId: string, aleoId?: string) => {
      setTransactions((prev) =>
        patchByTxId(prev, txId, {
          status: "confirmed",
          ...(aleoId ? { aleoId } : {}),
        }),
      );
      attemptsRef.current.delete(txId);
      refreshAll();
    },
    [refreshAll],
  );

  const failTx = useCallback((txId: string) => {
    setTransactions((prev) => patchByTxId(prev, txId, { status: "failed" }));
    attemptsRef.current.delete(txId);
  }, []);

  const attachAleoId = useCallback((txId: string, aleoId: string) => {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.txId === txId && !tx.aleoId ? { ...tx, aleoId } : tx,
      ),
    );
  }, []);

  const pollPending = useCallback(async () => {
    const pending = txRef.current.filter(
      (t) => t.status === "pending" && t.txId,
    );
    if (pending.length === 0) return;

    await Promise.all(
      pending.map(async ({ txId }) => {
        if (!txId) return;

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
          } else if (
            s === TransactionStatus.FAILED ||
            s === TransactionStatus.REJECTED
          ) {
            failTx(txId);
          }
        } catch {
          /* network / wallet error — retry next tick */
        }
      }),
    );
  }, [attachAleoId, confirmTx, failTx]);

  const hasPending = transactions.some((t) => t.status === "pending" && t.txId);

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

  return (
    <TransactionTrackerContext.Provider
      value={{ transactions, startSigning, confirmSigning, track, failEntry, removeEntry, clearCompleted, clearAll }}
    >
      {children}
    </TransactionTrackerContext.Provider>
  );
}

export function useTransactionTracker(): TransactionTrackerContextValue {
  const ctx = useContext(TransactionTrackerContext);
  if (!ctx) {
    throw new Error(
      "useTransactionTracker must be used within a TransactionTrackerProvider",
    );
  }
  return ctx;
}

/** Convenience: subscribe to a single transaction by its internal id. */
export function useTrackedTx(id: string | null | undefined): TrackedTx | undefined {
  const { transactions } = useTransactionTracker();
  return id ? transactions.find((tx) => tx.id === id) : undefined;
}

/** Convenience: subscribe to a single transaction by its wallet txId. */
export function useTrackedTransaction(
  txId: string | null | undefined,
): TrackedTx | undefined {
  const { transactions } = useTransactionTracker();
  return txId ? transactions.find((tx) => tx.txId === txId) : undefined;
}
