import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";

import { 
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle, 
} from "@/components";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[50vh] items-center justify-center p-4 sm:p-6">
            <Empty className="max-w-lg border-rose-500/12 bg-gradient-surface p-8 shadow-brand">
              <EmptyHeader className="max-w-md">
                <EmptyMedia
                  variant="icon"
                  className="border-rose-500/14 bg-rose-500/10 text-rose-500 dark:text-rose-400"
                >
                  <TriangleAlert className="size-5" />
                </EmptyMedia>
                <EmptyTitle>Something went wrong</EmptyTitle>
                <EmptyDescription>
                  {this.state.error?.message ?? "An unexpected error occurred."}
                </EmptyDescription>
              </EmptyHeader>

              <EmptyContent className="max-w-md gap-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={this.reset} className="min-w-28">
                    <RefreshCcw className="size-4" />
                    Try again
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="min-w-28"
                  >
                    Reload page
                  </Button>
                </div>

                {this.state.error?.stack ? (
                  <div className="w-full rounded-lg border border-sky-500/10 bg-background/50 p-3 text-left">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Error details
                    </p>
                    <pre className="max-h-32 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      {this.state.error.message}
                    </pre>
                  </div>
                ) : null}
              </EmptyContent>
            </Empty>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
