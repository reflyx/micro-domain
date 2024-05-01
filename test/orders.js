import { orderDomain } from "./order-domain.js"

const order = await orderDomain.create({
  duration: "4h",
  strategy: {
    targets: [
      {
        token: "WEN",
        alloc: 10,
      },
      {
        token: "JUP",
        alloc: 90,
      },
    ],
  },
  depositAddress: "DEWDEW23e32ewdewdewdewdew",
  takeProfit: 7.5,
  stopLoss: 3.5,
  depth: "3",
  createdAt: new Date(),
  status: "pending",
})

// create a status watcher query
order
  .query(s => s.status)
  .stream()
  .subscribe(status => console.log("order status:", status))

console.log("created order", order.id)

setTimeout(function () {
  order.mutate("change-status", { status: "active" })
}, 1000)
