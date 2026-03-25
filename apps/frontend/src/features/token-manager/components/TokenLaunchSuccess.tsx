import { Card, CardContent, CopyField } from '@/components';
import { CheckCircle2 } from 'lucide-react';

interface TokenLaunchSuccessProps {
  tokenId: string;
}

export function TokenLaunchSuccess({ tokenId }: TokenLaunchSuccessProps) {
  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5">
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle2 className="size-12 text-emerald-500" />
        <div>
          <p className="text-lg font-semibold">Token Launched!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your token is registered and minted. Use the Token ID when creating an auction.
          </p>
        </div>
        <CopyField label="Token ID" value={tokenId} />
      </CardContent>
    </Card>
  );
}
