import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  QueryProvider,
  WalletProvider,
  ThemeProvider,
  TransactionTrackerProvider,
  RefreshProvider
} from './providers';
import { TooltipProvider } from './components/ui/tooltip';
import './index.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="fairdrop-theme">
      <QueryProvider>
        <TooltipProvider>
          <WalletProvider>
            <RefreshProvider>
              <TransactionTrackerProvider>
                <App />
              </TransactionTrackerProvider>
            </RefreshProvider>
          </WalletProvider>
        </TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
)
