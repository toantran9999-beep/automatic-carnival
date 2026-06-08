interface TodaMarkProps {
  size?: number;
  className?: string;
}

/**
 * TODA emblem — cây cách điệu trong vòng tròn (tái dựng tối giản theo design handoff).
 * Dùng currentColor để ăn theo màu accent/text của context.
 */
export function TodaMark({ size = 40, className }: TodaMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.6" />
      <path d="M24 35 L24 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="16.5" r="6.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="21" r="4.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="31" cy="21" r="4.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M18.5 35 h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
