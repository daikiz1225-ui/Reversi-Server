from flask import Flask, request, jsonify
from flask_cors import CORS
import json, random, uuid
import os
from upstash_redis import Redis

# --- 設定 ---
app = Flask(__name__)
CORS(app)
# Vercel KVに接続
redis = Redis.from_env()

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5

# --- [元 db.py の中身] ---
def get_user(username):
    return redis.hgetall(f"user:{username}")
def save_user(username, data):
    return redis.hset(f"user:{username}", mapping=data)
def is_banned(username):
    return redis.sismember("ban_list", username)
def add_to_ban_list(username):
    return redis.sadd("ban_list", username)

# --- [元 game_logic.py の中身] ---
def can_place(board, r, c, color):
    if board[r][c] != 0: return False
    opponent = 3 - color
    directions = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
    for dr, dc in directions:
        curr_r, curr_c = r + dr, c + dc
        if 0 <= curr_r < 8 and 0 <= curr_c < 8 and board[curr_r][curr_c] == opponent:
            while 0 <= curr_r < 8 and 0 <= curr_c < 8:
                if board[curr_r][curr_c] == 0: break
                if board[curr_r][curr_c] == color: return True
                curr_r += dr
                curr_c += dc
    return False

def execute_move(board, r, c, color):
    board[r][c] = color
    opponent = 3 - color
    directions = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
    for dr, dc in directions:
        if 0 <= r+dr < 8 and 0 <= c+dc < 8 and board[r+dr][c+dc] == opponent:
            to_flip = []
            curr_r, curr_c = r + dr, c + dc
            while 0 <= curr_r < 8 and 0 <= curr_c < 8:
                if board[curr_r][curr_c] == 0: break
                if board[curr_r][curr_c] == color:
                    for fr, fc in to_flip: board[fr][fc] = color
                    break
                to_flip.append((curr_r, curr_c))
                curr_r += dr
                curr_c += dc
    return board

# --- メインロジック ---
@app.route('/api/auth/register', methods=['POST', 'GET'])
def register():
    if request.method == 'GET':
        return jsonify({"message": "Server is Online!", "status": "Ready"}), 200
        
    data = request.json
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

@app.route('/api/report/suspicious', methods=['POST'])
def report():
    data = request.json
    username = data.get('username')
    if data.get('password') == ADMIN_PASS: return jsonify({"status": "admin_bypass"})
    
    new_count = redis.hincrby(f"user:{username}", "suspicious_count", 1)
    if int(new_count) >= SUSPICIOUS_LIMIT:
        add_to_ban_list(username)
        return jsonify({"status": "banned"}), 403
    return jsonify({"status": "warned", "count": int(new_count)})

# Vercelは app という Flask インスタンスがあれば動く
