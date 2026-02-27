from flask import Flask, request, jsonify
from flask_cors import CORS
import json, random, uuid

# ドットを消したぞ！これで動くはずだ。
from db import redis, get_user, save_user, is_banned, add_to_ban_list
from game_logic import get_valid_moves, execute_move

app = Flask(__name__)
CORS(app)

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5

@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    # ブラウザで開いた時（GET）にエラーを避けるためのメッセージ
    if request.method == 'GET':
        return jsonify({"message": "Server is running! Please use POST for registration."}), 200
        
    data = request.json
    if not data: return jsonify({"error": "No data"}), 400
    
    username, password = data.get('username'), data.get('password')
    ip = request.remote_addr
    is_admin = (password == ADMIN_PASS)
    
    if not is_admin and redis.exists(f"ip_registered:{ip}"):
        return jsonify({"error": "IP制限中"}), 403
    if redis.exists(f"user:{username}"):
        return jsonify({"error": "名前重複"}), 400
    
    user_data = {"password": password, "ip": ip, "is_admin": str(is_admin), "score": 1000, "suspicious_count": 0}
    save_user(username, user_data)
    if not is_admin: redis.set(f"ip_registered:{ip}", username)
    return jsonify({"message": "OK", "isAdmin": is_admin})

# --- 不審な挙動の報告 ---
@app.route('/api/report/suspicious', methods=['POST'])
def report():
    data = request.json
    username, reason = data.get('username'), data.get('reason')
    if data.get('password') == ADMIN_PASS: return jsonify({"status": "admin_bypass"})
    
    new_count = redis.hincrby(f"user:{username}", "suspicious_count", 1)
    if int(new_count) >= SUSPICIOUS_LIMIT:
        add_to_ban_list(username)
        return jsonify({"status": "banned"}), 403
    return jsonify({"status": "warned", "count": int(new_count)})

# (マッチングやゲームプレイのロジックは以前のままだが、インポートミスがないように調整済み)
