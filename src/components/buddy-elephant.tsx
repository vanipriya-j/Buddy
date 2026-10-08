import { cn } from "@/lib/utils";

export function BuddyElephant({
  mood = "wait",
  className,
  size = 180,
}: {
  mood?: "talk" | "wait" | "rest" | "done";
  className?: string;
  size?: number;
}) {
  const eyesClosed = mood === "rest";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={cn(mood === "talk" ? "buddy-talk" : "buddy-float", className)}
      aria-hidden="true"
    >
      <ellipse cx="100" cy="168" rx="48" ry="10" fill="#e7d3bf" />
      <ellipse cx="58" cy="78" rx="28" ry="34" fill="#9ec3dc" />
      <ellipse cx="142" cy="78" rx="28" ry="34" fill="#9ec3dc" />
      <ellipse cx="58" cy="82" rx="16" ry="22" fill="#f6c9d4" />
      <ellipse cx="142" cy="82" rx="16" ry="22" fill="#f6c9d4" />
      <ellipse cx="100" cy="96" rx="52" ry="48" fill="#8fb8d6" />
      <ellipse cx="100" cy="108" rx="34" ry="26" fill="#d7ebf6" />
      <path d="M78 118c8 28 14 42 22 42 6 0 8-8 8-18" fill="none" stroke="#7aa8c8" strokeWidth="10" strokeLinecap="round" />
      {eyesClosed ? (
        <>
          <path d="M78 92c6 6 14 6 20 0" fill="none" stroke="#2c3338" strokeWidth="3" strokeLinecap="round" />
          <path d="M104 92c6 6 14 6 20 0" fill="none" stroke="#2c3338" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="86" cy="94" r="4.5" fill="#2c3338" />
          <circle cx="116" cy="94" r="4.5" fill="#2c3338" />
          <circle cx="87.5" cy="92.5" r="1.4" fill="#fff" />
          <circle cx="117.5" cy="92.5" r="1.4" fill="#fff" />
        </>
      )}
      <path d="M92 112c6 6 14 6 18 0" fill="none" stroke="#2c3338" strokeWidth="3" strokeLinecap="round" />
      {mood === "talk" ? <ellipse cx="101" cy="118" rx="5" ry="3.5" fill="#e7a0a8" /> : null}
      <path d="M70 78c18-8 42-8 60 0" fill="none" stroke="#e7b86a" strokeWidth="8" strokeLinecap="round" />
      <circle cx="128" cy="76" r="4" fill="#f3b7a0" />
      <ellipse cx="74" cy="150" rx="14" ry="8" fill="#7aa8c8" />
      <ellipse cx="126" cy="150" rx="14" ry="8" fill="#7aa8c8" />
    </svg>
  );
}
