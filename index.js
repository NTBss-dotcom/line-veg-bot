const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const app = express();

// 常見俗名與官方學名對照表
const CROP_MAP = {
  '高麗菜': '甘藍',
  '地瓜': '甘薯',
  '空心菜': '蕹菜',
  '小白菜': '白菜',
  '大白菜': '包心白菜',
  '青花菜': '綠花椰',
  '小黃瓜': '黃瓜',
  '大黃瓜': '胡瓜',
  '玉米': '甜玉米',
  '蕃茄': '番茄',
  '鳳梨': '鳳梨',
  '香蕉': '香蕉'
};

app.get('/', (req, res) => {
  res.send('LINE 農產品價格查詢機器人運作中！');
});

app.post('/callback', line.middleware(config), (req, res) => {
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

  const userText = event.message.text.trim();
  console.log(`收到查詢要求: ${userText}`);

  const client = new line.Client(config);
  let replyText = '';

  try {
    replyText = await getVegPrice(userText);
  } catch (err) {
    console.error('處理查詢時發生例外錯誤:', err);
    replyText = '系統處理資料時發生錯誤，請稍後再試。';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

async function getVegPrice(userInput) {
  const targetName = CROP_MAP[userInput] || userInput;
  const url = `https://data.moa.gov.tw/api/v1/AgriProductsTransType/?$filter=CropName+like+${encodeURIComponent(targetName)}`;

  try {
    const response = await axios.get(url, { timeout: 8000 });
    const resData = response.data;

    // 自動相容不同的 API 回傳結構 (RSData 或是直接的陣列)
    let matches = [];
    if (resData && resData.RSData) {
      matches = resData.RSData;
    } else if (Array.isArray(resData)) {
      matches = resData;
    }

    console.log(`查詢結果筆數: ${matches.length}`);

    if (!matches || matches.length === 0) {
      return `查無「${userInput}」（學名：${targetName}）的批發行情。\n\n提示：若逢週一休市可能無資料，請試試輸入：甘藍、蘿蔔、香蕉。`;
    }

    // 取得資料顯示名稱，相容大小寫欄位
    const realCropName = matches[0].CropName || matches[0].cropName || targetName;
    let msg = `🥬 【${realCropName}】最新批發市場行情：\n-------------------------\n`;

    // 格式化前 5 筆市場價格資訊
    const list = matches.slice(0, 5);
    for (const item of list) {
      const market = item.MarketName || item.marketName || '批發市場';
      const avg = item.Avg_Price || item.avg_Price || item.AvgPrice || '-';
      const upper = item.Upper_Price || item.upper_Price || item.UpperPrice || '-';
      const lower = item.Lower_Price || item.lower_Price || item.LowerPrice || '-';

      msg += `📍 市場：${market}\n`;
      msg += `💰 平均價：${avg} 元/公斤\n`;
      msg += `📈 上價：${upper} | 📉 下價：${lower}\n`;
      msg += `-------------------------\n`;
    }

    return msg;

  } catch (error) {
    console.error('API 請求失敗:', error.message);
    return `無法連線至農業部資料庫（${error.message}），請稍後再試。`;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
