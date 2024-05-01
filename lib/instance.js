export async function domainInstance(id, { locale = "en-US" } = {}, { bus, snapshotThreshold, fullInstanceId, createView, getMutation }) {
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
