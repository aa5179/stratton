import app from './app.js'

const port = Number(process.env.PORT || 3001)

const server = app.listen(port, () => {
  console.log(`Solar API server listening on http://localhost:${port}`)
})

const keepAlive = setInterval(() => {}, 60_000)

function shutdown() {
  clearInterval(keepAlive)
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
