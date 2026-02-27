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

# --- [修正：URLからトークンを分離して接続] ---
def get_redis_conn():
    if Redis is None:
        return None, "Library not installed"
    
    raw_url = os.environ.get("REDIS_URL")
    if not raw_url:
        return None, "REDIS_URL is missing"
    
    try:
        # URLが 'https://:TOKEN@HOST' の形式なので、分解して繋ぐ
        # ※ Upstash Redisライブラリの仕様に合わせる
        if "@" in raw_url:
            # トークンとURLを分ける
            parts = raw_url.replace("https://", "").split("@")
            token = parts[0].replace(":", "")
            url = "https://" + parts[1]
            r = Redis(url=url, token=token)
        else:
            # そのままいける場合
            r = Redis.from_env()
            
        r.ping()
        return r, "Connected"
    except Exception as e:
        return None, f"Connect failed: {str(e)}"

redis, status_msg = get_redis_conn()

@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    if request.method == 'GET':
        return jsonify({
            "message": "Server is Online!",
            "database": "Connected" if status_msg == "Connected" else "Error",
            "debug_msg": status_msg
        }), 200
        
    if status_msg != "Connected":
        return jsonify({"error": "Database not ready", "detail": status_msg}), 500

    data = request.json
    if not data: return jsonify({"error": "No data"}), 400
    
    username = data.get('username', 'test_user')
    try:
        redis.set(f"test:{username}", "success")
        return jsonify({"message": "OK", "status": "Data saved!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
