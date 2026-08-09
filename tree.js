import { PSTFile } from "pst-parser";

const APP_VERSION = "2.1.0";
const PAGE_SIZE = 200;
const DOM_PAGE_SIZE = 150;
const folderCache = new WeakMap();
let activeObjectUrls = [];

const icons = {
  mail: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 3.2 8 5 8-5V7l-8 5-8-5v1.2Z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z"/></svg>`,
  file: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm1 3.5L18.5 9H15V5.5Z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 19.6-5.1-5.1a7 7 0 1 0-1.4 1.4l5.1 5.1 1.4-1.4ZM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"/></svg>`,
  paperclip: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 6.3 9.2 14.8a3 3 0 0 1-4.2-4.2l9.2-9.2 1.4 1.4-9.2 9.2a1 1 0 1 0 1.4 1.4l8.5-8.5a3 3 0 0 1 4.2 4.2l-9.2 9.2a5 5 0 0 1-7.1-7.1l8.5-8.5 1.4 1.4-8.5 8.5a3 3 0 1 0 4.2 4.2l9.2-9.2a1 1 0 0 0-1.4-1.4Z"/></svg>`,
};

const state = {
  fileName: "",
  pst: null,
  selectedFolder: null,
  selectedMessage: null,
  messages: [],
  filter: "",
  visibleCount: DOM_PAGE_SIZE,
  folderRequest: 0,
  messageRequest: 0,
};

const root = document.querySelector("#pst-mailbox");
if (!root) throw new Error("找不到 #pst-mailbox 容器");

