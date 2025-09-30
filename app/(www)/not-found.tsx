export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-3xl font-extrabold mb-2">Page not found</h1>
      <p className="text-gray-700">Sorry, we couldn\'t find that page.</p>
      <div className="mt-4">
        <a href="/" className="px-4 py-2 bg-gray-900 text-white rounded-md">Back to home</a>
      </div>
    </div>
  );
}

