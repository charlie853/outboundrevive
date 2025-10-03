export const metadata = {
  title: 'SMS Consent | OutboundRevive',
  description: 'How we collect SMS consent, frequency, STOP/HELP, and sample messages.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 md:px-6 py-12">
      <section className="relative overflow-hidden rounded-2xl border border-surface-line bg-surface-card shadow-soft px-6 md:px-10 py-8">
        <h1 className="text-3xl font-semibold leading-tight text-ink-1">SMS Consent Disclosure</h1>

        <div className="mt-6 space-y-4 text-ink-2">
          <p><strong className="text-ink-1">Program:</strong> OutboundRevive SMS</p>
          <p><strong className="text-ink-1">Who Receives Messages:</strong> Existing and past clients who provide explicit consent via our web form.</p>
          <p><strong className="text-ink-1">How We Collect Consent:</strong> An unchecked checkbox on our form. By checking the box, you agree to receive SMS from OutboundRevive.</p>

          <div className="rounded-xl border border-surface-line bg-white p-4">
            <p className="font-medium text-ink-1">Consent Text (as shown on our form)</p>
            <p className="mt-2">
              I agree to receive SMS from OutboundRevive about my account and follow-ups. Msg &amp; data rates may apply. Up to 4 msgs/mo. Reply <code>STOP</code> to opt out, <code>HELP</code> for help. Consent not a condition of purchase. See our <a className="underline" href="/privacy">Privacy Policy</a> and <a className="underline" href="/terms">Terms</a>.
            </p>
          </div>

          <p><strong className="text-ink-1">Message Frequency:</strong> Up to 4 messages per month.</p>
          <p><strong className="text-ink-1">Fees:</strong> Message and data rates may apply.</p>
          <p><strong className="text-ink-1">Opt-Out:</strong> Reply <code>STOP</code> to opt out at any time.</p>
          <p><strong className="text-ink-1">Help:</strong> Reply <code>HELP</code> for help or email <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>.</p>

          <div className="rounded-xl border border-surface-line bg-white p-4">
            <p className="font-medium text-ink-1">Sample Message</p>
            <p className="mt-2">
              OutboundRevive: Hi &#123;first_name&#125;, this is Charlie following up about your recent service. Any questions or next steps I can help with? Reply <code>STOP</code> to opt out, <code>HELP</code> for help.
            </p>
          </div>

          <p className="pt-2">
            See our <a className="underline" href="/privacy">Privacy Policy</a> and <a className="underline" href="/terms">Terms &amp; Conditions</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
