/**
 * Email sending: Gmail API, Microsoft Graph, or SMTP.
 * credentials_ref on inbox: env var name that holds refresh_token (Gmail/Graph) or JSON string for SMTP.
 * MVP: stub that throws; implement when OAuth/SMTP are configured.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  from: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  providerMessageId: string;
  sentAt: string;
}

/**
 * Send one email using the given inbox. Reads credentials from credentials_ref (env key).
 * MVP: throws "Email sending not configured" unless real provider is wired.
 */
export async function sendEmail(
  _inboxId: string,
  _params: SendEmailParams,
  _credentialsRef: string | null
): Promise<SendEmailResult> {
  if (!_credentialsRef) {
    throw new Error('Email sending not configured: no credentials_ref');
  }
  const raw = process.env[_credentialsRef];
  if (!raw) {
    throw new Error(`Email sending not configured: env ${_credentialsRef} not set`);
  }
  // TODO: wire Gmail / Graph / SMTP using raw (refresh token or SMTP JSON)
  throw new Error('Email sending not implemented: wire Gmail/Graph/SMTP in lib/email/send.ts');
}
