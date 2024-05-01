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
    async consumer(stream, group) {
      const conn = redisClient(url)
      await ensureConsumerGroup(conn, stream, group)
      return new Observable(function (obs) {
        async function listenForMessage(lastId = ">") {
          const results = await conn.xreadgroup("GROUP", group, consumerId, "BLOCK", 0, "STREAMS", stream, lastId)
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
    stream(streamKey) {
      return {
        post(key, payload) {
          return pub.xadd(streamKey, "*", key, JSON.stringify(payload))
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
    publish(channel, key, data) {
      return pub.publish(channel, { key, data })
    },
    consumer(stream, group) {
      return spi.consumer(stream, group)
    },
    collection(name) {
      return collectionFactory(name, spi)
    },
  }
}
