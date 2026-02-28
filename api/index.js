const { Redis } = require('@upstash/redis');

// 環境変数から接続情報を読み込む
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // CORS設定（ブラウザから通信できるようにする）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // データベースに接続テスト
    const pong = await redis.ping();
    
    return res.status(200).json({
      message: "Server Online!",
      database: pong === "PONG" ? "Connected" : "Error",
      info: "Vercel + Upstash Redis is working!"
    });
  } catch (e) {
    return res.status(500).json({ 
      error: "Connection Failed", 
      message: e.message 
    });
  }
}
