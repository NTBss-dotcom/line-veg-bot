const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// 常見俗名對照表
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
  '蕃茄': '番茄'
};

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
    replyText = '系統查詢時發生錯誤，請稍後再試。';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

async function getVegPrice(userInput) {
  const targetName = CROP_MAP[userInput] || userInput;

  try {
    // 改用開放資料平臺最穩定的蔬菜交易 JSON 資料源
    const url = 'https://data.moa.gov.tw/Service/OpenData/FromM/FarmTransData.aspx';
    
    const response = await axios.get(url, { timeout: 10000 });
    const allData = response.data;

    if (!Array.isArray(allData) || allData.length === 0) {
      return '目前無法取得批發市場行情資料，請稍後再試。';
    }

    // 篩選包含關鍵字的作物資料
    const matches = allData.filter(item => 
      item.CropName && (item.CropName.includes(targetName) || item.CropName.includes(userInput))
    );

    if (matches.length === 0) {
      // 若查無資料，隨機抓 3 個當前有資料的品項範例給用戶
      const sampleCrops = [...new Set(allData.map(i => i.CropName))].filter(Boolean).slice(0, 3).join('、');
      return `查無「${userInput}」目前的批發價格。\n\n💡 有資料的作物範例：\n${sampleCrops}\n\n請試著輸入上述名稱！`;
    }

    const realCropName = matches[0].CropName;
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
    console.error('API 呼叫失敗:', error.message);
    return '無法連線至行情資料庫，請稍後再試。';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
