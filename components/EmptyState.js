export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
      {icon ? <div className="mb-1 text-ink-faint">{icon}</div> : null}
      <h3 className="font-display text-[16px] font-semibold text-ink">
        {title}
      </h3>
      {description ? (
        <p className="max-w-sm text-[14.5px] text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
