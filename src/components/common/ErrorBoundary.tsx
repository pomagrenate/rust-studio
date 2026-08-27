import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled UI exception:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: 24,
            margin: 20,
            background: "#2d1b1e",
            color: "#f87171",
            borderRadius: 8,
            border: "1px solid #7f1d1d",
            fontFamily: "monospace",
            fontSize: 13,
            lineHeight: "1.6",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", color: "#ef4444" }}>⚠️ Component Error Caught</h3>
          <p style={{ margin: "0 0 12px 0", color: "#fca5a5" }}>
            {this.state.error?.message || "An unexpected UI error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "6px 12px",
              background: "#b91c1c",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Try Recovery
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
