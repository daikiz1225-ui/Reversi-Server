const { Redis } = require('@upstash/redis');

// --- 1. [接続設定] だいきの指定通り、REST用の変数のみを使用 ---
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// --- 2. [game_logic.py 移植] オセロ判定ロジック ---
const gameLogic = {
    getValidMoves(board, color) {
        let moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.canPlace(board, r, c, color)) moves.push([r, c]);
            }
        }
        return moves;
    },
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

// --- 3. [メインハンドラー] ---
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);

    try {
        // 生存確認 (GET /api)
        if (req.method === 'GET' && (pathname === '/api' || pathname === '/api/')) {
            const pong = await redis.ping();
            return res.status(200).json({
                message: "Server is Online!",
                database: pong === "PONG" ? "Connected" : "Error",
                status: "Ready"
            });
        }

        // ユーザー登録 (db.py 移植)
        if (pathname.includes('register') && req.method === 'POST') {
            const { username, password } = req.body;
            if (await redis.sismember("ban_list", username)) return res.status(403).json({ error: "BANされています" });
            if (await redis.exists(`user:${username}`)) return res.status(400).json({ error: "名前重複" });
            await redis.hset(`user:${username}`, { password, rate: 1000, suspicious: 0 });
            return res.status(200).json({ message: "OK" });
        }

        // 駒打ち判定 (game_logic.py 移植)
        if (pathname.includes('move') && req.method === 'POST') {
            const { board, r, c, color } = req.body;
            if (!gameLogic.canPlace(board, r, c, color)) return res.status(400).json({ error: "そこには置けません" });
            const nextBoard = gameLogic.executeMove(board, r, c, color);
            return res.status(200).json({ board: nextBoard });
        }

        return res.status(404).json({ error: "Not Found", path: pathname });

    } catch (e) {
        return res.status(500).json({ 
            error: "Redis Connection Error", 
            message: e.message,
            debug_info: {
                url_exists: !!process.env.UPSTASH_REDIS_REST_URL,
                token_exists: !!process.env.UPSTASH_REDIS_REST_TOKEN,
                env_keys: Object.keys(process.env).filter(k => k.includes('REDIS'))
            }
        });
    }
}
