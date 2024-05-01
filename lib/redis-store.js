import { createStore } from "npm:zustand/vanilla"
import { applyPatches, enablePatches, produceWithPatches } from "npm:immer"
import { immer } from "npm:zustand/middleware/immer"
import { subscribeWithSelector } from "npm:zustand/middleware"
import { Subject } from "rx"
import { redisClient } from "./redis.js"
import { nextTick } from "node:process"

enablePatches()

function getApplicableFrames(messages, targetHeight = 0) {
  return messages
    .map(([frameId, content]) => {
      const [_, jsonFrame] = content
      const frame = JSON.parse(jsonFrame)
      frame.id = frameId
      return frame
    })
    .filter(frame => frame.height > targetHeight)
    .sort((a, b) => a.height < b.height)
}

export async function storeFactory(storeId, { height = 0, locale, snapshotThreshold }, { url }) {
  const readConn = redisClient(url)
  const writeConn = redisClient(url)

  const _state = {}
  const _store = createStore(
    subscribeWithSelector(
      immer(set => {
        return {
          init(initialState) {
            _state.height = 0
            set(() => {
              const [nextState, patches] = produceWithPatches({}, () => initialState)
              if (patches.length > 0) {
                const frame = { height: 0, patches, ts: new Date() }
                writeConn.xadd(`${storeId}:frames`, "*", "frame", JSON.stringify(frame))
                return nextState
              }
            })
          },
          sync(frame) {
            _state.height = frame.height
            return set(state => {
              return applyPatches(state, frame.patches)
            })
          },
          mutate(mutation) {
            return set(state => {
              const [nextState, patches] = produceWithPatches(state, mutation)
              if (patches.length > 0) {
                const frame = { height: _state.height + 1, patches, ts: new Date() }
                writeConn.xadd(`${storeId}:frames`, "*", "frame", JSON.stringify(frame))
                _state.height = frame.height
                return nextState
              }
            })
          },
        }
      })
    )
  )

  console.log("redis-store: reload state at height %s", height)
  const frames = await readConn.xrange(`${storeId}:frames`, "-", "+")
  const applicableFrames = getApplicableFrames(frames, height)
  applicableFrames.forEach(frame => _store.getState().sync(frame))
  _state.height = applicableFrames.length

  // connect to keep state in sync (individually)
  async function syncState(lastId = "$") {
    const results = await readConn.xread("block", 0, "STREAMS", `${storeId}:frames`, lastId)
    const [_, messages] = results[0]

    getApplicableFrames(messages, _state.height).forEach(frame => _store.getState().sync(frame))

    console.log("redis-store: store %s is now at height", storeId, _state.height)

    // Pass the last id of the results to the next round.
    await syncState(messages[messages.length - 1][0])
  }
  syncState()

  console.log("redis-store: store %s is instantiated at height", storeId, _state.height)

  // listen to mutations (through consumer group)

  return {
    init(initialState) {
      _store.getState().init(initialState)
    },
    mutate(mutator) {
      return _store.getState().mutate(mutator)
    },
    query(selector, query, opts) {
      console.log("redis-store: executing query")
      const results = new Subject()

      nextTick(function () {
        _store.subscribe(
          state => {
            console.log("query selector")
            if (selector) {
              return selector(state)
            } else {
              return state
            }
          },
          result => {
            if (query) {
              //todo: apply mongodb like query
              results.next(result)
            } else {
              results.next(result)
            }
          },
          {
            fireImmediately: true,
          }
        )
      })

      return results.asObservable()
    },
  }
}
