from flask import Flask, request, jsonify
from flask_cors import CORS
import json, random, uuid
import os
from upstash_redis import Redis

app = Flask(__name__)
CORS(app)

# --- Vercelの「STORAGE_」設定に合わせてデータベースに接続 ---
try:
    # STORAGE_URL という名前で環境変数が作られている場合に対応
    redis = Redis(
        url=os.environ.get("STORAGE_URL"), 
        token=os.environ.get("STORAGE_REST_API_TOKEN")
    )
    # 接続テスト
    redis.ping()
    kv_ready = True
except Exception as e:
    print(f"KV Connection Error: {e}")
    kv_ready = False

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5

@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    # 動作確認用
    if request.method == 'GET':
        status = "Connected" if kv_ready else "KV Error (Check Environment Variables)"
        return jsonify({
            "message": "Server is Online!",
            "database": status,
            "config": "Storage Mode"
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

# (マッチングやゲームロジックが必要になったら、また後で追加するぜ！)
