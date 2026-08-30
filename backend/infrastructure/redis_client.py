import os
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

def get_redis_client():
    return redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=0.2, socket_timeout=0.2)
