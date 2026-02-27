from flask import Flask, request, jsonify
from flask_cors import CORS
import os
try:
    from upstash_redis import Redis
except ImportError:
    Redis = None

app = Flask(__name__)
CORS(app)

# --- 接続テスト ---
def get_redis_conn():
    if Redis is None:
        return None, "Library upstash-redis not installed"
    
    url = os.environ.get("REDIS_URL")
    if not url:
        return None, "REDIS_URL not found in env"
    
    try:
        # Upstash Redisに接続
        r = Redis.from_env()
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
            "debug_msg": status_msg
        }), 200
        
    if status_msg != "Connected":
        return jsonify({"error": "Database not ready", "detail": status_msg}), 500

    # 登録処理などはそのままでOK
    data = request.json
    if not data: return jsonify({"error": "No data"}), 400
    
    username, password = data.get('username'), data.get('password')
    try:
        # 保存テスト
        redis.hset(f"user:{username}", mapping={"password": password})
        return jsonify({"message": "OK"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
