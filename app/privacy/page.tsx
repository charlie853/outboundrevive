export const metadata = {
  title: 'Privacy Policy | OutboundRevive',
  description: 'How OutboundRevive collects, uses, and protects your information.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-600">Last updated: October 2, 2025</p>

      <section className="mt-6 space-y-4">
        <p>
          This Privacy Policy explains how OutboundRevive (“we”, “us”) collects, uses, and protects
          information when you interact with our website and messaging services.
        </p>

        <h2 className="text-xl font-semibold mt-6">Information We Collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Contact details (name, email, phone number)</li>
          <li>Message content you send to us</li>
          <li>Technical data (timestamps, delivery status, IP/country as provided by carriers)</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">How We Use Information</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Provide follow-ups, account and service updates</li>
          <li>Respond to inquiries and provide support</li>
          <li>Maintain security and prevent abuse</li>
          <li>Comply with legal obligations</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">Sharing</h2>
        <p>
          We use trusted service providers (e.g., messaging and hosting vendors) to deliver our services.
          We do not sell your personal information.
        </p>

        <h2 className="text-xl font-semibold mt-6">Retention</h2>
        <p>
          We retain messages and related metadata for as long as necessary to provide services and for
          legitimate business purposes, then delete or anonymize them.
        </p>

        <h2 className="text-xl font-semibold mt-6">Your Choices</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>SMS: Reply <code>STOP</code> to opt out; <code>HELP</code> for help.</li>
          <li>Email us at <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a> to request access, correction, or deletion.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">Security</h2>
        <p>
          We use reasonable technical and organizational measures to protect information. No method of
          transmission or storage is 100% secure.
        </p>

        <h2 className="text-xl font-semibold mt-6">Contact</h2>
        <p>
          Questions? Email <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>.
        </p>
      </section>
    </main>
  );
}

