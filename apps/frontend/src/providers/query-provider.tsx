import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initAleoClient } from '@fairdrop/sdk/client';
import { config } from '../env';

// Initialize the Aleo RPC singleton before any queries run
initAleoClient(config.rpcUrl);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:              1,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export { queryClient };
