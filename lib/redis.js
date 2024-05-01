import IORedis from "ioredis"

export function redisClient(url, opts = {}) {
  try {
    return new IORedis(url, {
      maxRetriesPerRequest: null,
      ...opts,
    })
  } catch (err) {
    console.error("Unable to connect to redis", err)
  }
}
