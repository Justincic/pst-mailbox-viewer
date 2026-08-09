import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PSTFile } from "pst-parser";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/audit-pst.mjs /path/to/file.pst");
  process.exit(1);
}

const CODEPAGES = {
  932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5",
  1200: "utf-16le", 1201: "utf-16be", 1250: "windows-1250",
  1251: "windows-1251", 1252: "windows-1252", 1253: "windows-1253",
  1254: "windows-1254", 1255: "windows-1255", 1256: "windows-1256",
  1257: "windows-1257", 1258: "windows-1258", 20127: "windows-1252",
  28591: "iso-8859-1", 50220: "iso-2022-jp", 54936: "gb18030", 65001: "utf-8",
};

const summary = {
  file: resolve(inputPath),
  folders: [],
  totals: {
    folders: 0, reportedItems: 0, listedItems: 0, parsedItems: 0, parseErrors: 0,
    htmlBodies: 0, plainBodies: 0, itemsWithoutBody: 0, suspectedGarbled: 0,
    attachments: 0, attachmentErrors: 0, attachmentsWithData: 0,
    inlineImages: 0, cidReferences: 0, unresolvedCidReferences: 0,
  },
  codepages: {},
  errorKinds: {},
  failures: [],
};

const bytesOf = (value) => {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
};

const bump = (object, key) => { object[key] = (object[key] || 0) + 1; };
const safeText = (value) => typeof value === "string" ? value : "";
const errorKind = (error) => String(error?.message || error || "unknown").replace(/\b\d+\b/g, "#").slice(0, 160);

function decodeHtml(properties) {
  const bytes = bytesOf(properties.bodyHtml);
  if (!bytes) return safeText(properties.html);
  const codepage = Number(properties.internetCodepage || properties.messageCodepage || 65001);
  const encoding = CODEPAGES[codepage] || "utf-8";
  bump(summary.codepages, `${codepage}:${encoding}`);
  try { return new TextDecoder(encoding).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

function looksGarbled(value) {
  return /�|Ã.|Â.|â€|ðŸ|锟斤拷|嚙/i.test(value);
}

function auditMessage(message) {
  const readTag = (tag) => { try { return message.getProperty?.(tag); } catch { return undefined; } };
  const properties = {
    bodyHtml: message.bodyHTMLBytes,
    internetCodepage: readTag(0x3FDE),
    messageCodepage: readTag(0x3FFD),
  };
  const plainBody = safeText(message.body);
  const htmlBody = decodeHtml(properties);
  if (plainBody) summary.totals.plainBodies += 1;
  if (htmlBody) summary.totals.htmlBodies += 1;
  if (!plainBody && !htmlBody) summary.totals.itemsWithoutBody += 1;
  if (looksGarbled(htmlBody || plainBody)) summary.totals.suspectedGarbled += 1;

  const cidReferences = [...htmlBody.matchAll(/(?:src|background)\s*=\s*["']cid:([^"']+)/gi)].map((match) => match[1].toLowerCase());
  summary.totals.cidReferences += cidReferences.length;
  const attachmentCids = new Set();
  const attachmentCount = Number(message.attachmentCount || 0);
  summary.totals.attachments += attachmentCount;
  for (let index = 0; index < attachmentCount; index += 1) {
    try {
      const attachment = message.getAttachmentInfo(index) || {};
      const cid = safeText(attachment.attachContentId).replace(/^<|>$/g, "").toLowerCase();
      if (cid) attachmentCids.add(cid);
      const data = bytesOf(attachment.attachDataBinary);
      if (data?.byteLength) summary.totals.attachmentsWithData += 1;
      if (cid && safeText(attachment.attachMimeTag).toLowerCase().startsWith("image/")) summary.totals.inlineImages += 1;
    } catch (error) {
      summary.totals.attachmentErrors += 1;
      bump(summary.errorKinds, `attachment: ${errorKind(error)}`);
    }
  }
  summary.totals.unresolvedCidReferences += cidReferences.filter((cid) => !attachmentCids.has(cid)).length;
}

async function walk(folder, parentPath = "") {
  const name = String(folder.displayName || "(unnamed)");
  const folderPath = parentPath ? `${parentPath}/${name}` : name;
  const reported = Number(folder.contentCount || 0);
  const folderResult = { path: folderPath, reported, listed: 0, parsed: 0, errors: 0 };
  summary.folders.push(folderResult);
  summary.totals.folders += 1;
  summary.totals.reportedItems += reported;

  for (let offset = 0; offset < reported; offset += 100) {
    const entries = folder.getContents(offset, Math.min(offset + 100, reported)) || [];
    folderResult.listed += entries.length;
    summary.totals.listedItems += entries.length;
    for (const entry of entries) {
      try {
        const message = folder.getMessage(entry.nid);
        auditMessage(message);
        folderResult.parsed += 1;
        summary.totals.parsedItems += 1;
      } catch (error) {
        folderResult.errors += 1;
        summary.totals.parseErrors += 1;
        bump(summary.errorKinds, `message: ${errorKind(error)}`);
        summary.failures.push({ folder: folderPath, nid: entry.nid, subject: safeText(entry.subject), error: errorKind(error) });
      }
    }
    process.stdout.write(`\r${folderPath}: ${folderResult.parsed + folderResult.errors}/${reported}`);
    await new Promise((resolveProgress) => setImmediate(resolveProgress));
  }
  process.stdout.write("\n");

  let subfolderEntries = [];
  try { subfolderEntries = folder.getSubFolderEntries?.() || []; }
  catch (error) { bump(summary.errorKinds, `folder: ${errorKind(error)}`); }
  for (const entry of subfolderEntries) {
    try { await walk(folder.getSubFolder(entry.nid), folderPath); }
    catch (error) { bump(summary.errorKinds, `subfolder: ${errorKind(error)}`); }
  }
}

console.log(`Reading ${resolve(inputPath)}`);
const fileBuffer = await readFile(inputPath);
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
const pst = new PSTFile(arrayBuffer);
const rootFolder = pst.getMessageStore().getRootFolder();
await walk(rootFolder);
console.log("AUDIT_RESULT");
console.log(JSON.stringify(summary, null, 2));
