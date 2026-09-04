#!/bin/bash
cd "$(dirname "$0")"
PORT=8934

if ! lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "啟動本機伺服器 (port $PORT)..."
  nohup python3 -m http.server $PORT > /dev/null 2>&1 &
  disown
  sleep 1
else
  echo "伺服器已經在跑了,直接開瀏覽器。"
fi

open "http://localhost:$PORT/index.html"
echo "完成,可以關閉這個視窗了。"
sleep 2
