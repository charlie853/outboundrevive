export function getBaseUrl() {
  const env = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || '';
  return env || '';
}

export function canonicalForPath(pathname: string) {
  const base = getBaseUrl();
  if (!base) return pathname; // fallback (dev)
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

export function pageMeta(title: string, description: string, pathname: string) {
  return {
    title,
    description,
    alternates: { canonical: canonicalForPath(pathname) },
  } as const;
}

