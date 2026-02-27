from flask import Flask, request, jsonify
from flask_cors import CORS
import os

# ライブラリの読み込み
try:
    from upstash_redis import Redis
except ImportError:
    Redis = None

app = Flask(__name__)
CORS(app)

# --- [修正の核心] だいきの画面にある名前を直接指定する ---
def get_redis_conn():
    if Redis is None:
        return None, "Library not installed"
    
    # だいきのVercelにある環境変数名を直接取得
    url = os.environ.get("REDIS_URL")
    
    if not url:
        return None, "REDIS_URL is missing in Vercel Settings"
    
    try:
        # URLを直接渡して接続（トークンもURLに含まれている形式に対応）
        r = Redis.from_url(url)
        r.ping()
        return r, "Connected"
    except Exception as e:
        return None, f"Connection failed: {str(e)}"

redis, status_msg = get_redis_conn()

@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    if request.method == 'GET':
        return jsonify({
            "message": "Server is Online!",
            "database": "Connected" if status_msg == "Connected" else "Error",
            "debug_msg": status_msg,
            "using_key": "REDIS_URL"
        }), 200
        
    if status_msg != "Connected":
        return jsonify({"error": "Database not ready", "detail": status_msg}), 500

    # 登録処理（テスト用）
    data = request.json
    if not data: return jsonify({"error": "No data"}), 400
    
    username = data.get('username', 'test_user')
    try:
        redis.set(f"test:{username}", "active")
        return jsonify({"message": "OK", "status": "Data saved to Redis!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
