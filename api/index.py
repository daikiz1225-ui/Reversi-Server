from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from upstash_redis import Redis

app = Flask(__name__)
CORS(app)

# --- [修正ポイント] REDIS_URL 1本で接続する ---
try:
    # だいきの環境にある "REDIS_URL" を使って接続
    redis = Redis.from_env() 
    # もし from_env() でダメな時のための予備
    if not os.environ.get("REDIS_URL"):
         redis = Redis(url=os.environ.get("STORAGE_URL"), token=os.environ.get("STORAGE_REST_API_TOKEN"))
         
    redis.ping()
    kv_ready = True
except Exception as e:
    print(f"Connection Error: {e}")
    kv_ready = False

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5

@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    if request.method == 'GET':
        status = "Connected (Upstash)" if kv_ready else "Redis Connection Error"
        return jsonify({
            "message": "Server is Online!",
            "database": status,
            "info": "Connected via REDIS_URL"
        }), 200
        
    if not kv_ready:
        return jsonify({"error": "Database not ready"}), 500

    data = request.json
    username, password = data.get('username'), data.get('password')
    ip = request.remote_addr
    is_admin = (password == ADMIN_PASS)
    
    try:
        if not is_admin and redis.exists(f"ip_registered:{ip}"):
            return jsonify({"error": "IP制限中"}), 403
        if redis.exists(f"user:{username}"):
            return jsonify({"error": "名前重複"}), 400
        
        user_data = {"password": password, "ip": ip, "is_admin": str(is_admin), "score": 1000, "suspicious_count": 0}
        redis.hset(f"user:{username}", mapping=user_data)
        if not is_admin: redis.set(f"ip_registered:{ip}", username)
        return jsonify({"message": "OK", "isAdmin": is_admin})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
