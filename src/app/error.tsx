"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-600">The error was logged. You can try again.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-teal-700 px-4 py-2 text-white">Try again</button>
    </main>
  );
}
