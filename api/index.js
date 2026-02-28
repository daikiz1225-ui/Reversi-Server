const { Redis } = require('@upstash/redis');

// --- 1. 接続設定 (db.py の Redis.from_env() を完璧に再現) ---
const redis = new Redis({
  url: process.env.REDIS_URL.includes('https') ? process.env.REDIS_URL : `https://${process.env.REDIS_URL.split('@')[1]}`,
  token: process.env.REDIS_URL.split('@')[0].replace('https://:', '').replace(':', ''),
});

// --- 2. [game_logic.py] ロジックを100%移植 ---
const gameLogic = {
    getValidMoves(board, color) {
        let moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.canPlace(board, r, c, color)) {
                    moves.push([r, c]);
                }
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
        for (let [dr, dc] of directions) {
            if (this.hasFlippable(newBoard, r, c, dr, dc, color, opponent)) {
                let currR = r + dr;
                let currC = c + dc;
                while (newBoard[currR][currC] === opponent) {
                    newBoard[currR][currC] = color;
                    currR += dr;
                    currC += dc;
                }
            }
        }
        return newBoard;
    }
};

// --- 3. メインサーバー処理 (全ての命令をここで受ける) ---
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = req.url || "";

    try {
        // [生存確認用] GETアクセスされたら接続テスト
        if (req.method === 'GET') {
            const pong = await redis.ping();
            return res.status(200).json({
                message: "Server Online!",
                database: pong === "PONG" ? "Connected" : "Error",
                info: "Ready to Play"
            });
        }

        // [db.py 移植] ユーザー登録 & BANチェック
        if (url.includes('register') && req.method === 'POST') {
            const { username, password } = req.body;
            // is_banned 移植
            if (await redis.sismember("ban_list", username)) return res.status(403).json({ error: "BANされています" });
            // check_name_exists 移植
            if (await redis.exists(`user:${username}`)) return res.status(400).json({ error: "名前重複" });
            // save_user 移植
            await redis.hset(`user:${username}`, { password, rate: 1000, suspicious: 0 });
            return res.status(200).json({ message: "OK" });
        }

        // [game_logic.py 移植] 駒を置く判定
        if (url.includes('move') && req.method === 'POST') {
            const { board, r, c, color } = req.body;
            if (!gameLogic.canPlace(board, r, c, color)) return res.status(400).json({ error: "置けません" });
            const nextBoard = gameLogic.executeMove(board, r, c, color);
            return res.status(200).json({ board: nextBoard });
        }

        return res.status(404).json({ error: "Endpoint Not Found", path: url });

    } catch (e) {
        // IMG_0721のエラーをここで捕まえて詳細を出す
        return res.status(500).json({ error: "Server Error", message: e.message });
    }
}
