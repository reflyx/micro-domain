import { v1 } from "https://deno.land/std@0.223.0/uuid/mod.ts"
import { crypto } from "https://deno.land/std@0.218.2/crypto/mod.ts"
import { encodeHex } from "https://deno.land/std@0.218.2/encoding/hex.ts"
import { storeFactory } from "./redis-store.js"
import { collectionFactory } from "./redis-collection.js"
import { Observable } from "rx"
import { redisClient } from "./redis.js"

export function busFactory(url, opts = {}) {
  const consumerId = opts.consumerId || Deno.env.CONSUMER_ID
  const pub = redisClient(url)

  const spi = {
    stream(streamKey) {
      return {
        post(key, payload) {
          return pub.xadd(streamKey, "*", key, JSON.stringify(payload))
        },
        async consume(group) {
          const conn = redisClient(url)
          await ensureConsumerGroup(conn, streamKey, group)
          return new Observable(function (obs) {
            async function listenForMessage(lastId = ">") {
              const results = await conn.xreadgroup("GROUP", group, consumerId, "BLOCK", 0, "STREAMS", streamKey, lastId)
              const [_, messages] = results[0]

              messages.map(msg => obs.next(msg[1]))

              // Pass the last id of the results to the next round.
              if (messages.length > 0) {
                await listenForMessage(messages[messages.length - 1][0])
              } else {
                await listenForMessage()
              }
            }

            listenForMessage()

            return async function () {
              await conn.close()
            }
          })
        },
      }
    },
  }

  async function ensureConsumerGroup(conn, key, group) {
    try {
      await conn.xgroup("CREATE", key, group, "$", "MKSTREAM")
    } catch (err) {
      // NOOP
    }
  }

  return {
    uniqueId(prefix = "") {
      return `${prefix}${encodeHex(crypto.subtle.digestSync("SHA-1", new TextEncoder().encode(v1.generate())))}`
    },
    async createStore(storeId, { locale = "en-US", snapshotThreshold = 50, instance } = {}) {
      return await storeFactory(storeId, { locale, snapshotThreshold }, { url, bus: spi, instance })
    },
    channel(channelKey) {
      return {
        publish(key, data) {
          return pub.publish(channelKey, { key, data })
        },
        async subscribe(patterns) {
          const conn = redisClient(url)
          await conn.psubscribe(patterns)
          return new Observable(function (obs) {
            conn.on("pmessage", (pattern, channel, message) => {
              console.log("received channel message", pattern, channel, message)
              obs.next({ pattern, channel, message })
            })
            return async function () {
              await conn.punsubscribe(patterns)
            }
          })
        },
      }
    },
    consumer(stream, group) {
      return spi.stream(stream).consume(group)
    },
    collection(name) {
      return collectionFactory(name, spi)
    },
  }
}
