from flask import Flask, request, jsonify
from flask_cors import CORS
import json, random, uuid
import os
from upstash_redis import Redis

app = Flask(__name__)
CORS(app)

# --- どんな名前で環境変数が作られていても、意地でも見つける設定 ---
def connect_redis():
    # 候補1: Vercel標準の KV_
    # 候補2: だいきの画面で見えた STORAGE_
    # 候補3: 手動設定によくある REDIS_
    prefixes = ['KV', 'STORAGE', 'REDIS']
    
    for p in prefixes:
        url = os.environ.get(f"{p}_REST_API_URL") or os.environ.get(f"{p}_URL")
        token = os.environ.get(f"{p}_REST_API_TOKEN")
        if url and token:
            try:
                r = Redis(url=url, token=token)
                r.ping()
                return r, True
            except:
                continue
    return None, False

redis, kv_ready = connect_redis()

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5

@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    if request.method == 'GET':
        status = "Connected" if kv_ready else "Still KV Error"
        # デバッグ用に、今見えている環境変数の「名前」だけヒントに出す
        env_keys = [k for k in os.environ.keys() if "URL" in k or "TOKEN" in k]
        return jsonify({
            "message": "Server is Online!",
            "database": status,
            "detected_keys": env_keys # 何が見えてるか確認用
        }), 200
        
    if not kv_ready:
        return jsonify({"error": "Database is not connected"}), 500

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
