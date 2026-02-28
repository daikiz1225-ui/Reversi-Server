const { Redis } = require('@upstash/redis');

// --- 1. 接続設定 (REDIS_URL しかなくても動くように自動調整) ---
let redisConfig = {};

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    // 理想的な設定がある場合
    redisConfig = {
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
} else if (process.env.REDIS_URL) {
    // 【だいきの今の状態】REDIS_URL から REST 用に変換する
    const rawUrl = process.env.REDIS_URL; // https://:token@host
    try {
        const parts = rawUrl.replace('https://', '').split('@');
        const token = parts[0].replace(':', '');
        const host = parts[1];
        redisConfig = {
            url: `https://${host}`,
            token: token,
        };
    } catch (e) {
        console.error("REDIS_URL の解析に失敗しました");
    }
}

const redis = new Redis(redisConfig);

// --- 2. [game_logic.py] ロジックを 100% 移植 ---
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

// --- 3. メインサーバー処理 ---
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);

    try {
        // 生存確認 (GET /api)
        if (req.method === 'GET') {
            const pong = await redis.ping();
            return res.status(200).json({
                message: "Server is Online!",
                database: pong === "PONG" ? "Connected" : "Error",
                using: process.env.UPSTASH_REDIS_REST_URL ? "REST_URL" : "REDIS_URL_AUTO"
            });
        }

        // ユーザー登録・BANチェック (db.py 移植)
        if (pathname.includes('register') && req.method === 'POST') {
            const { username, password } = req.body;
            if (await redis.sismember("ban_list", username)) return res.status(403).json({ error: "BANユーザーです" });
            if (await redis.exists(`user:${username}`)) return res.status(400).json({ error: "名前重複" });
            await redis.hset(`user:${username}`, { password, rate: 1000, suspicious: 0 });
            return res.status(200).json({ message: "OK" });
        }

        // 駒打ち判定 (game_logic.py 移植)
        if (pathname.includes('move') && req.method === 'POST') {
            const { board, r, c, color } = req.body;
            if (!gameLogic.canPlace(board, r, c, color)) return res.status(400).json({ error: "置けません" });
            return res.status(200).json({ board: gameLogic.executeMove(board, r, c, color) });
        }

        return res.status(404).json({ error: "Not Found", path: pathname });

    } catch (e) {
        return res.status(500).json({ 
            error: "Redis Connection Error", 
            message: e.message,
            debug: { has_redis_url: !!process.env.REDIS_URL }
        });
    }
}
