import { revalidatePath } from 'next/cache';
import { adminSendSms } from '../actions/admin';
import { pickPending } from '../actions/pick';

export const dynamic = 'force-dynamic';

async function sendAction(formData: FormData) {
  'use server';
  const idsRaw = String(formData.get('leadIds') || '');
  const message = String(formData.get('message') || '');
  const brand   = String(formData.get('brand') || '').trim() || undefined;

  const leadIds = idsRaw
    .split(/[\s,]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const out = await adminSendSms(leadIds, message, brand);
  revalidatePath('/leads');
  return out;
}

async function sendPendingAction(formData: FormData) {
  'use server';
  const limit   = Number(formData.get('limit') ?? 25) || 25;
  const message = String(formData.get('message') || '');
  const brand   = String(formData.get('brand') || '').trim() || undefined;

  const leadIds = await pickPending(limit);
  const out = await adminSendSms(leadIds, message, brand);
  revalidatePath('/leads');
  return out;
}

export default async function Page() {
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Send Console</h1>

      <form action={sendAction} className="space-y-3 border p-4 rounded-xl">
        <div className="font-medium">Send to explicit lead IDs</div>
        <label className="block text-sm">
          Lead IDs (comma or newline):
          <textarea name="leadIds" rows={4} className="w-full border rounded p-2 mt-1" placeholder="uuid-1, uuid-2, ..."></textarea>
        </label>
        <label className="block text-sm">
          Brand (optional):
          <input name="brand" className="w-full border rounded p-2 mt-1" placeholder="OutboundRevive" />
        </label>
        <label className="block text-sm">
          Message:
          <textarea name="message" rows={3} className="w-full border rounded p-2 mt-1" placeholder='Hi {{name}}—{{brand}} here.' />
        </label>
        <button className="px-4 py-2 rounded bg-black text-white" type="submit">Send</button>
      </form>

      <form action={sendPendingAction} className="space-y-3 border p-4 rounded-xl">
        <div className="font-medium">Send to first N pending (not opted-out)</div>
        <label className="block text-sm">
          Count:
          <input name="limit" type="number" defaultValue={25} className="w-28 border rounded p-2 mt-1" />
        </label>
        <label className="block text-sm">
          Brand (optional):
          <input name="brand" className="w-full border rounded p-2 mt-1" placeholder="OutboundRevive" />
        </label>
        <label className="block text-sm">
          Message:
          <textarea name="message" rows={3} className="w-full border rounded p-2 mt-1" placeholder='Hi {{name}}—{{brand}} here.' />
        </label>
        <button className="px-4 py-2 rounded bg-black text-white" type="submit">Send pending</button>
      </form>

      <p className="text-xs text-gray-500">
        Server-safe: admin token is added on the server via server actions. Length is enforced in the API and compliance footers are added automatically when required.
      </p>
    </div>
  );
}
