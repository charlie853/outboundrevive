export const metadata = {
  title: 'SMS Consent | OutboundRevive',
  description: 'How we collect SMS consent, frequency, STOP/HELP, and sample messages.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">SMS Consent Disclosure</h1>

      <section className="mt-6 space-y-4">
        <p><strong>Program:</strong> OutboundRevive SMS</p>
        <p><strong>Who Receives Messages:</strong> Existing and past clients who provide explicit consent via our web form.</p>
        <p><strong>How We Collect Consent:</strong> An unchecked checkbox on our form. By checking the box, you agree to receive SMS from OutboundRevive.</p>

        <div className="rounded-lg border p-4 bg-white/50">
          <p className="font-medium">Consent Text (as shown on our form)</p>
          <p className="mt-2">
            I agree to receive SMS from OutboundRevive about my account and follow-ups. Msg &amp; data rates may apply. Up to 4 msgs/mo. Reply STOP to opt out, HELP for help. Consent not a condition of purchase. See our <a className="underline" href="/privacy">Privacy Policy</a> and <a className="underline" href="/terms">Terms</a>.
          </p>
        </div>

        <p><strong>Message Frequency:</strong> Up to 4 messages per month.</p>
        <p><strong>Fees:</strong> Message and data rates may apply.</p>
        <p><strong>Opt-Out:</strong> Reply <code>STOP</code> to opt out at any time.</p>
        <p><strong>Help:</strong> Reply <code>HELP</code> for help or email <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>.</p>

        <div className="rounded-lg border p-4 bg-white/50">
          <p className="font-medium">Sample Message</p>
          <p className="mt-2">
            OutboundRevive: Hi &#123;first_name&#125;, this is Charlie following up about your recent service. Any questions or next steps I can help with? Reply STOP to opt out, HELP for help.
          </p>
        </div>

        <p className="pt-2">
          See our <a className="underline" href="/privacy">Privacy Policy</a> and <a className="underline" href="/terms">Terms &amp; Conditions</a>.
        </p>
      </section>
    </main>
  );
}

