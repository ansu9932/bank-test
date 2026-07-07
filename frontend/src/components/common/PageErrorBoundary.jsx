import React from 'react';

/**
 * Route-level error boundary — the permanent fix for "blank page" bugs.
 *
 * Any uncaught render error in a dashboard page (bad date, undefined field,
 * etc.) used to blank the entire screen because React unmounts the tree.
 * This boundary catches the crash and shows a recoverable error card instead.
 *
 * The `resetKey` prop (the current pathname) auto-clears the error state on
 * navigation, so clicking another sidebar item always works after a crash.
 */
export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      // Navigated to a different page — give the new page a clean start.
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    // Log for diagnostics — never let it escape and blank the app.
    console.error('[page-error-boundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <div className="glass-card p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/15 flex items-center justify-center">
              <span className="text-brand-400 text-2xl font-bold" aria-hidden="true">!</span>
            </div>
            <h2 className="page-title text-xl">Something went wrong</h2>
            <p className="text-dark-300 text-sm leading-relaxed text-pretty">
              This page hit an unexpected error. Your account and data are safe —
              try reloading, or go back to your dashboard.
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-secondary flex-1"
              >
                Reload page
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/dashboard'; }}
                className="btn-primary flex-1"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
