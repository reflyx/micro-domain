import { domainFactory } from "../main.js"

export const orderDomain = await domainFactory({ name: "orders" })

orderDomain.addMutation("change-status", function (state, payload) {
  console.log("changing order %s status to", state.id, payload.status)
  state.status = payload.status
})
