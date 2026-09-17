export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <svg
        className="h-8 w-8 animate-spin text-accent"
        viewBox="0 0 24 24"
        fill="none"
        aria-label="Loading"
        role="status"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
