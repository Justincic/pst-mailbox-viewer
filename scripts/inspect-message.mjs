import { readFile } from "node:fs/promises";
import { PSTFile } from "pst-parser";

const [pstPath, query] = process.argv.slice(2);
if (!pstPath || !query) process.exit(1);
console.debug = () => {};
const file = await readFile(pstPath);
const pst = new PSTFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const root = pst.getMessageStore().getRootFolder();
const queue = [root];
const matches = [];
while (queue.length) {
  const folder = queue.shift();
  const count = Number(folder.contentCount || 0);
  for (let offset = 0; offset < count; offset += 200) {
    const entries = folder.getContents(offset, Math.min(offset + 200, count));
    for (const entry of entries.filter((item) => String(item.subject || "").includes(query))) {
      try {
        const message = folder.getMessage(entry.nid);
        const date = message.getProperty(0x0E06) || message.getProperty(0x0039) || message.getProperty(0x3007) || 0;
        matches.push({ message, date: new Date(date).getTime() || 0 });
      } catch { /* skip unreadable matches */ }
    }
  }
  for (const entry of folder.getSubFolderEntries?.() || []) queue.push(folder.getSubFolder(entry.nid));
}
matches.sort((a, b) => b.date - a.date);
const found = matches[0]?.message;
if (!found) throw Error("Message not found");
const getTag = (tag) => { try { return found.getProperty(tag); } catch { return undefined; } };
const bytes = new Uint8Array(found.bodyHTMLBytes);
console.log(JSON.stringify({
  internetCodepage: getTag(0x3FDE),
  messageCodepage: getTag(0x3FFD),
  internetCharset: getTag(0x669A),
  headers: String(getTag(0x007D) || "").match(/content-type:[^\r\n]+/ig)?.slice(0, 4),
  byteLength: bytes.byteLength,
  matchCount: matches.length,
  selectedDate: new Date(matches[0].date).toISOString(),
  bodyHTMLBytesType: found.bodyHTMLBytes?.constructor?.name || typeof found.bodyHTMLBytes,
}, null, 2));

const score = (value) => ((value.match(/<(?:!doctype|html|head|body|meta|style|div|span|p|table|tr|td|br|font|a)\b/gi)?.length || 0) < 2 ? 100000 : 0)
  + (value.match(/�/g)?.length || 0) * 50
  + (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length || 0) * 10
  + (value.match(/Ã.|Â.|â€|ðŸ|锟斤拷|嚙/g)?.length || 0) * 8;
for (const encoding of ["utf-8", "big5", "gb18030", "windows-1252", "utf-16le"]) {
  try {
    const decoded = new TextDecoder(encoding).decode(bytes);
    const preview = decoded.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 500);
    console.log(`\n${encoding} score=${score(decoded)}\n${preview}`);
  } catch (error) { console.log(`${encoding}: ${error.message}`); }
}
