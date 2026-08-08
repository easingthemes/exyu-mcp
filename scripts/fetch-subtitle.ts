import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const API_BASE = 'https://api.opensubtitles.com/api/v1';

export async function searchSubtitle(params: {
  title: string;
  year: number;
  language: string;
}): Promise<{ fileId: number; releaseName: string } | null> {
  const url = new URL(`${API_BASE}/subtitles`);
  url.searchParams.set('query', params.title);
  url.searchParams.set('year', String(params.year));
  url.searchParams.set('languages', params.language);

  const res = await fetch(url, {
    headers: {
      'Api-Key': process.env.OPENSUBTITLES_API_KEY ?? '',
      'content-type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`OpenSubtitles search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { attributes: { release: string; files: { file_id: number }[] } }[] };
  const top = data.data[0];
  if (!top) return null;
  return { fileId: top.attributes.files[0].file_id, releaseName: top.attributes.release };
}

export async function downloadSubtitle(fileId: number, destPath: string): Promise<void> {
  const res = await fetch(`${API_BASE}/download`, {
    method: 'POST',
    headers: {
      'Api-Key': process.env.OPENSUBTITLES_API_KEY ?? '',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ file_id: fileId })
  });
  if (!res.ok) throw new Error(`OpenSubtitles download request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { link: string };
  const fileRes = await fetch(data.link);
  if (!fileRes.ok) throw new Error(`OpenSubtitles file download failed: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, buffer);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , title, yearStr, language = 'sr'] = process.argv;
  if (!title || !yearStr) {
    console.error('usage: tsx scripts/fetch-subtitle.ts "<title>" <year> [language]');
    process.exit(1);
  }
  const found = await searchSubtitle({ title, year: Number(yearStr), language });
  if (!found) {
    console.error('no subtitle found');
    process.exit(1);
  }
  const destPath = `./tmp/${title.replace(/\s+/g, '_')}.srt`;
  await downloadSubtitle(found.fileId, destPath);
  console.log(`downloaded "${found.releaseName}" to ${destPath}`);
}
