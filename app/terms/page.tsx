export const metadata = {
  title: 'Terms & Conditions | OutboundRevive',
  description: 'SMS program terms, consent, frequency, fees, and opt-out.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Terms &amp; Conditions</h1>

      <section className="mt-6 space-y-4">
        <p><strong>Program:</strong> OutboundRevive SMS</p>
        <p>
          By opting in, you consent to receive text messages related to your account and services.
          You must be the account holder or authorized user of the phone number provided.
        </p>
        <p><strong>Frequency:</strong> Up to 4 messages per month (unless otherwise stated).</p>
        <p><strong>Fees:</strong> Message and data rates may apply.</p>
        <p><strong>Opt-Out:</strong> Reply <code>STOP</code> at any time to unsubscribe.</p>
        <p><strong>Help:</strong> Reply <code>HELP</code> for assistance or email <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>.</p>
        <p><strong>Carrier Disclaimer:</strong> Carriers are not liable for delayed or undelivered messages.</p>
        <p><strong>Acceptable Use:</strong> You may not use our services for unlawful, abusive, or prohibited purposes. We may suspend or terminate service for violations.</p>
        <p><strong>Changes:</strong> We may update these terms from time to time. The latest version will always be available on this page.</p>
        <p>See also our <a className="underline" href="/privacy">Privacy Policy</a>.</p>
      </section>
    </main>
  );
}

