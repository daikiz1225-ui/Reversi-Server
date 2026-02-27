from flask import Flask, request, jsonify
from flask_cors import CORS
import os

try:
    from upstash_redis import Redis
except ImportError:
    Redis = None

app = Flask(__name__)
CORS(app)

# --- [修正：SSLエラー回避版] ---
def get_redis_conn():
    if Redis is None:
        return None, "Library not installed"
    
    raw_url = os.environ.get("REDIS_URL")
    if not raw_url:
        return None, "REDIS_URL is missing"
    
    try:
        # SSLエラーを回避するため、https:// を抜いて、tokenを直接指定する
        # URL形式: https://:TOKEN@HOST
        clean_url = raw_url.replace("https://", "")
        token, host = clean_url.split("@")
        token = token.replace(":", "")
        
        # 接続（URLはhost名だけ、tokenを別で渡す）
        r = Redis(url=f"https://{host}", token=token)
        r.ping()
        return r, "Connected"
    except Exception as e:
        return None, f"Final Connect attempt failed: {str(e)}"

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
        return jsonify({"error": "Database not ready"}), 500

    data = request.json
    if not data: return jsonify({"error": "No data"}), 400
    
    username = data.get('username', 'test_user')
    try:
        redis.set(f"test:{username}", "final_success")
        return jsonify({"message": "OK", "status": "Finished!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
