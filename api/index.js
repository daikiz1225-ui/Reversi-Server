const { Redis } = require('@upstash/redis');

// --- [db.py の移植] データベース接続設定 ---
const redis = new Redis({
  url: process.env.REDIS_URL.includes('https') ? process.env.REDIS_URL : `https://${process.env.REDIS_URL.split('@')[1]}`,
  token: process.env.REDIS_URL.split('@')[0].replace('https://:', '').replace(':', ''),
});

// --- [game_logic.py の完全移植] ---
const gameLogic = {
    // 置ける場所をリストで返す
    getValidMoves(board, color) {
        let moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.canPlace(board, r, c, color)) {
                    moves.append([r, c]);
                }
            }
        }
        return moves;
    },

    // そこに置けるかチェック
    canPlace(board, r, c, color) {
        if (board[r][c] !== 0) return false;
        const opponent = 3 - color;
        const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let i = 0; i < directions.length; i++) {
            const [dr, dc] = directions[i];
            if (this.hasFlippable(board, r, c, dr, dc, color, opponent)) {
                return true;
            }
        }
        return false;
    },

    // ひっくり返せる石があるか
    hasFlippable(board, r, c, dr, dc, color, opponent) {
        let currR = r + dr;
        let currC = c + dc;
        if (!(currR >= 0 && currR < 8 && currC >= 0 && currC < 8) || board[currR][currC] !== opponent) {
            return false;
        }
        while (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            if (board[currR][currC] === 0) return false;
            if (board[currR][currC] === color) return true;
            currR += dr;
            currC += dc;
        }
        return false;
    },

    // 実際に石を置いて盤面を更新する
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

// --- [メインハンドラー] ---
export default async function handler(req, res) {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = req.url || "";

    try {
        // データベース接続テスト (GET /api)
        // だいき、ここが Connected を出すための心臓部だ！
        if (req.method === 'GET') {
            const pong = await redis.ping();
            return res.status(200).json({
                message: "Server is Online!",
                database: pong === "PONG" ? "Connected" : "Error",
                status: "Ready for Reversi"
            });
        }

        // ユーザー登録・BANチェック (POST /api/auth/register)
        if (url.includes('register') && req.method === 'POST') {
            const { username, password } = req.body;
            
            // BANリストに入っていないか (is_banned 移植)
            const isBanned = await redis.sismember("ban_list", username);
            if (isBanned) return res.status(403).json({ error: "あなたはBANされています" });

            // 重複チェック (check_name_exists 移植)
            const exists = await redis.exists(`user:${username}`);
            if (exists) return res.status(400).json({ error: "名前が既に使われています" });

            // 保存 (save_user 移植)
            await redis.hset(`user:${username}`, {
                password: password,
                rate: 1000,
                suspicious_count: 0
            });
            return res.status(200).json({ message: "OK" });
        }

        // 不正通報 (POST /api/report)
        if (url.includes('report') && req.method === 'POST') {
            const { username } = req.body;
            const count = await redis.hincrby(`user:${username}`, "suspicious_count", 1);
            if (count >= 5) {
                await redis.sadd("ban_list", username);
                return res.status(200).json({ status: "BANNED" });
            }
            return res.status(200).json({ status: "WARNED", count });
        }

        // 駒を置く (POST /api/game/move)
        if (url.includes('move') && req.method === 'POST') {
            const { board, r, c, color, username } = req.body;
            if (!gameLogic.canPlace(board, r, c, color)) {
                return res.status(400).json({ error: "そこには置けません" });
            }
            const nextBoard = gameLogic.executeMove(board, r, c, color);
            return res.status(200).json({ board: nextBoard });
        }

        return res.status(404).json({ error: "Not Found", path: url });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
