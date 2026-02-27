const { Redis } = require('@upstash/redis');

// --- データベース接続設定 (db.py の Node.js版) ---
const redis = new Redis({
  url: process.env.REDIS_URL.includes('https') ? process.env.REDIS_URL : `https://${process.env.REDIS_URL.split('@')[1]}`,
  token: process.env.REDIS_URL.split('@')[0].replace('https://:', '').replace(':', ''),
});

// --- ゲームロジック (game_logic.py の完全移植) ---
const gameLogic = {
  canPlace(board, r, c, color) {
    if (board[r][c] !== 0) return false;
    const opponent = 3 - color;
    const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    return directions.some(([dr, dc]) => this.hasFlippable(board, r, c, dr, dc, color, opponent));
  },
  hasFlippable(board, r, c, dr, dc, color, opponent) {
    let currR = r + dr;
    let currC = c + dc;
    if (!(currR >= 0 && currR < 8 && currC >= 0 && currC < 8) || board[currR][currC] !== opponent) return false;
    while (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
      if (board[currR][currC] === 0) return false;
      if (board[currR][currC] === color) return true;
      currR += dr;
      currC += dc;
    }
    return false;
  },
  executeMove(board, r, c, color) {
    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = color;
    const opponent = 3 - color;
    const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    directions.forEach(([dr, dc]) => {
      if (this.hasFlippable(newBoard, r, c, dr, dc, color, opponent)) {
        let currR = r + dr;
        let currC = c + dc;
        while (newBoard[currR][currC] === opponent) {
          newBoard[currR][currC] = color;
          currR += dr;
          currC += dc;
        }
      }
    });
    return newBoard;
  }
};

// --- メインサーバー処理 ---
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  try {
    // 1. 接続確認 (デバッグ用)
    if (req.method === 'GET' && pathname === '/api/auth/register') {
      await redis.ping();
      return res.status(200).json({ message: "Server Online", database: "Connected" });
    }

    // 2. ユーザー登録 & BANチェック (db.py ロジック)
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const { username, password } = req.body;
      const isBanned = await redis.sismember("ban_list", username);
      if (isBanned) return res.status(403).json({ error: "あなたはBANされています" });

      const exists = await redis.exists(`user:${username}`);
      if (exists) return res.status(400).json({ error: "名前重複" });

      const userData = {
        password,
        rate: 1000,
        suspicious_count: 0,
        isAdmin: (password === "daiki1225").toString()
      };
      await redis.hset(`user:${username}`, userData);
      return res.status(200).json({ message: "OK", isAdmin: userData.isAdmin === "true" });
    }

    // 3. 不正監視通報システム (だいきのこだわり！)
    if (pathname === '/api/report' && req.method === 'POST') {
      const { username } = req.body;
      const count = await redis.hincrby(`user:${username}`, "suspicious_count", 1);
      if (count >= 5) {
        await redis.sadd("ban_list", username);
        return res.status(200).json({ status: "BANNED", message: "5回目の通報によりBANされました" });
      }
      return res.status(200).json({ status: "WARNED", count });
    }

    // 4. ゲームアクション (駒を置く判定：game_logic.py 連携)
    if (pathname === '/api/game/move' && req.method === 'POST') {
      const { board, r, c, color, username } = req.body;
      // サーバー側で置けるか最終チェック
      if (!gameLogic.canPlace(board, r, c, color)) {
        return res.status(400).json({ error: "そこには置けません（サーバー判定）" });
      }
      const nextBoard = gameLogic.executeMove(board, r, c, color);
      return res.status(200).json({ board: nextBoard });
    }

    return res.status(404).json({ error: "Not Found" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
