import { zip } from 'fflate';

export interface ArchiveFile {
  name: string;
  bytes: Uint8Array;
}

export async function createZip(files: ArchiveFile[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const file of files) {
    const name = uniqueFileName(file.name, used);
    used.add(name);
    entries[name] = file.bytes;
  }
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

export function uniqueFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let index = 2;
  while (used.has(`${stem}-${index}${extension}`)) index += 1;
  return `${stem}-${index}${extension}`;
}