root.innerHTML = `
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17212b; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 860px; background: #eef2f7; }
    button, input { font: inherit; }
    button { cursor: pointer; }
    svg { width: 18px; height: 18px; fill: currentColor; flex: none; }
    .app { height: 100vh; min-height: 620px; display: grid; grid-template-rows: 64px 1fr; overflow: hidden; }
    .topbar { display: flex; align-items: center; gap: 22px; padding: 0 22px; color: white; background: linear-gradient(100deg, #172b4d, #284c7e); box-shadow: 0 2px 14px #12284a2e; z-index: 3; }
    .brand { display: flex; align-items: center; gap: 11px; font-weight: 750; letter-spacing: .2px; white-space: nowrap; }
    .version { padding: 3px 7px; border: 1px solid #ffffff35; border-radius: 999px; color: #dcecff; background: #ffffff12; font-size: 10px; font-weight: 750; letter-spacing: .4px; }
    .brand-badge { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #57b7ff; box-shadow: inset 0 0 0 1px #fff4; }
    .brand-badge svg { width: 22px; height: 22px; }
    .search { margin-left: auto; width: min(420px, 38vw); height: 38px; display: flex; align-items: center; gap: 9px; padding: 0 12px; border-radius: 9px; background: #ffffff18; border: 1px solid #ffffff25; }
    .search:focus-within { background: #fff; color: #17212b; }
    .search input { width: 100%; border: 0; outline: 0; background: transparent; color: inherit; }
    .search input::placeholder { color: #dbe9f8; }
    .search:focus-within input::placeholder { color: #7c8997; }
    .import { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 15px; color: #13223a; font-weight: 700; border: 0; border-radius: 9px; background: #fff; box-shadow: 0 2px 8px #07152c2a; }
    .import:hover { background: #f0f7ff; }
    .workspace { min-height: 0; display: grid; grid-template-columns: 260px minmax(320px, 36%) 1fr; overflow: hidden; }
    .pane { min-width: 0; min-height: 0; background: white; border-right: 1px solid #dfe5ec; overflow: hidden; }
    .sidebar { display: flex; flex-direction: column; background: #f8fafc; }
    .file-card { margin: 18px 14px 12px; padding: 13px; border: 1px solid #dde4ed; border-radius: 11px; background: white; box-shadow: 0 2px 8px #182a4010; }
    .eyebrow { color: #768494; font-size: 11px; font-weight: 750; letter-spacing: .9px; text-transform: uppercase; }
    .file-name { margin-top: 5px; font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tree { flex: 1; padding: 2px 8px 22px; overflow: auto; }
    .tree-list { list-style: none; padding: 0; margin: 0; }
    .tree-list .tree-list { padding-left: 15px; }
    .folder-row { width: 100%; height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 8px; border: 0; border-radius: 7px; color: #475569; background: transparent; text-align: left; }
    .folder-row:hover { background: #eaf0f7; color: #172b4d; }
    .folder-row.active { background: #deecff; color: #0958a7; font-weight: 700; }
    .folder-row .chevron { width: 12px; font-size: 11px; text-align: center; transition: transform .15s; }
    .folder-row[aria-expanded="true"] .chevron { transform: rotate(90deg); }
    .folder-row .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .folder-row .count { margin-left: auto; color: #8794a3; font-size: 11px; }
    .messages { display: flex; flex-direction: column; }
    .pane-head { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid #e7ebf0; }
    .pane-title { min-width: 0; font-size: 17px; font-weight: 760; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pane-meta { color: #7b8794; font-size: 12px; white-space: nowrap; }
    .message-list { flex: 1; overflow: auto; }
    .message-row { width: 100%; min-height: 82px; display: grid; grid-template-columns: 42px 1fr auto; gap: 10px; padding: 13px 15px; border: 0; border-bottom: 1px solid #edf0f4; background: #fff; color: inherit; text-align: left; }
    .message-row:hover { background: #f6f9fd; }
    .message-row.active { background: #eaf3ff; box-shadow: inset 3px 0 #2378cf; }
    .avatar { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; color: #24547d; background: #dcebf8; font-size: 13px; font-weight: 800; }
    .message-main { min-width: 0; }
    .sender { display: block; font-size: 13px; font-weight: 740; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .subject { display: block; margin-top: 4px; color: #344454; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .snippet { display: block; margin-top: 3px; color: #8894a1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .message-side { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; color: #7b8794; font-size: 11px; }
    .message-side svg { width: 14px; height: 14px; }
    .load-more { width: calc(100% - 28px); margin: 14px; padding: 10px; border: 1px solid #d7e0ea; border-radius: 8px; color: #25649e; background: #f7faff; font-weight: 700; }
    .load-more:hover { background: #edf5ff; }
    .reader { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
    .reader-empty, .empty { height: 100%; display: grid; place-items: center; padding: 35px; color: #768494; text-align: center; }
    .empty-card { max-width: 390px; }
    .empty-icon { width: 72px; height: 72px; display: grid; place-items: center; margin: 0 auto 18px; border-radius: 22px; color: #4484bd; background: #edf5fc; }
    .empty-icon svg { width: 35px; height: 35px; }
    .empty h2 { margin: 0 0 8px; color: #243447; font-size: 20px; }
    .empty p { margin: 0; font-size: 13px; line-height: 1.65; }
    .reader-content { min-height: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
    .mail-head { padding: 24px 28px 19px; border-bottom: 1px solid #e8ecf1; }
    .mail-subject { margin: 0 0 18px; font-size: 22px; line-height: 1.3; color: #1b2838; }
    .mail-person { display: grid; grid-template-columns: 42px 1fr auto; gap: 12px; align-items: center; }
    .mail-person .avatar { width: 42px; height: 42px; }
    .mail-from { font-size: 13px; font-weight: 750; }
    .mail-to { margin-top: 3px; color: #74808d; font-size: 12px; }
    .mail-date { color: #74808d; font-size: 12px; }
    .mail-body-toolbar { flex: none; padding: 9px 28px; border-bottom: 1px solid #e8ecf1; background: #fff9e8; }
    .remote-images { padding: 6px 10px; border: 1px solid #e6c66d; border-radius: 7px; color: #725814; background: #fffdf6; font-size: 12px; font-weight: 700; }
    .remote-images:hover { background: #fff3c8; }
    .mail-body { min-height: 0; flex: 1 1 0; padding: 26px 30px 60px; overflow: auto; overscroll-behavior: contain; color: #2d3947; font-family: ui-serif, Georgia, serif; font-size: 15px; line-height: 1.72; overflow-wrap: anywhere; }
    .mail-body img { max-width: 100%; height: auto; }
    .mail-body pre { white-space: pre-wrap; font: inherit; }
    .attachments { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 30px 22px; }
    .attachment { display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px; border: 1px solid #d9e1ea; border-radius: 8px; background: #f8fafc; font-size: 12px; }
    .busy { position: fixed; inset: 64px 0 0; z-index: 10; display: grid; place-items: center; color: #23476e; background: #f6f9fce8; backdrop-filter: blur(3px); }
    .spinner { width: 34px; height: 34px; margin: 0 auto 12px; border: 3px solid #d5e3f0; border-top-color: #2a78c5; border-radius: 50%; animation: spin .8s linear infinite; }
    .hidden { display: none !important; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 1050px) { .workspace { grid-template-columns: 225px 355px 1fr; } }
  </style>
  <main class="app">
    <header class="topbar">
      <div class="brand"><span class="brand-badge">${icons.mail}</span><span>PST 信箱瀏覽器</span><span class="version" title="目前版本">v${APP_VERSION}</span></div>
      <label class="search">${icons.search}<input id="mail-search" type="search" placeholder="搜尋寄件者或主旨" disabled /></label>
      <button class="import" id="import-pst" type="button">${icons.file}<span>開啟 PST</span></button>
      <input id="pst-input" type="file" accept=".pst,application/vnd.ms-outlook" hidden />
    </header>
    <section class="workspace">
      <aside class="pane sidebar">
        <div class="file-card"><div class="eyebrow">目前的封存檔</div><div class="file-name" id="file-name">尚未載入 PST</div></div>
        <nav class="tree" aria-label="PST 資料夾"><ul class="tree-list" id="folder-tree"></ul></nav>
      </aside>
      <section class="pane messages">
        <div class="pane-head"><div class="pane-title" id="folder-title">郵件</div><div class="pane-meta" id="mail-count">0 封</div></div>
        <div class="message-list" id="message-list"><div class="reader-empty">請先開啟一個 PST 檔案</div></div>
      </section>
      <article class="reader" id="reader">
        <div class="empty"><div class="empty-card"><div class="empty-icon">${icons.mail}</div><h2>讀取 Outlook 封存郵件</h2><p>點擊「開啟 PST」選擇檔案。資料只在這個瀏覽器分頁中解析，不會上傳到伺服器。</p></div></div>
      </article>
    </section>
    <div class="busy hidden" id="busy"><div><div class="spinner"></div><div id="busy-text">正在讀取 PST…</div></div></div>
  </main>`;

