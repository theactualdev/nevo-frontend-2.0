/**
 * SCRUM-39's per-card failure, in its own words: "We couldn't pull this in
 * just now. We're on it." plus Try again - and the rest of the dashboard
 * still renders. The compliance card had it; the cards beside it simply
 * vanished when their reads failed (backlog 33), which is the one thing a
 * card that can't load must not do. Never for a 403: a read this admin's
 * scopes don't cover is not a fault, and asking again can't change it.
 */
export function CardUnread({
  onRetry,
  className,
}: {
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="m-0 max-w-[52ch] text-sm leading-[1.6] text-nevo-violet-text">
        We couldn&rsquo;t pull this in just now. We&rsquo;re on it.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
      >
        Try again
      </button>
    </div>
  );
}
