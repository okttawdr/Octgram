export function authUrls(origin: string): { callback: string; recovery: string };
export function googleOAuthOptions(origin: string): { provider: "google"; options: { redirectTo: string } };
export function safeNextPath(value: string | null | undefined): string;
