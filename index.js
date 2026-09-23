const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('LINE API 錯誤:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userText = event.message.text.trim();
  let replyText = '';

  try {
    replyText = await getVegPrice(userText);
  } catch (err) {
    console.error('查詢過程發生錯誤:', err);
    replyText = '抱歉，系統查詢時發生錯誤，請稍後再試。';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

async function getVegPrice(cropName) {
  try {
    const url = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
    const response = await axios.get(url, { params: { Crop: cropName } });
    const data = response.data.RSData;

    if (!data || data.length === 0) {
      return `查無「${cropName}」最新的交易數據，請嘗試輸入其他作物名稱（例如：甘藍、蘿蔔、鳳梨）。`;
    }

    let msg = `🥬 【${cropName}】最新市場行情：\n-------------------------\n`;
    data.slice(0, 5).forEach((item) => {
      msg += `📍 市場：${item.MarketName}\n`;
      msg += `💰 平均價：${item.Avg_Price} 元/公斤\n`;
      msg += `📈 上價：${item.Upper_Price} | 📉 下價：${item.Lower_Price}\n`;
      msg += `-------------------------\n`;
    });

    return msg;
  } catch (error) {
    console.error('農業部 API 呼叫失敗:', error);
    return '無法連線至農業部資料庫，請稍後再試。';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
