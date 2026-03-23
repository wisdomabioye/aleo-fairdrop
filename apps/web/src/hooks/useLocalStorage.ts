import { useState, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [stored, setStored] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored((prev) => {
        const next =
          typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch { /* quota — ignore */ }
        return next;
      });
    },
    [key],
  );

  const remove = useCallback(() => {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    setStored(initialValue);
  }, [key, initialValue]);

  return [stored, setValue, remove] as const;
}
