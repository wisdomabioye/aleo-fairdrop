import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryProvider, WalletProvider, ThemeProvider } from './providers';
import './index.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="fairdrop-theme">
      <QueryProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
)
