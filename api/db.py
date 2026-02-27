import os
from upstash_redis import Redis

# VercelのStorageタブでKVを作成すると自動で設定される環境変数を使用
redis = Redis.from_env()

def get_user(username):
    # ユーザー情報を取得
    return redis.hgetall(f"user:{username}")

def save_user(username, data):
    # ユーザー情報をハッシュ形式で保存
    return redis.hset(f"user:{username}", mapping=data)

def is_banned(username):
    # BANリストに含まれているかチェック
    return redis.sismember("ban_list", username)

def add_to_ban_list(username):
    # BANリストに追加
    return redis.sadd("ban_list", username)

def check_name_exists(username):
    # 同名ユーザーがいるか確認
    return redis.exists(f"user:{username}")
