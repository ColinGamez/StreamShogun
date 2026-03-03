// ── React Error Boundary ──────────────────────────────────────────────
//
// Catches render-time exceptions in child components and displays a
// recoverable fallback UI instead of crashing the entire app.

import { Component, type ReactNode, type ErrorInfo } from "react";

interface ErrorBoundaryProps {
  /** Label shown in the fallback banner (e.g. "Player", "Guide"). */
  label?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.label ? ` – ${this.props.label}` : ""}]`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-inner">
            <span className="error-boundary-icon">⚠️</span>
            <h3 className="error-boundary-title">
              {this.props.label ? `${this.props.label} crashed` : "Something went wrong"}
            </h3>
            <p className="error-boundary-message">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button className="btn-primary error-boundary-retry" onClick={this.handleRetry}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
