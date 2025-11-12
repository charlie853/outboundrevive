export default function SiteFooter() {
  return (
    <footer className="bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-400 flex flex-wrap items-center gap-4">
        <a className="hover:text-white transition-colors" href="/">Home</a>
        <a className="hover:text-white transition-colors" href="/about">About</a>
        <a className="hover:text-white transition-colors" href="/sms-consent">SMS Consent</a>
        <a className="hover:text-white transition-colors" href="/privacy">Privacy Policy</a>
        <a className="hover:text-white transition-colors" href="/terms">Terms &amp; Conditions</a>
        <a className="hover:text-white transition-colors" href="/contact">Contact</a>
        <a className="hover:text-white transition-colors" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>
        <span className="ml-auto text-gray-500">© {new Date().getFullYear()} OutboundRevive</span>
      </div>
    </footer>
  );
}
