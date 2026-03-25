import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface RefreshContextValue {
  recordsRevision: number;
  auctionsRevision: number;
  refreshRecords: () => void;
  refreshAuctions: () => void;
  refreshAll: () => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  recordsRevision: 0,
  auctionsRevision: 0,
  refreshRecords: () => {},
  refreshAuctions: () => {},
  refreshAll: () => {},
});

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [recordsRevision, setRecordsRevision] = useState(0);
  const [auctionsRevision, setAuctionsRevision] = useState(0);

  const refreshRecords  = useCallback(() => setRecordsRevision((r) => r + 1), []);
  const refreshAuctions = useCallback(() => setAuctionsRevision((r) => r + 1), []);
  const refreshAll      = useCallback(() => {
    setRecordsRevision((r) => r + 1);
    setAuctionsRevision((r) => r + 1);
  }, []);

  return (
    <RefreshContext.Provider value={{ recordsRevision, auctionsRevision, refreshRecords, refreshAuctions, refreshAll }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  return useContext(RefreshContext);
}
