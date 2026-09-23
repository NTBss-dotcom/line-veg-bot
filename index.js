const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// 俗名對照表
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
    replyText = '抱歉，系統查詢時發生錯誤，請稍後再試。';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

async function getVegPrice(userInput) {
  const targetName = CROP_MAP[userInput] || userInput;

  try {
    const url = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
    
    // 模擬一般瀏覽器發送請求，防止被農業部 API 阻擋
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json'
      },
      timeout: 8000
    });

    const allData = response.data.RSData || [];

    if (allData.length === 0) {
      return '農業部開放資料平臺目前維護中，暫無最新資料。';
    }

    // 在本機伺服器端過濾含有關鍵字的資料
    const matches = allData.filter(item => 
      item.CropName && (item.CropName.includes(targetName) || item.CropName.includes(userInput))
    );

    if (matches.length === 0) {
      // 隨機列出當前資料庫有的 3 個作物名稱給用戶參考
      const sampleCrops = [...new Set(allData.map(i => i.CropName))].slice(0, 3).join('、');
      return `查無「${userInput}」的行情資料。\n\n目前資料庫中有資料的作物範例：\n${sampleCrops}\n\n請嘗試輸入上方範例名稱！`;
    }

    const realCropName = matches[0].CropName;
    let msg = `🥬 【${realCropName}】最新市場行情：\n-------------------------\n`;
    
    matches.slice(0, 5).forEach((item) => {
      msg += `📍 市場：${item.MarketName}\n`;
      msg += `💰 平均價：${item.Avg_Price} 元/公斤\n`;
      msg += `📈 上價：${item.Upper_Price} | 📉 下價：${item.Lower_Price}\n`;
      msg += `-------------------------\n`;
    });

    return msg;

  } catch (error) {
    console.error('API 呼叫失敗:', error.message);
    return '連線至農業部資料庫逾時或失敗，請稍後再試。';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
