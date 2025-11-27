import { randomUUID } from "crypto";
const downloads = new Map();
export async function createDownloadToken(filePath) {
    const token = randomUUID();
    downloads.set(token, filePath);
    return token;
}
export function getDownloadPath(token) {
    return downloads.get(token);
}
