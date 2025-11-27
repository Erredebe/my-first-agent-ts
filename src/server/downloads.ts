import { randomUUID } from "crypto";

const downloads = new Map<string, string>();

export async function createDownloadToken(filePath: string): Promise<string> {
  const token = randomUUID();
  downloads.set(token, filePath);
  console.log(`[downloads] token created: ${token} -> ${filePath}`);
  return token;
}

export function getDownloadPath(token: string): string | undefined {
  const p = downloads.get(token);
  console.log(`[downloads] lookup token: ${token} -> ${p ?? "(not found)"}`);
  return p;
}
