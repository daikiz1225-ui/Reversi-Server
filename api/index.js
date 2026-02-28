const { Redis } = require('@upstash/redis');

// --- 1. データベース接続設定 ---
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// --- 2. [game_logic.py] のロジックを 100% 移植 ---
const gameLogic = {
    // 全ての有効な手をリストアップ
    getValidMoves(board, color) {
        let moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.canPlace(board, r, c, color)) moves.push([r, c]);
            }
        }
        return moves;
    },

    // 特定のマスに置けるかチェック
    canPlace(board, r, c, color) {
        // すでに石がある場所はNG
        if (board[r][c] !== 0) return false;

        const opponent = 3 - color;
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        // 8方向のいずれかで石をひっくり返せるか
        for (let [dr, dc] of directions) {
            if (this.hasFlippable(board, r, c, dr, dc, color, opponent)) {
                return true;
            }
        }
        return false;
    },

    // 指定方向にひっくり返せる相手の石があるか確認
    hasFlippable(board, r, c, dr, dc, color, opponent) {
        let currR = r + dr;
        let currC = c + dc;

        // 隣が相手の石でなければNG
        if (!(currR >= 0 && currR < 8 && currC >= 0 && currC < 8) || board[currR][currC] !== opponent) {
            return false;
        }

        // その先を探索
        while (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            if (board[currR][currC] === 0) return false; // 空白があればNG
            if (board[currR][currC] === color) return true; // 自分の色があれば成功
            currR += dr;
            currC += dc;
        }
        return false;
    },

    // 石を置いて盤面を書き換える
    executeMove(board, r, c, color) {
        const newBoard = board.map(row => [...row]);
        newBoard[r][c] = color;
        const opponent = 3 - color;
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        for (let [dr, dc] of directions) {
            if (this.hasFlippable(newBoard, r, c, dr, dc, color, opponent)) {
                let currR = r + dr;
                let currC = c + dc;
                // 自分の色にぶつかるまで相手の石を塗り替える
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

// --- 3. メインハンドラー (APIリクエスト処理) ---
export default async function handler(req, res) {
    // CORSヘッダー設定 (クライアントからのアクセスを許可)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // プリフライトリクエスト対応
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);

    try {
        // [GET /api] 接続確認用
        if (req.method === 'GET' && (pathname === '/api' || pathname === '/api/')) {
            const pong = await redis.ping();
            return res.status(200).json({
                message: "Server Online!",
                database: pong === "PONG" ? "Connected" : "Error",
                info: "Game logic and DB sync ready."
            });
        }

        // [POST /api/register] ユーザー登録 (db.py 移植)
        if (pathname.includes('register') && req.method === 'POST') {
            const { username, password } = req.body;

            // 1. BANリストチェック
            const isBanned = await redis.sismember("ban_list", username);
            if (isBanned) return res.status(403).json({ error: "あなたはBANされています" });

            // 2. 重複チェック
            const exists = await redis.exists(`user:${username}`);
            if (exists) return res.status(400).json({ error: "その名前は既に使われています" });

            // 3. 保存 (ハッシュ形式)
            await redis.hset(`user:${username}`, {
                password: password,
                rate: 1000,
                suspicious: 0
            });
            return res.status(200).json({ message: "OK" });
        }

        // [POST /api/move] 駒を打つ処理 (game_logic.py 移植)
        if (pathname.includes('move') && req.method === 'POST') {
            const { board, r, c, color } = req.body;

            // 置けるか最終確認
            if (!gameLogic.canPlace(board, r, c, color)) {
                return res.status(400).json({ error: "不正な手です" });
            }

            // 盤面更新
            const nextBoard = gameLogic.executeMove(board, r, c, color);
            
            // 次のプレイヤーに置ける場所があるかチェック (パス判定用)
            const nextColor = 3 - color;
            const validMovesForNext = gameLogic.getValidMoves(nextBoard, nextColor);

            return res.status(200).json({ 
                board: nextBoard,
                nextColor: nextColor,
                hasValidMove: validMovesForNext.length > 0
            });
        }

        return res.status(404).json({ error: "Endpoint Not Found" });

    } catch (e) {
        console.error("Server Error:", e);
        return res.status(500).json({ error: "Internal Server Error", message: e.message });
    }
}
