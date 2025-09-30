"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-3xl font-extrabold mb-2">Something went wrong</h1>
      <p className="text-gray-700">Please try again. If the issue persists, contact support.</p>
      <div className="mt-4">
        <button onClick={() => reset()} className="px-4 py-2 bg-gray-900 text-white rounded-md">Retry</button>
      </div>
    </div>
  );
}

