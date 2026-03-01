const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ゲームロジック（中身は変えてないぜ！）
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

// 【ここが重要】CORS対応を強化したハンドラー
export default async function handler(req, res) {
    // どのサイトからのアクセスも許可する設定
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // ブラウザが「送ってもいい？」と聞いてきたら即「OK」と答える
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);

    try {
        // [GET] 接続確認
        if (req.method === 'GET') {
            const pong = await redis.ping();
            return res.status(200).json({
                message: "Server Online!",
                database: pong === "PONG" ? "Connected" : "Error",
                info: "Final CORS fix applied."
            });
        }

        // [POST] 駒打ち
        if (pathname.includes('move') && req.method === 'POST') {
            const { board, r, c, color } = req.body;
            if (!gameLogic.canPlace(board, r, c, color)) return res.status(400).json({ error: "置けません" });
            const nextBoard = gameLogic.executeMove(board, r, c, color);
            return res.status(200).json({ board: nextBoard });
        }

        return res.status(404).json({ error: "Not Found" });
    } catch (e) {
        return res.status(500).json({ error: "Server Error", message: e.message });
    }
}
