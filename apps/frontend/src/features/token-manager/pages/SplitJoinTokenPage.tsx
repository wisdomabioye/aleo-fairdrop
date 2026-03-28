import { Scissors, Link2 } from 'lucide-react';
import { useWallet }        from '@provablehq/aleo-wallet-adaptor-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
  PageHeader,
} from '@/components';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { SplitTokenForm } from '../components/SplitTokenForm';
import { JoinTokenForm }  from '../components/JoinTokenForm';

export function SplitJoinTokenPage() {
  const { connected } = useWallet();

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-6">
        <PageHeader
          title="Split & Join"
          description="Reshape private token records — split one record into two, or merge two into one."
        />
        <ConnectWalletPrompt message="Connect your wallet to manage token records." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <PageHeader
        title="Split & Join"
        description="Reshape private token records — split one record into two, or merge two into one."
      />

      <Tabs defaultValue="split">
        <TabsList className="w-full">
          <TabsTrigger value="split" className="flex-1">
            <Scissors className="mr-1.5 size-4" />
            Split
          </TabsTrigger>
          <TabsTrigger value="join" className="flex-1">
            <Link2 className="mr-1.5 size-4" />
            Join
          </TabsTrigger>
        </TabsList>

        <TabsContent value="split">
          <Card>
            <CardHeader>
              <CardTitle>Split Record</CardTitle>
              <CardDescription>
                Divide one token record into two. Useful when you need an exact amount for a bid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SplitTokenForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="join">
          <Card>
            <CardHeader>
              <CardTitle>Join Records</CardTitle>
              <CardDescription>
                Merge two token records of the same token into a single combined record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JoinTokenForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