const els = {
  importButton: root.querySelector("#import-pst"),
  input: root.querySelector("#pst-input"),
  search: root.querySelector("#mail-search"),
  fileName: root.querySelector("#file-name"),
  folderTree: root.querySelector("#folder-tree"),
  folderTitle: root.querySelector("#folder-title"),
  mailCount: root.querySelector("#mail-count"),
  messageList: root.querySelector("#message-list"),
  reader: root.querySelector("#reader"),
  busy: root.querySelector("#busy"),
  busyText: root.querySelector("#busy-text"),
};

const text = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result || fallback;
};

const escapeHTML = (value) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const initials = (name) => text(name, "?")
  .split(/[\s@._-]+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "?";

const get = (object, names, fallback = "") => {
  for (const name of names) {
    try {
      const value = typeof object?.[name] === "function" ? object[name]() : object?.[name];
      if (value !== undefined && value !== null && value !== "") return value;
    } catch { /* 某些 PST 欄位可能未實作，繼續嘗試替代欄位。 */ }
  }
  return fallback;
};

const cleanBodyText = (value) => text(value)
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

const CODEPAGE_ENCODINGS = {
  37: "ibm037", 437: "ibm437", 850: "ibm850", 874: "windows-874",
  932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5",
  1200: "utf-16le", 1201: "utf-16be", 1250: "windows-1250",
  1251: "windows-1251", 1252: "windows-1252", 1253: "windows-1253",
  1254: "windows-1254", 1255: "windows-1255", 1256: "windows-1256",
  1257: "windows-1257", 1258: "windows-1258", 20127: "windows-1252",
  28591: "iso-8859-1", 54936: "gb18030", 65001: "utf-8",
};

function normalizeEncoding(value) {
  if (typeof value === "number" || /^\d+$/.test(text(value))) return CODEPAGE_ENCODINGS[Number(value)] || "";
  const encoding = text(value).toLowerCase().replace(/["']/g, "").trim();
  const aliases = {
    utf8: "utf-8", unicode: "utf-8", big5: "big5", "big5-hkscs": "big5",
    gb2312: "gbk", gb_2312: "gbk", gbk: "gbk", gb18030: "gb18030",
    cp950: "big5", cp936: "gbk", cp1252: "windows-1252", latin1: "windows-1252",
    "x-sjis": "shift_jis", "windows-31j": "shift_jis", "ks_c_5601-1987": "euc-kr",
  };
  return aliases[encoding] || encoding;
}

function asBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function decodeScore(value) {
  return (value.match(/�/g)?.length || 0) * 50
    + (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length || 0) * 10
    + (value.match(/Ã.|Â.|â€|ðŸ|锟斤拷|嚙/g)?.length || 0) * 8;
}

function decodeHtmlBody(properties, raw) {
  const binary = get(properties, ["bodyHtml"], null);
  const bytes = asBytes(binary);
  if (!bytes) return text(get(raw, ["bodyHTML", "htmlBody"], get(properties, ["html", "bodyHtml"], "")));

  const asciiPreview = new TextDecoder("windows-1252").decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
  const headers = text(get(properties, ["transportMessageHeaders"], ""));
  const declaredCharset = headers.match(/content-type:[^\r\n]*charset\s*=\s*["']?([^\s;"']+)/i)?.[1]
    || asciiPreview.match(/<meta[^>]+charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1]
    || asciiPreview.match(/<meta[^>]+content=["'][^"']*charset\s*=\s*([^\s;"']+)/i)?.[1]
    || get(properties, ["internetCharset"], "");
  const codepage = get(properties, ["internetCodepage", "messageCodepage"], "");
  const preferred = normalizeEncoding(declaredCharset) || normalizeEncoding(codepage);
  const candidates = [...new Set([preferred, "utf-8", "big5", "gb18030", "windows-1252"].filter(Boolean))];
  const decoded = [];
  for (const encoding of candidates) {
    try {
      const value = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, "");
      decoded.push({ value, score: decodeScore(value) + (encoding === preferred ? -5 : 0) });
    } catch { /* 瀏覽器不支援此編碼時嘗試下一個 */ }
  }
  decoded.sort((a, b) => a.score - b.score);
  return decoded[0]?.value || text(get(raw, ["bodyHTML"], ""));
}

const formatDate = (value, short = false) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("zh-TW", short
    ? { month: "2-digit", day: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
};

const setBusy = (busy, message = "正在讀取 PST…") => {
  els.busyText.textContent = message;
  els.busy.classList.toggle("hidden", !busy);
};

function folderInfo(folder) {
  return {
    name: text(get(folder, ["displayName", "name"], "未命名資料夾"), "未命名資料夾"),
    count: Number(get(folder, ["contentCount", "emailCount"], 0)) || 0,
  };
}

function getSubfolders(folder) {
  try {
    const entries = folder.getSubFolderEntries?.() || [];
    return entries.map((entry) => folder.getSubFolder(entry.nid)).filter(Boolean);
  } catch {
    try { return folder.getSubFolders?.() || []; } catch { return []; }
  }
}

function renderFolder(folder, parent, open = false) {
  const info = folderInfo(folder);
  const hasChildren = Boolean(get(folder, ["hasSubfolders"], false));
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "folder-row";
  button.setAttribute("aria-expanded", String(open));
  button.innerHTML = `<span class="chevron">${hasChildren ? "›" : ""}</span>${icons.folder}<span class="name">${escapeHTML(info.name)}</span><span class="count">${info.count || ""}</span>`;
  li.append(button);

  let childList = null;
  let childrenLoaded = false;
  const loadChildren = () => {
    if (!childList || childrenLoaded) return;
    childrenLoaded = true;
    const subfolders = getSubfolders(folder);
    subfolders.forEach((child) => renderFolder(child, childList));
    if (!subfolders.length) button.querySelector(".chevron").textContent = "";
  };
  if (hasChildren) {
    childList = document.createElement("ul");
    childList.className = "tree-list";
    childList.hidden = !open;
    li.append(childList);
    if (open) loadChildren();
  }

  button.addEventListener("click", async () => {
    if (childList) {
      loadChildren();
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      childList.hidden = expanded;
    }
    root.querySelectorAll(".folder-row.active").forEach((node) => node.classList.remove("active"));
    button.classList.add("active");
    await selectFolder(folder);
  });
  parent.append(li);
  return button;
}

function messageFromPST(raw, folder, hydrated = true) {
  let properties = {};
  try { properties = raw.getAllProperties?.() || {}; } catch { /* 保留可直接讀取的欄位 */ }
  const value = (names, fallback = "") => get(raw, names, get(properties, names, fallback));
  let attachmentEntries = [];
  try { attachmentEntries = raw.getAttachmentEntries?.() || []; } catch { /* 附件表可能損壞 */ }
  const sender = text(value(["senderName", "sentRepresentingName", "senderEmailAddress", "sentRepresentingEmailAddress"], "未知寄件者"), "未知寄件者");
  const subject = text(value(["subject", "normalizedSubject", "conversationTopic"], "（無主旨）"), "（無主旨）");
  const plainBody = text(value(["body", "plainTextBody"], ""));
  const htmlBody = text(decodeHtmlBody(properties, raw));
  const date = value(["messageDeliveryTime", "clientSubmitTime", "creationTime", "lastModificationTime"], "");
  const attachmentCount = attachmentEntries.length || Number(value(["numberOfAttachments", "attachmentCount"], 0)) || (value(["hasattach", "hasAttachments"], false) ? 1 : 0);
  return {
    raw,
    folder,
    nid: Number(value(["nid"], 0)) || 0,
    hydrated,
    attachmentEntries,
    sender,
    senderEmail: text(value(["senderEmailAddress", "sentRepresentingEmailAddress"], "")),
    to: text(value(["displayTo", "receivedByName"], "")),
    cc: text(value(["displayCc", "displayCC"], "")),
    subject,
    plainBody,
    htmlBody,
    snippet: cleanBodyText(plainBody || htmlBody).slice(0, 160),
    date,
    attachmentCount,
  };
}

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

async function readMessages(folder, onProgress = () => {}) {
  const count = Math.max(0, Number(get(folder, ["contentCount", "emailCount"], 0)) || 0);
  const results = [];
  if (typeof folder.getContents === "function" && typeof folder.getMessage === "function") {
    for (let offset = 0; offset < count; offset += PAGE_SIZE) {
      const entries = folder.getContents(offset, Math.min(offset + PAGE_SIZE, count)) || [];
      for (const entry of entries) {
        try { results.push(messageFromPST(entry, folder, false)); } catch { /* 非郵件項目略過 */ }
      }
      onProgress(results.length, count);
      await yieldToBrowser();
    }
    return results;
  }

  if (typeof folder.getNextChild === "function") {
    try { folder.moveChildCursorTo?.(0); } catch { /* 舊版解析器可能沒有游標重設 */ }
    for (let i = 0; i < count; i += 1) {
      try {
        const child = folder.getNextChild();
        if (!child) break;
        results.push(messageFromPST(child, folder));
      } catch { /* 損壞或不支援的項目略過 */ }
      if (i > 0 && i % PAGE_SIZE === 0) {
        onProgress(results.length, count);
        await yieldToBrowser();
      }
    }
  }
  return results;
}

async function selectFolder(folder) {
  const request = ++state.folderRequest;
  state.messageRequest += 1;
  state.selectedFolder = folder;
  state.selectedMessage = null;
  state.visibleCount = DOM_PAGE_SIZE;
  const info = folderInfo(folder);
  els.folderTitle.textContent = info.name;
  els.reader.innerHTML = `<div class="reader-empty">選擇一封郵件以查看內容</div>`;
  els.mailCount.textContent = info.count ? `${info.count.toLocaleString("zh-TW")} 封` : "0 封";
  els.messageList.innerHTML = `<div class="reader-empty">正在載入郵件清單…</div>`;
  await yieldToBrowser();
  try {
    let messagesPromise = folderCache.get(folder);
    if (!messagesPromise) {
      messagesPromise = readMessages(folder, (loaded, total) => {
        if (request === state.folderRequest) {
          els.messageList.innerHTML = `<div class="reader-empty">正在載入郵件清單… ${loaded.toLocaleString("zh-TW")} / ${total.toLocaleString("zh-TW")}</div>`;
        }
      }).then((messages) => messages.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)));
      folderCache.set(folder, messagesPromise);
    }
    const messages = await messagesPromise;
    if (request !== state.folderRequest) return;
    state.messages = messages;
    renderMessages();
  } catch (error) {
    folderCache.delete(folder);
    if (request !== state.folderRequest) return;
    console.error(error);
    els.messageList.innerHTML = `<div class="reader-empty">無法讀取這個資料夾</div>`;
  }
}

function renderMessages() {
  const query = state.filter.toLocaleLowerCase("zh-TW");
  const messages = query
    ? state.messages.filter((mail) => `${mail.sender} ${mail.senderEmail} ${mail.subject} ${mail.snippet}`.toLocaleLowerCase("zh-TW").includes(query))
    : state.messages;
  const visibleMessages = messages.slice(0, state.visibleCount);
  els.mailCount.textContent = `${messages.length.toLocaleString("zh-TW")} 封`;
  els.messageList.replaceChildren();
  if (!messages.length) {
    els.messageList.innerHTML = `<div class="reader-empty">${query ? "找不到符合搜尋條件的郵件" : "這個資料夾沒有可讀取的郵件"}</div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  visibleMessages.forEach((mail) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-row";
    button.innerHTML = `
      <span class="avatar">${escapeHTML(initials(mail.sender))}</span>
      <span class="message-main"><span class="sender">${escapeHTML(mail.sender)}</span><span class="subject">${escapeHTML(mail.subject)}</span><span class="snippet">${escapeHTML(mail.snippet || "沒有預覽內容")}</span></span>
      <span class="message-side"><span>${escapeHTML(formatDate(mail.date, true))}</span>${mail.attachmentCount ? icons.paperclip : ""}</span>`;
    button.addEventListener("click", async () => {
      root.querySelectorAll(".message-row.active").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      await openMessage(mail);
    });
    fragment.append(button);
  });
  els.messageList.append(fragment);
  if (visibleMessages.length < messages.length) {
    const loadMore = document.createElement("button");
    loadMore.type = "button";
    loadMore.className = "load-more";
    loadMore.textContent = `顯示更多（尚有 ${(messages.length - visibleMessages.length).toLocaleString("zh-TW")} 封）`;
    loadMore.addEventListener("click", () => {
      const scrollTop = els.messageList.scrollTop;
      state.visibleCount += DOM_PAGE_SIZE;
      renderMessages();
      els.messageList.scrollTop = scrollTop;
    });
    els.messageList.append(loadMore);
  }
}

async function openMessage(mail) {
  const request = ++state.messageRequest;
  state.selectedMessage = mail;
  if (!mail.hydrated) {
    els.reader.innerHTML = `<div class="reader-empty">正在讀取郵件內容…</div>`;
    await yieldToBrowser();
    try {
      const raw = mail.folder.getMessage(mail.nid);
      const fullMail = messageFromPST(raw, mail.folder, true);
      Object.assign(mail, fullMail, { nid: mail.nid, hydrated: true });
    } catch (error) {
      if (request !== state.messageRequest) return;
      console.error(error);
      els.reader.innerHTML = `<div class="reader-empty">無法讀取這封郵件</div>`;
      return;
    }
  }
  if (request !== state.messageRequest) return;
  renderReader(mail);
}

function getAttachments(mail) {
  const list = [];
  const count = mail.attachmentCount;
  for (let index = 0; index < count; index += 1) {
    try {
      const attachment = mail.raw.getAttachment?.(index) || mail.attachmentEntries[index];
      if (!attachment) continue;
      list.push(text(get(attachment, ["attachLongFilename", "attachFilename", "longFilename", "filename", "displayName"], `附件 ${index + 1}`), `附件 ${index + 1}`));
    } catch { /* 單一附件失敗不影響郵件內容 */ }
  }
  return list;
}

function attachmentObjects(mail) {
  if (mail.attachmentObjects) return mail.attachmentObjects;
  const objects = [];
  for (let index = 0; index < mail.attachmentCount; index += 1) {
    try {
      const attachment = mail.raw.getAttachment?.(index) || mail.attachmentEntries[index];
      if (attachment) objects.push(attachment);
    } catch { /* 損壞的附件略過 */ }
  }
  mail.attachmentObjects = objects;
  return objects;
}

function revokeObjectUrls() {
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = [];
}

function inferMime(filename) {
  const extension = text(filename).split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml" })[extension] || "application/octet-stream";
}

function resolveInlineImages(html, mail) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sources = new Map();
  for (const attachment of attachmentObjects(mail)) {
    const data = get(attachment, ["attachDataBinary"], null);
    if (!asBytes(data)) continue;
    const filename = text(get(attachment, ["attachLongFilename", "attachFilename"], ""));
    const mime = text(get(attachment, ["attachMimeTag"], inferMime(filename)));
    if (!mime.toLowerCase().startsWith("image/")) continue;
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    activeObjectUrls.push(url);
    const contentId = text(get(attachment, ["attachContentId"], "")).replace(/^<|>$/g, "");
    const location = text(get(attachment, ["attachContentLocation"], ""));
    if (contentId) sources.set(`cid:${contentId}`.toLowerCase(), url);
    if (location) sources.set(location.toLowerCase(), url);
    if (filename) sources.set(filename.toLowerCase(), url);
  }
  doc.querySelectorAll("img[src]").forEach((image) => {
    const source = image.getAttribute("src") || "";
    const filename = source.split("/").pop()?.toLowerCase() || "";
    const replacement = sources.get(source.toLowerCase()) || sources.get(filename);
    if (replacement) image.setAttribute("src", replacement);
  });
  return doc.body.innerHTML;
}

function renderReader(mail) {
  revokeObjectUrls();
  const attachments = getAttachments(mail);
  const senderLine = mail.senderEmail && !mail.sender.includes(mail.senderEmail)
    ? `${escapeHTML(mail.sender)} &lt;${escapeHTML(mail.senderEmail)}&gt;`
    : escapeHTML(mail.sender);
  const resolvedHTML = mail.htmlBody ? resolveInlineImages(mail.htmlBody, mail) : "";
  const hasRemoteImages = /<img\b[^>]+(?:src|srcset)=["']https?:/i.test(resolvedHTML);
  const safeHTML = resolvedHTML
    ? sanitizeMailHTML(resolvedHTML, Boolean(mail.allowRemoteImages))
    : `<pre>${escapeHTML(mail.plainBody || "（沒有郵件內文）")}</pre>`;
  els.reader.innerHTML = `
    <div class="reader-content">
      <header class="mail-head">
        <h1 class="mail-subject">${escapeHTML(mail.subject)}</h1>
        <div class="mail-person">
          <span class="avatar">${escapeHTML(initials(mail.sender))}</span>
          <span><div class="mail-from">${senderLine}</div><div class="mail-to">寄給：${escapeHTML(mail.to || "未提供收件者")}${mail.cc ? `　副本：${escapeHTML(mail.cc)}` : ""}</div></span>
          <time class="mail-date">${escapeHTML(formatDate(mail.date))}</time>
        </div>
      </header>
      ${hasRemoteImages && !mail.allowRemoteImages ? `<div class="mail-body-toolbar"><button class="remote-images" type="button">載入遠端圖片（可能連線至寄件者伺服器）</button></div>` : ""}
      <div class="mail-body">${safeHTML}</div>
      ${attachments.length ? `<div class="attachments">${attachments.map((name) => `<span class="attachment">${icons.paperclip}${escapeHTML(name)}</span>`).join("")}</div>` : ""}
    </div>`;
  els.reader.querySelector(".remote-images")?.addEventListener("click", () => {
    mail.allowRemoteImages = true;
    renderReader(mail);
  });
}

function sanitizeMailHTML(html, allowRemoteImages = false) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, form, input, button, meta, link, base").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
        node.removeAttribute(attribute.name);
      }
      if (!allowRemoteImages && (name === "src" || name === "srcset") && /^https?:/i.test(value)) node.removeAttribute(attribute.name);
      if (name === "style" && /url\s*\(/i.test(value)) node.removeAttribute(attribute.name);
    }
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  return doc.body.innerHTML;
}

async function openPST(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pst")) {
    window.alert("請選擇副檔名為 .pst 的 Outlook 資料檔。");
    return;
  }
  setBusy(true, `正在解析 ${file.name}…`);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    revokeObjectUrls();
    const buffer = await file.arrayBuffer();
    const pst = new PSTFile(buffer);
    const messageStore = pst.getMessageStore();
    const rootFolder = messageStore.getRootFolder();
    state.fileName = file.name;
    state.pst = pst;
    state.messages = [];
    state.filter = "";
    state.visibleCount = DOM_PAGE_SIZE;
    state.folderRequest += 1;
    state.messageRequest += 1;
    els.fileName.textContent = file.name;
    els.search.value = "";
    els.search.disabled = false;
    els.folderTree.replaceChildren();
    const rootButton = renderFolder(rootFolder, els.folderTree, true);
    rootButton.classList.add("active");
    await selectFolder(rootFolder);
  } catch (error) {
    console.error(error);
    els.messageList.innerHTML = `<div class="reader-empty">無法讀取這個 PST 檔案</div>`;
    window.alert(`PST 解析失敗：${error?.message || "未知錯誤"}\n\n檔案可能已加密、損壞，或使用解析器尚未支援的格式。`);
  } finally {
    setBusy(false);
    els.input.value = "";
  }
}

els.importButton.addEventListener("click", () => els.input.click());
els.input.addEventListener("change", () => openPST(els.input.files?.[0]));
els.search.addEventListener("input", () => {
  state.filter = els.search.value.trim();
  state.visibleCount = DOM_PAGE_SIZE;
  renderMessages();
});

export { openPST, sanitizeMailHTML };
