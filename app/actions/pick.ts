'use server';

// type it to avoid the "any" eslint error
export type PickResult = { ok: boolean };

// existing export (keep yours if you already have logic)
export async function pick(/* args: YourArgsType */): Promise<PickResult> {
  return { ok: true };
}

// ➜ add this named export to satisfy the import
export async function pickPending(/* args: YourArgsType */): Promise<PickResult> {
  return { ok: true };
}

// optional default export if you import default elsewhere
export default pick;