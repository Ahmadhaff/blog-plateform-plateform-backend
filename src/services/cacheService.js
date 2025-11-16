const { getRedisClient } = require('../config/redis');

class CacheService {
  constructor() {
    this.prefix = 'platform-server:';
  }

  get client() {
    return getRedisClient();
  }

  buildKey(key) {
    return `${this.prefix}${key}`;
  }

  async get(key) {
    const data = await this.client.get(this.buildKey(key));
    return data ? JSON.parse(data) : null;
  }

  async set(key, value, ttlSeconds = 300) {
    await this.client.set(this.buildKey(key), JSON.stringify(value), {
      EX: ttlSeconds
    });
  }

  async del(key) {
    await this.client.del(this.buildKey(key));
  }

  async invalidateByPattern(pattern) {
    const iterator = this.client.scanIterator({
      MATCH: `${this.prefix}${pattern}`
    });

    const keys = [];
    for await (const key of iterator) {
      keys.push(key);
    }

    if (keys.length) {
      await this.client.del(keys);
    }
  }
}

module.exports = new CacheService();
