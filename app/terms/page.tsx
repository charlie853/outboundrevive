export const metadata = {
  title: 'Terms & Conditions | OutboundRevive',
  description: 'SMS program terms, consent, frequency, fees, and opt-out.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 md:px-6 py-12">
      <section className="relative overflow-hidden rounded-2xl border border-surface-line bg-surface-card shadow-soft px-6 md:px-10 py-8">
        <h1 className="text-3xl font-semibold leading-tight text-ink-1">Terms &amp; Conditions</h1>

        <div className="mt-6 space-y-4 text-ink-2">
          <p><strong className="text-ink-1">Program:</strong> OutboundRevive SMS</p>
          <p>
            By opting in, you consent to receive text messages related to your account and services.
            You must be the account holder or authorized user of the phone number provided.
          </p>
          <p><strong className="text-ink-1">Frequency:</strong> Up to 4 messages per month (unless otherwise stated).</p>
          <p><strong className="text-ink-1">Fees:</strong> Message and data rates may apply.</p>
          <p><strong className="text-ink-1">Opt-Out:</strong> Reply <code>STOP</code> at any time to unsubscribe.</p>
          <p><strong className="text-ink-1">Help:</strong> Reply <code>HELP</code> for assistance or email <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>.</p>
          <p><strong className="text-ink-1">Carrier Disclaimer:</strong> Carriers are not liable for delayed or undelivered messages.</p>
          <p><strong className="text-ink-1">Acceptable Use:</strong> You may not use our services for unlawful, abusive, or prohibited purposes. We may suspend or terminate service for violations.</p>
          <p><strong className="text-ink-1">Changes:</strong> We may update these terms from time to time. The latest version will always be available on this page.</p>
          <p>See also our <a className="underline" href="/privacy">Privacy Policy</a>.</p>
        </div>
      </section>
    </main>
  );
}
