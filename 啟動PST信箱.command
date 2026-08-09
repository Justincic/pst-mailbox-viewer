#!/bin/zsh

set -u

cd -- "${0:A:h}" || exit 1

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "找不到 Node.js 或 npm。"
  echo "請先安裝 Node.js：https://nodejs.org/"
  echo
  read -r "?按 Enter 關閉…"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "第一次啟動，正在安裝必要套件…"
  npm install || {
    echo
    echo "套件安裝失敗，請確認網路連線後重試。"
    read -r "?按 Enter 關閉…"
    exit 1
  }
fi

echo "正在啟動 PST 信箱瀏覽器…"
echo "瀏覽器開啟後，請保持這個終端機視窗開啟。"
echo "要關閉程式時，回到此視窗按 Control + C。"
echo

vite_args=(--host 127.0.0.1)
if [[ "${PST_NO_OPEN:-0}" != "1" ]]; then
  vite_args+=(--open)
fi

npm run dev -- "${vite_args[@]}"

exit_code=$?
if (( exit_code != 0 )); then
  echo
  echo "啟動失敗，錯誤代碼：${exit_code}"
  read -r "?按 Enter 關閉…"
fi

exit "$exit_code"
