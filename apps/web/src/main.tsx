import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryProvider, WalletProvider } from '@/providers';
import { ThemeProvider } from '@fairdrop/ui';
import { App } from '@/app';
import '@fairdrop/ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="fairdrop-theme">
      <QueryProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
);
