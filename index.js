const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// 常見俗名與官方學名對照表
const CROP_MAP = {
  '高麗菜': '甘藍',
  '地瓜': '甘薯',
  '空心菜': '蕹菜',
  '小白菜': '白菜',
  '大白菜': '包心白菜',
  '青花菜': '綠花椰',
  '花椰菜': '花椰菜',
  '小黃瓜': '黃瓜',
  '大黃瓜': '胡瓜',
  '刺瓜': '胡瓜',
  '玉米': '甜玉米',
  '蕃茄': '番茄',
  '香蕉': '香蕉',
  '鳳梨': '鳳梨'
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
  // 1. 自動把俗名轉為學名（如：高麗菜 -> 甘藍）
  const queryName = CROP_MAP[userInput] || userInput;

  try {
    const url = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
    
    // 呼叫 API 查詢
    const response = await axios.get(url, { params: { Crop: queryName } });
    let data = response.data.RSData;

    // 2. 如果查無資料，嘗試不用精確比對，從 API 全量資料中做模糊比對
    if (!data || data.length === 0) {
      const allResponse = await axios.get(url);
      const allData = allResponse.data.RSData || [];
      data = allData.filter(item => item.CropName && item.CropName.includes(userInput));
    }

    if (!data || data.length === 0) {
      return `查無「${userInput}」最新的交易數據。\n\n💡 搜尋小撇步：\n可以嘗試輸入官方名稱，例如：\n• 高麗菜 ➔ 輸入「甘藍」\n• 空心菜 ➔ 輸入「蕹菜」\n• 地瓜 ➔ 輸入「甘薯」\n（若逢週一市場休市也會無資料喔！）`;
    }

    // 取得資料顯示的作物名稱
    const displayName = data[0].CropName || userInput;
    let msg = `🥬 【${displayName}】最新市場行情：\n-------------------------\n`;
    
    // 過濾並呈現前 5 筆市場資料
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
