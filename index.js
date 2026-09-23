const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const app = express();

// 1. 根目錄測試：方便用手機瀏覽器檢查伺服器死活
app.get('/', (req, res) => {
  res.send('LINE Bot Server is Running!');
});

// 2. Webhook 接收點：收到任何 LINE 的請求，第一時間強制印在 Logs 上
app.post('/callback', line.middleware(config), (req, res) => {
  console.log('>>> 成功接收到 LINE 的 Webhook 事件！<<<');
  console.log(JSON.stringify(req.body));

  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('處理事件失敗:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const client = new line.Client(config);
  // 不管輸入什麼，強制測試回覆文字
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `收到你的訊息了：${event.message.text}`
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
