import { randomUUID } from "crypto";

const downloads = new Map<string, string>();

export async function createDownloadToken(filePath: string): Promise<string> {
  const token = randomUUID();
  downloads.set(token, filePath);
  return token;
}

export function getDownloadPath(token: string): string | undefined {
  return downloads.get(token);
}
