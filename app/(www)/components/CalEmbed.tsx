export default function CalEmbed({ src }: { src: string }) {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="rounded-2xl overflow-hidden shadow-sm ring-1 ring-black/5">
        <iframe
          src={src}
          className="w-full h-[900px]"
          style={{ border: 0 }}
          loading="lazy"
          title="Book a demo"
        />
      </div>
      <p className="text-center text-sm text-zinc-500 mt-3">
        Trouble loading?{' '}
        <a className="underline" href={src.replace('&embed=true','')} target="_blank">Open in a new tab</a>
      </p>
    </div>
  );
}

