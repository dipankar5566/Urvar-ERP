"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <button
            onClick={() => reset()}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
