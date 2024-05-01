import { orderDomain } from "./order-domain.js"

const order = await orderDomain.load("ac87ac27707d5c31729a5ec833fd47bf72b2861b")

order.query(s => s.status).subscribe(status => console.log("order status:", status))

setTimeout(function () {
  order.mutate("change-status", { status: "closed2" })
}, 3500)
