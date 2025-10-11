export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-100 bg-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-gray-600 flex flex-wrap items-center gap-4">
        <a className="underline" href="/about">About</a>
        <a className="underline" href="/sms-consent">SMS Consent</a>
        <a className="underline" href="/privacy">Privacy Policy</a>
        <a className="underline" href="/terms">Terms &amp; Conditions</a>
        <a className="underline" href="/contact">Contact</a>
        <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>
        <span className="ml-auto">© {new Date().getFullYear()} OutboundRevive</span>
      </div>
    </footer>
  );
}
