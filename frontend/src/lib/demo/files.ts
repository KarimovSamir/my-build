import { FILE_EXTENSION_MIME, MAX_FILES_PER_REQUEST, cleanFileName, fileExtension } from "@/lib/types";
import { fileRejectionReason } from "@/lib/order-form";

import { DEMO_FILE_BYTES } from "./limits";
export { DEMO_FILE_BYTES, DEMO_TOTAL_BYTES } from "./limits";
export interface PreparedFile { id: string; name: string; blob: Blob; hash: string }

/** Read and hash before opening the transaction; IndexedDB cannot wait for crypto. */
export async function prepareFiles(files: File[]): Promise<PreparedFile[]> {
  if (files.length > MAX_FILES_PER_REQUEST) throw new Error("Можно добавить не более 10 файлов за раз.");
  return Promise.all(files.map(async (file) => {
    const reason = fileRejectionReason(file);
    if (reason) throw new Error(reason);
    if (file.size > DEMO_FILE_BYTES) throw new Error("В демо допускаются файлы до 10 МиБ.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = fileExtension(file.name);
    const ascii = new TextDecoder("ascii").decode(bytes.slice(0, 1024));
    const starts = (...prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
    const valid = extension === ".pdf" ? ascii.startsWith("%PDF-")
      : extension === ".png" ? starts(137, 80, 78, 71, 13, 10, 26, 10)
      : extension === ".jpg" || extension === ".jpeg" ? starts(255, 216, 255)
      : extension === ".webp" ? ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP"
      : extension === ".dwg" ? /^AC10\d{2}/.test(ascii)
      : extension === ".dxf" && (/^AutoCAD Binary DXF/.test(ascii) || /^\s*0\s+SECTION\s+2\s+/i.test(ascii));
    if (!valid) throw new Error(`«${file.name}»: содержимое не соответствует типу файла.`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return { id: crypto.randomUUID(), name: cleanFileName(file.name),
      blob: new Blob([bytes], { type: FILE_EXTENSION_MIME[extension] }),
      hash: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("") };
  }));
}
