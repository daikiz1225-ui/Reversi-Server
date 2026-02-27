from flask import Flask, request, jsonify
from flask_cors import CORS
import json, random, uuid
import os

# KV接続をエラーが出ないように慎重に行う
try:
    from upstash_redis import Redis
    redis = Redis.from_env()
    # 接続テスト
    redis.ping()
    kv_ready = True
except Exception as e:
    print(f"KV Connection Error: {e}")
    kv_ready = False

app = Flask(__name__)
CORS(app)

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5

@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    # データベースが死んでてもここは動くはず
    if request.method == 'GET':
        status = "Connected" if kv_ready else "KV Error (Check Vercel Storage tab)"
        return jsonify({
            "message": "Server is Online!",
            "database": status,
            "note": "If KV Error, please connect Vercel KV in Storage tab."
        }), 200
    
    # POST処理 (KVが死んでたらエラーを返す)
    if not kv_ready:
        return jsonify({"error": "Database is not ready"}), 500

    data = request.json
    username, password = data.get('username'), data.get('password')
    ip = request.remote_addr
    is_admin = (password == ADMIN_PASS)
    
    # Redis操作
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

# Vercel用に app を公開
