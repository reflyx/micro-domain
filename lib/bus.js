import { v1 } from "https://deno.land/std@0.223.0/uuid/mod.ts"
import { crypto } from "https://deno.land/std@0.218.2/crypto/mod.ts"
import { encodeHex } from "https://deno.land/std@0.218.2/encoding/hex.ts"
import { storeFactory } from "./redis-store.js"
import { collectionFactory } from "./redis-collection.js"

export function busFactory(url, opts) {
  const spi = {}
  return {
    uniqueId(prefix = "") {
      return `${prefix}${encodeHex(crypto.subtle.digestSync("SHA-1", new TextEncoder().encode(v1.generate())))}`
    },
    async createStore(storeId, { locale = "en-US", snapshotThreshold = 50 } = {}) {
      return await storeFactory(storeId, { locale, snapshotThreshold }, { url })
    },
    publish(channel, key, data) {},
    collection(name) {
      return collectionFactory(name, spi)
    },
  }
}
