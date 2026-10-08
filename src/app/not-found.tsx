import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="font-display text-3xl text-primary">Buddy</p>
      <p>That page is not here.</p>
      <Link href="/" className="text-sm font-semibold underline">Back</Link>
    </main>
  );
}
