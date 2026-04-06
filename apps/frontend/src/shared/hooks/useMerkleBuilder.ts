import { useRef, useState, useCallback } from 'react';
import type { MerkleWorkerResponse } from '@/workers/merkle-builder.worker';

export function useMerkleBuilder() {
  const workerRef             = useRef<Worker | null>(null);
  const [building, setBuilding] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const build = useCallback((
    addresses: string[],
    onDone: (result: MerkleWorkerResponse) => void,
  ) => {
    workerRef.current?.terminate();
    setError(null);
    setBuilding(true);

    const worker = new Worker(
      new URL('../../workers/merkle-builder.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (
      e: MessageEvent<{ ok: boolean; data?: MerkleWorkerResponse; error?: string }>,
    ) => {
      setBuilding(false);
      if (e.data.ok && e.data.data) {
        onDone(e.data.data);
      } else {
        setError(e.data.error ?? 'Unknown error');
      }
      worker.terminate();
    };

    worker.onerror = (e) => {
      setBuilding(false);
      setError(e.message);
      worker.terminate();
    };

    worker.postMessage({ addresses });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { build, building, error, clearError };
}
