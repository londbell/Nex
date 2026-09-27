import { cn } from "@/components/lib/utils.js";

export function NexAboutLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="118"
      height="100"
      fill="none"
      viewBox="0 0 256 218"
      className={cn("shrink-0 text-current", className)}
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d="M44.8 0L89.6 0L44.8 217.73L0 217.73Z" />
      <path
        fill="currentColor"
        d="M89.6 0L134.4 0L211.2 217.73L166.4 217.73ZM211.2 0L256 0L211.2 217.73L166.4 217.73Z"
      />
    </svg>
  );
}
