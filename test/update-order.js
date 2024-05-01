import { orderDomain } from "./order-domain.js"

const order = await orderDomain.load("c3ace922ff97fff980182ee4fac818b450d81095")

order.query(s => s.status).subscribe(status => console.log("order status:", status))

setTimeout(function () {
  order.mutate("change-status", { status: "closing" })
}, 3500)
