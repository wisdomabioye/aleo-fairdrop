import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { 
  QueryProvider, 
  WalletProvider, 
  ThemeProvider,
  TransactionTrackerProvider,
  RefreshProvider
} from './providers';
import './index.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="fairdrop-theme">
      <QueryProvider>
        <WalletProvider>
          <RefreshProvider>
            <TransactionTrackerProvider>
              <App />
            </TransactionTrackerProvider>
          </RefreshProvider>
        </WalletProvider>
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
)
