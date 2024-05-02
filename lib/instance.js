export async function domainInstance(id, { locale = "en-US" } = {}, { bus, snapshotThreshold, fullInstanceId, createView, getMutation, installedEffects }) {
  const _instance = {
    id: id || bus.uniqueId(),
  }
  const spi = {
    get id() {
      return _instance.id
    },
    getMutation(key) {
      return getMutation(key)
    },
  }

  _instance.store = await bus.createStore(fullInstanceId(_instance.id), { snapshotThreshold, locale, instance: spi })

  // install effects handler
  _instance.effectHandlerSubscription = _instance.store.changes().subscribe(({ newState, oldState, frame }) => {
    return Promise.all(
      installedEffects().map(async effect => {
        if (effect.activator) {
          const activated = await effect.activator(newState, oldState, frame)
          if (activated) {
            if (effect.generator) {
              const { key, payload } = await effect.generator(newState, oldState, frame)
              return bus.channel(`${fullInstanceId(_instance.id)}:effects`).publish(key, payload)
            } else {
              return bus.channel(`${fullInstanceId(_instance.id)}:effects`).publish(effect.effect)
            }
          }
        } else {
          if (effect.generator) {
            const { key, payload } = await effect.generator(newState, oldState, frame)
            return bus.channel(`${fullInstanceId(_instance.id)}:effects`).publish(key, payload)
          } else {
            return bus.channel(`${fullInstanceId(_instance.id)}:effects`).publish(effect.effect)
          }
        }
      })
    )
  })

  const api = {
    get id() {
      return _instance.id
    },
    get fullId() {
      return fullInstanceId(_instance.id)
    },
    initialize(initialState) {
      return _instance.store.init(initialState)
    },
    view(key) {
      return createView(key, spi)
    },
    query(selector, query, opts) {
      return _instance.store.query(selector, query, opts)
    },
    mutate(key, payload) {
      const mutation = getMutation(key)
      if (!mutation) {
        throw new Error("unknown:mutation")
      }
      return _instance.store.mutate(key, payload)
    },
  }

  return api
}
