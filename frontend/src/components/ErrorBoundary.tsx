import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render-time errors so a single bad component (e.g. a malformed mesh
 * in the 3D viewport) shows a recoverable message instead of freezing the whole
 * page on a blank screen.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Surface the crash in the console so it can be diagnosed instead of silently
    // freezing the UI.
    console.error(`[Cadio${this.props.label ? `:${this.props.label}` : ""}] render error:`, error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="grid h-full min-h-[200px] w-full place-items-center bg-[#050505] p-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(255,159,10,0.12)" }}>
            <svg className="h-6 w-6 text-[#ff9f0a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-white">Something went wrong</p>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            The view hit an unexpected error. Your work is saved — reloading usually fixes it.
          </p>
          {this.state.message && (
            <p className="mt-2 break-words text-[11px] text-white/30">{this.state.message}</p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-[#00F0FF] px-6 py-2.5 text-sm font-semibold text-[#050505] transition-colors hover:bg-[#00F0FF]/90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
