export default function ErrorBanner({ message, onRetry, retryLabel = "Retry" }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-light px-3 py-2.5 text-[14.5px] text-danger"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        className="mt-0.5 shrink-0"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 8v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-medium underline decoration-danger/40 underline-offset-2 hover:decoration-danger"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
