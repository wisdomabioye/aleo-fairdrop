import { useMemo } from 'react';
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { PuzzleWalletAdapter } from '@provablehq/aleo-wallet-adaptor-puzzle';
import { LeoWalletAdapter }    from '@provablehq/aleo-wallet-adaptor-leo';
import { FoxWalletAdapter }    from '@provablehq/aleo-wallet-adaptor-fox';
import { SoterWalletAdapter }  from '@provablehq/aleo-wallet-adaptor-soter';
import { DecryptPermission }   from '@provablehq/aleo-wallet-adaptor-core';
import { WALLET_NETWORK } from '../env';
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [
      new ShieldWalletAdapter(),
      new PuzzleWalletAdapter(),
      new LeoWalletAdapter(),
      new FoxWalletAdapter(),
      new SoterWalletAdapter(),
    ],
    [],
  );

  return (
    <AleoWalletProvider
      wallets={wallets}
      network={WALLET_NETWORK}
      decryptPermission={DecryptPermission.AutoDecrypt}
      autoConnect
      onError={(e) => console.error('[wallet]', e)}
    >
      <WalletModalProvider network={WALLET_NETWORK}>
        {children}
      </WalletModalProvider>
    </AleoWalletProvider>
  );
}
