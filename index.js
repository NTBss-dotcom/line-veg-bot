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
  // 自動將俗名轉為學名（例如：高麗菜 -> 甘藍）
  const targetName = CROP_MAP[userInput] || userInput;

  try {
    // 使用 axios params 自動處理網址參數與 UTF-8 編碼，避免篩選條件失效
    const url = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
    const response = await axios.get(url, {
      params: {
        Crop: targetName
      },
      timeout: 8000
    });

    const resData = response.data;

    let rawMatches = [];
    if (resData && Array.isArray(resData.Data)) {
      rawMatches = resData.Data;
    } else if (resData && Array.isArray(resData.RSData)) {
      rawMatches = resData.RSData;
    } else if (Array.isArray(resData)) {
      rawMatches = resData;
    }

    // 在伺服器端二次嚴格過濾，確保資料名稱確實包含使用者查詢的作物
    const matches = rawMatches.filter(item => 
      item.CropName && (item.CropName.includes(targetName) || item.CropName.includes(userInput))
    );

    console.log(`查詢「${targetName}」成功，篩選後共 ${matches.length} 筆`);

    if (!matches || matches.length === 0) {
      return `查無「${userInput}」（學名：${targetName}）最新的批發行情。\n\n💡 提示：若逢週一/休市可能無資料，請試試輸入：甘藍、香蕉、鳳梨、蘿蔔。`;
    }

    const realCropName = matches[0].CropName || targetName;
    const transDate = matches[0].TransDate || '';
    let msg = `🥬 【${realCropName}】最新批發市場行情 (${transDate})：\n-------------------------\n`;

    // 取前 5 筆市場資料
    const list = matches.slice(0, 5);
    for (const item of list) {
      const market = item.MarketName || '批發市場';
      const avg = item.Avg_Price !== undefined ? item.Avg_Price : '-';
      const upper = item.Upper_Price !== undefined ? item.Upper_Price : '-';
      const lower = item.Lower_Price !== undefined ? item.Lower_Price : '-';

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
