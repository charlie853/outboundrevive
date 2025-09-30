export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-100 bg-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-gray-600 flex items-center justify-between">
        <div>
          © {new Date().getFullYear()} OutboundRevive · <a className="underline" href="/legal/privacy">Privacy</a> · <a className="underline" href="/legal/terms">Terms</a> · <a className="underline" href="/messaging-policy">Messaging Policy</a>
        </div>
        <div>
          <a className="underline" href="/contact">Contact</a> · <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>
        </div>
      </div>
    </footer>
  );
}

