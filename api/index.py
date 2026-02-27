from flask import Flask, request, jsonify
from flask_cors import CORS
from .db import redis, get_user, save_user, is_banned, check_name_exists, add_to_ban_list

app = Flask(__name__)
CORS(app) # フロントエンド（別URL）からの通信を許可

ADMIN_PASS = "daiki1225"
SUSPICIOUS_LIMIT = 5  # 5回で自動BAN

# --- ユーザー登録 ＆ IP制限回避 ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    ip_address = request.remote_addr

    if not username or not password:
        return jsonify({"error": "名前とパスワードを入力してね"}), 400

    if check_name_exists(username):
        return jsonify({"error": "その名前は既に使われています"}), 400

    # 同一IPチェック（管理者はスルー）
    is_admin = (password == ADMIN_PASS)
    if not is_admin:
        # IPをキーにして登録済みか確認
        if redis.exists(f"ip_registered:{ip_address}"):
            return jsonify({"error": "この端末からは既に登録されています"}), 403

    # ユーザー情報の作成
    user_data = {
        "password": password,
        "ip": ip_address,
        "is_admin": str(is_admin),
        "score": 1000,
        "suspicious_count": 0
    }
    save_user(username, user_data)
    
    # 管理者以外はIPをロック
    if not is_admin:
        redis.set(f"ip_registered:{ip_address}", username)

    return jsonify({"message": "登録完了", "isAdmin": is_admin}), 200

# --- 不審な挙動の報告 ＆ 自動BAN ---
@app.route('/api/report/suspicious', methods=['POST'])
def report_suspicious():
    data = request.json
    username = data.get('username')
    password = data.get('password') # 検証用
    reason = data.get('reason')

    # 管理者は監視対象外（デバッグ用）
    if password == ADMIN_PASS:
        return jsonify({"status": "admin_bypass"}), 200

    if is_banned(username):
        return jsonify({"status": "already_banned"}), 403

    # カウントを1増やす
    new_count = redis.hincrby(f"user:{username}", "suspicious_count", 1)

    # 5回以上で自動BAN執行
    if new_count >= SUSPICIOUS_LIMIT:
        add_to_ban_list(username)
        redis.hset(f"user:{username}", "ban_reason", f"自動BAN: {reason}の繰り返し")
        return jsonify({"status": "banned", "message": "不正検知により凍結されました"}), 403

    return jsonify({"status": "warned", "count": new_count}), 200

# --- 管理者専用：任意ユーザーBAN ---
@app.route('/api/admin/ban', methods=['POST'])
def admin_ban():
    data = request.json
    admin_password = data.get('adminPassword')
    target_name = data.get('targetName')

    if admin_password != ADMIN_PASS:
        return jsonify({"error": "権限がありません"}), 403

    add_to_ban_list(target_name)
    return jsonify({"message": f"{target_name} を追放しました"}), 200

def handler(event, context):
    return app(event, context)
