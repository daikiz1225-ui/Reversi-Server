from flask import Flask, request, jsonify
from flask_cors import CORS
import json, random, uuid
from .db import redis, get_user, save_user, is_banned, add_to_ban_list
from .game_logic import get_valid_moves, execute_move

app = Flask(__name__)
CORS(app)

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5

# --- 認証・管理系 ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username, password, ip = data.get('username'), data.get('password'), request.remote_addr
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
    username, reason = data.get('username'), data.get('reason')
    if data.get('password') == ADMIN_PASS: return jsonify({"status": "admin_bypass"})
    
    new_count = redis.hincrby(f"user:{username}", "suspicious_count", 1)
    if new_count >= SUSPICIOUS_LIMIT:
        add_to_ban_list(username)
        return jsonify({"status": "banned"}), 403
    return jsonify({"status": "warned", "count": int(new_count)})

# --- マッチング系 ---
@app.route('/api/match', methods=['POST'])
def match():
    data = request.json
    user, pref = data.get('username'), data.get('prefColor')
    
    # 待機中プレイヤー確認
    waiting = redis.get("match_waiting")
    if not waiting or waiting == user:
        redis.set("match_waiting", user, ex=30) # 30秒待機
        redis.set(f"pref:{user}", pref)
        return jsonify({"status": "waiting"})
    
    # マッチング成立
    opponent = waiting
    redis.delete("match_waiting")
    game_id = str(uuid.uuid4())
    
    # 色決定ロジック
    p1_pref, p2_pref = redis.get(f"pref:{opponent}"), pref
    if p1_pref != p2_pref and "random" not in [p1_pref, p2_pref]:
        p1_color = 1 if p1_pref == "black" else 2
    else:
        p1_color = random.choice([1, 2])
    
    p2_color = 3 - p1_color
    game_state = {
        "board": [[0]*8 for _ in range(8)],
        "players": {opponent: p1_color, user: p2_color},
        "turn": 1, # 黒(1)から
        "last_ping": {}
    }
    # 初期配置
    game_state["board"][3][3] = game_state["board"][4][4] = 2
    game_state["board"][3][4] = game_state["board"][4][3] = 1
    
    redis.set(f"game:{game_id}", json.dumps(game_state), ex=3600)
    return jsonify({"status": "matched", "gameId": game_id, "myColor": "black" if p2_color==1 else "white"})

# --- ゲームプレイ系 ---
@app.route('/api/game/state', methods=['GET'])
def get_state():
    gid = request.args.get('gameId')
    state = json.loads(redis.get(f"game:{gid}"))
    return jsonify(state)

@app.route('/api/game/move', methods=['POST'])
def move():
    data = request.json
    gid, user, pos = data.get('gameId'), data.get('username'), data.get('pos')
    state = json.loads(redis.get(f"game:{gid}"))
    
    my_color = state["players"][user]
    if state["turn"] != my_color: return jsonify({"error": "相手の番です"}), 400
    
    r, c = pos
    if not can_place(state["board"], r, c, my_color):
        return jsonify({"error": "そこには置けません"}), 400
    
    state["board"] = execute_move(state["board"], r, c, my_color)
    state["turn"] = 3 - my_color # ターン交代
    
    # パス判定
    if not get_valid_moves(state["board"], state["turn"]):
        state["turn"] = 3 - state["turn"]
        if not get_valid_moves(state["board"], state["turn"]):
            state["status"] = "finished" # 両者置けなくなったら終了
            
    redis.set(f"game:{gid}", json.dumps(state), ex=3600)
    return jsonify(state)

def handler(event, context):
    return app(event, context)
