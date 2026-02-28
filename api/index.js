const { Redis } = require('@upstash/redis');

// 1. データベース接続設定
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 2. オセロの全ロジック (game_logic.py を完全に移植)
const gameLogic = {
    canPlace(board, r, c, color) {
        if (board[r][c] !== 0) return false;
        const opponent = 3 - color;
        const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let [dr, dc] of directions) {
            if (this.hasFlippable(board, r, c, dr, dc, color, opponent)) return true;
        }
        return false;
    },
    hasFlippable(board, r, c, dr, dc, color, opponent) {
        let currR = r + dr, currC = c + dc;
        if (!(currR >= 0 && currR < 8 && currC >= 0 && currC < 8) || board[currR][currC] !== opponent) return false;
        while (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            if (board[currR][currC] === 0) return false;
            if (board[currR][currC] === color) return true;
            currR += dr; currC += dc;
        }
        return false;
    },
    executeMove(board, r, c, color) {
        const newBoard = board.map(row => [...row]);
        newBoard[r][c] = color;
        const opponent = 3 - color;
        const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let [dr, dc] of directions) {
            if (this.hasFlippable(newBoard, r, c, dr, dc, color, opponent)) {
                let currR = r + dr, currC = c + dc;
                while (newBoard[currR][currC] === opponent) {
                    newBoard[currR][currC] = color;
                    currR += dr; currC += dc;
                }
            }
        }
        return newBoard;
    }
};

// 3. メインの通信処理 (CORS対応済み)
export default async function handler(req, res) {
    // 許可証（CORSヘッダー）をセット
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // ブラウザの事前確認（OPTIONS）に対応
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);

    try {
        // [GET] 生存確認用
        if (req.method === 'GET' && (pathname === '/api' || pathname === '/api/')) {
            const pong = await redis.ping();
            return res.status(200).json({
                message: "Server Online!",
                database: pong === "PONG" ? "Connected" : "Error",
                info: "Game logic and DB sync ready."
            });
        }

        // [POST] ユーザー登録 (db.py 移植)
        if (pathname.includes('register') && req.method === 'POST') {
            const { username, password } = req.body;
            if (await redis.sismember("ban_list", username)) {
                return res.status(403).json({ error: "あなたはBANされています" });
            }
            if (await redis.exists(`user:${username}`)) {
                return res.status(400).json({ error: "その名前は既に使われています" });
            }
            await redis.hset(`user:${username}`, { password, rate: 1000, suspicious: 0 });
            return res.status(200).json({ message: "OK" });
        }

        // [POST] 駒打ち処理
        if (pathname.includes('move') && req.method === 'POST') {
            const { board, r, c, color } = req.body;
            if (!gameLogic.canPlace(board, r, c, color)) {
                return res.status(400).json({ error: "置けません" });
            }
            const nextBoard = gameLogic.executeMove(board, r, c, color);
            return res.status(200).json({ board: nextBoard });
        }

        return res.status(404).json({ error: "Not Found" });

    } catch (e) {
        console.error("Server Error:", e);
        return res.status(500).json({ 
            error: "Internal Server Error", 
            message: e.message 
        });
    }
}
