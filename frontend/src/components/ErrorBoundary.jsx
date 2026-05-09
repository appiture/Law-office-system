import { Component } from "react";

/**
 * Global error boundary — catches unhandled React rendering errors
 * and displays a user-friendly recovery screen instead of a blank page.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console in development; in production this would go to
    // an external error tracking service (e.g. Sentry).
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/dashboard";
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.message}>
            An unexpected error occurred. This has been logged and our team
            will investigate. You can try reloading the page or returning to
            the dashboard.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={styles.detail}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
          <div style={styles.actions}>
            <button type="button" style={styles.primaryBtn} onClick={this.handleReload}>
              Reload Page
            </button>
            <button type="button" style={styles.secondaryBtn} onClick={this.handleGoHome}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "var(--color-bg)",
    padding: 24,
  },
  card: {
    background: "var(--color-card)",
    borderRadius: 16,
    padding: "48px 40px",
    maxWidth: 520,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 25px 50px -12px rgba(0,0,0,.5)",
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    color: "var(--color-text)",
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 12,
  },
  message: {
    color: "var(--color-text-secondary)",
    fontSize: 15,
    lineHeight: 1.6,
    marginBottom: 24,
  },
  detail: {
    background: "var(--color-bg)",
    color: "var(--color-error)",
    padding: "12px 16px",
    borderRadius: 8,
    fontSize: 13,
    textAlign: "left",
    overflow: "auto",
    maxHeight: 120,
    marginBottom: 24,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  actions: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  primaryBtn: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "var(--color-card)",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    background: "transparent",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};

export default ErrorBoundary;




