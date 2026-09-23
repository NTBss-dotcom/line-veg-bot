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

// 取得民國年日期格式 (例如: 115.09.23)
function getROCDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear() - 1911;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

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
  const queryName = CROP_MAP[userInput] || userInput;
  const todayROC = getROCDate(0);
  const yesterdayROC = getROCDate(1);

  try {
    const url = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
    
    // 嘗試查詢今天的資料
    let response = await axios.get(url, {
      params: {
        Start_time: todayROC,
        End_time: todayROC,
        Crop: queryName
      }
    });

    let data = response.data.RSData || [];

    // 如果今天查無資料（可能休市或尚未開盤），自動退回查詢昨天的資料
    let isYesterdayData = false;
    if (data.length === 0) {
      response = await axios.get(url, {
        params: {
          Start_time: yesterdayROC,
          End_time: yesterdayROC,
          Crop: queryName
        }
      });
      data = response.data.RSData || [];
      if (data.length > 0) isYesterdayData = true;
    }

    if (data.length === 0) {
      return `查無「${userInput}」近兩日的批發市場行情。\n\n💡 建議測試關鍵字：\n• 輸入「甘藍」（高麗菜）\n• 輸入「香蕉」\n• 輸入「蘿蔔」`;
    }

    const displayName = data[0].CropName || userInput;
    const dateNotice = isYesterdayData ? ` (休市/未開盤，顯示昨日行情)` : ``;
    let msg = `🥬 【${displayName}】最新市場行情${dateNotice}：\n-------------------------\n`;
    
    // 顯示前 5 筆市場資料
    data.slice(0, 5).forEach((item) => {
      msg += `📍 市場：${item.MarketName}\n`;
      msg += `💰 平均價：${item.Avg_Price} 元/公斤\n`;
      msg += `📈 上價：${item.Upper_Price} | 📉 下價：${item.Lower_Price}\n`;
      msg += `-------------------------\n`;
    });

    return msg;

  } catch (error) {
    console.error('API 呼叫失敗:', error);
    return '無法連線至農業部資料庫，請稍後再試。';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
