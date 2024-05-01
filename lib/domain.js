import { domainInstance } from "./instance.js"
import { crypto } from "https://deno.land/std@0.218.2/crypto/mod.ts"
import { encodeHex } from "https://deno.land/std@0.218.2/encoding/hex.ts"
import { loggerFactory } from "./logger.js"
import { busFactory } from "./bus.js"
import { viewFactory } from "./view.js"

/**
 * A domain is a stateful construct attached to one or more redis streams. It supports querying its state and can only be mutated using
 * pre-defined mutations.
 *
 * @param {*} spec
 * @param {*} options
 * @returns A Promise to domain to use in services to instantiate specific instance or manage list of them
 */
export async function domainFactory({ name, revision = 1 }, { system = "rfx1", busUrl, logger, snapshotThreshold = 50 } = {}) {
  const _domain = {
    bus: busFactory(busUrl),
    system,
    name,
    revision,
    logger: loggerFactory(logger),
    mutations: {},
    views: {},
    mountpoints: {},
    effects: [],
  }

  // compute identifiers
  _domain.fullName = [system, name].join(":")
  _domain.id = encodeHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(_domain.fullName + revision)))
  _domain.toString = () => `${_domain.fullName}:${revision} (${_domain.id})`
  _domain.logger.debug("instantiating domain %s", _domain.toString())

  const spi = {
    get bus() {
      return _domain.bus
    },
    fullInstanceId(instanceId) {
      return [_domain.id, instanceId].join(":")
    },
    get snapshotThreshold() {
      return snapshotThreshold
    },
    async trackInstance(instance) {
      const indexed = await instance.view("index").get()
      await _domain.bus.collection([_domain.id, "instances"]).push(instance.id, indexed)
      _domain.bus.publish("instance:tracked", { id: instance.id, data: indexed })
    },
    async removeInstance(instance) {
      // remove this instance from our domain collection
      const removed = await _domain.bus.collection([_domain.id, "instances"]).remove(instance.id)
      if (removed) {
        _domain.bus.publish("instance:removed", { id: instance.id, ...removed })
      }
      return removed
    },
    selectInstances(selector) {
      return _domain.bus.collection([_domain.id, "instances"]).select(selector)
    },
    publish(eventKey, payload, channel = "events") {
      return _domain.bus.publish([_domain.id, channel], eventKey, payload)
    },
    createView(key, instance) {
      return viewFactory(key, _domain.views[key], instance, spi)
    },
    getMutation(key) {
      return _domain.mutations[key]
    },
  }

  const api = {
    /**
     * @param {*} key unique key of the schema
     * @param {*} type Either request, mutation or query. Indicate when this schema should be used
     * @param {*} selector The path to the portion of the state on which this schema applied (null means full state)
     * @param {*} spec The JSONSchema spec to use to validate the selected state fragment or request
     */
    addSchema(key, type, selector, spec) {
      _domain.schemas[key] = { type, selector, spec }
    },
    addMutation(key, mutator) {
      _domain.mutations[key] = { mutator }
    },
    addView(key, spec) {
      _domain.views[key] = spec
    },
    addMountpoint(key, spec) {
      _domain.mountpoints[key] = spec
    },
    addEffect(effect, activator) {
      _domain.effects.push({ effect, activator })
    },
    /**
     *
     * @param {*} id
     * @param {*} param1
     */
    load(id, { height = 0, locale = "en-US" } = {}) {
      return domainInstance(id, { height, locale }, spi)
    },
    async create(initialState, locale = "en-US") {
      const instance = await domainInstance(null, { locale }, spi)
      await instance.initialize(initialState)

      // record this new instance in our domain collection (for find)
      await spi.trackInstance(instance)

      return instance
    },
    async remove(selector) {
      const instances = await spi.selectInstances(selector).list()
      return Promise.all(instances.map(instanceState => spi.removeInstance(instanceState)))
    },
    /**
     * Return one or more domain instances satisfying the selector
     * @param {*} selector An expression matching zero, one or more instances of this domain
     */
    find(selector) {
      return spi.selectInstances(selector).list()
    },
  }

  return api
}
