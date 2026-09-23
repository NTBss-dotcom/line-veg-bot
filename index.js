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
  console.log('>>> 收到 LINE 訊息請求 <<<');

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
  console.log(`用戶查詢關鍵字: ${userText}`);

  const client = new line.Client(config);
  let replyText = '';

  try {
    replyText = await getVegPrice(userText);
  } catch (err) {
    console.error('查詢過程發生錯誤:', err);
    replyText = '系統查詢行情時發生錯誤，請稍後再試。';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

async function getVegPrice(userInput) {
  // 自動轉換俗名 (例如: 高麗菜 -> 甘藍)
  const targetName = CROP_MAP[userInput] || userInput;

  try {
    // 使用支援 $filter 條件查詢的 API 端點，大幅縮減資料傳輸量
    const url = `https://data.moa.gov.tw/api/v1/AgriProductsTransType/?$filter=CropName+like+${encodeURIComponent(targetName)}`;
    
    console.log(`發送輕量 API 請求: ${url}`);
    const response = await axios.get(url, { timeout: 8000 });
    const resultData = response.data;

    const matches = resultData.RSData || [];

    if (!Array.isArray(matches) || matches.length === 0) {
      return `查無「${userInput}」（學名：${targetName}）最新的批發市場價格。\n\n💡 說明：\n1. 若逢週一/市場休市，當天可能無資料。\n2. 建議嘗試搜尋其他熱門品項，如：甘藍、蘿蔔、香蕉、鳳梨。`;
    }

    const realCropName = matches[0].CropName || targetName;
    let msg = `🥬 【${realCropName}】最新批發市場行情：\n-------------------------\n`;
    
    // 取前 5 筆市場資料
    matches.slice(0, 5).forEach((item) => {
      const market = item.MarketName || '未知市場';
      const avg = item.Avg_Price || '-';
      const upper = item.Upper_Price || '-';
      const lower = item.Lower_Price || '-';
      
      msg += `📍 市場：${market}\n`;
      msg += `💰 平均價：${avg} 元/公斤\n`;
      msg += `📈 上價：${upper} | 📉 下價：${lower}\n`;
      msg += `-------------------------\n`;
    });

    return msg;

  } catch (error) {
    console.error('API 呼叫失敗原因:', error.message);
    return '連線至農業部資料庫逾時，請稍後再試。';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
