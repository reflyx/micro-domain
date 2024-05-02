import { domainFactory } from "../main.js"

export const orderDomain = await domainFactory({ name: "orders" })

orderDomain.addMutation("change-status", function (state, payload, { id }) {
  if (state.status !== payload.status) {
    console.log("changing order %s status to", id, payload.status)
    state.status = payload.status
  } else {
    console.log("order %s is already in %s status", id, state.status)
  }
})

orderDomain.addEffect("initialized", state => state.status === "pending")
