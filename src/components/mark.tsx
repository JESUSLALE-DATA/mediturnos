export function Mark({ className = "size-10", light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={light ? "#f4faf6" : "#0d3b24"} />
      <path d="M14 7h4v6h6v4h-6v6h-4v-6H8v-4h6V7z" fill={light ? "#0d3b24" : "#f4faf6"} />
    </svg>
  );
}
