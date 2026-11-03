export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#26221e" />
        <path d="M9 20.5h14M9 15.5h10M9 10.5h6" stroke="#e0895a" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      Storiva
    </span>
  );
}
