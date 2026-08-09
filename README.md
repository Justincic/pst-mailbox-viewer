# PST 信箱瀏覽器

目前版本：**v2.2.1**

一個在瀏覽器本機讀取 Outlook PST 檔案的三欄式信箱介面。PST 內容不會上傳到伺服器。

## 功能

- PST 資料夾樹狀瀏覽
- 郵件列表、寄件者、日期與內文預覽
- 寄件者、主旨與內文搜尋
- 附件名稱顯示與下載
- 自動解析 PST 裡以附件保存的 EML 郵件
- UTF-8、Big5、GBK／GB18030 等常見郵件編碼辨識
- PST 內嵌 CID 圖片顯示與可選擇的遠端圖片載入
- 郵件 HTML 安全過濾及遠端追蹤資源阻擋
- 全程在使用者瀏覽器本機解析

## 線上使用

啟用 GitHub Pages 後，網站會發布在：

`https://justincic.github.io/pst-mailbox-viewer/`

## 本機啟動

macOS 使用者可雙擊 `啟動PST信箱.command`，或在終端機執行：

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

建置結果會放在 `dist/`。

## 更新發布

將變更推送到 `main` 分支後，GitHub Actions 會自動重新建置並發布 GitHub Pages。

```bash
git add .
git commit -m "描述這次更新"
git push
```

## 限制

本專案使用唯讀的 [`pst-parser`](https://github.com/IJMacD/pst-parser)。部分加密、損壞或特殊格式的 PST 可能無法解析。目前僅顯示附件名稱，不提供附件內容下載。

## 授權

[MIT](LICENSE)
