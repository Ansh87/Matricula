// ErrorBoundary.jsx - catches render errors in any panel and shows the actual
// message instead of a silent blank screen. This turns "the page is blank" into
// a visible, debuggable error.
import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stack: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Panel crashed:", error, info);
    this.setState({ stack: info?.componentStack || null });
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, stack: null });
    }
  }
  render() {
    if (this.state.error) {
      // Pull the first meaningful component name from the stack for a hint.
      const firstComp = (this.state.stack || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
      return (
        <div className="disclaimer" style={{ borderLeftColor: "var(--reach)", background: "#f7ece8" }}>
          <strong>This section hit an error and couldn't display.</strong>
          <div className="note" style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 12 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          {firstComp && (
            <div className="note" style={{ marginTop: 4, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              in {firstComp}
            </div>
          )}
          <div className="note" style={{ marginTop: 6 }}>Try another tab, or reload the page. If it persists, this message tells us what to fix.</div>
        </div>
      );
    }
    return this.props.children;
  }
}
