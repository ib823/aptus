function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getTrustedAppOrigin(request: Request): string {
  return (
    parseOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    parseOrigin(process.env.NEXTAUTH_URL) ??
    new URL(request.url).origin
  );
}
