import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import solarRouter from './routes/solar.js'
import enrichmentRouter from './routes/enrichment.js'
import mailRouter from './routes/mail.js'
import callsRouter from './routes/calls.js'
import callWebhooksRouter from './routes/callWebhooks.js'
import { requireAdmin, requireUser } from './middleware/auth.js'
import { rateLimit } from './middleware/rateLimit.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)
const appOrigin = process.env.APP_ORIGIN

app.use(cors(appOrigin ? { origin: appOrigin } : {}))
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.use('/api/calls', callWebhooksRouter)
app.use('/api', requireUser, requireAdmin, rateLimit({ name: 'enrichment', max: 80 }), enrichmentRouter)
app.use('/api', requireUser, requireAdmin, rateLimit({ name: 'mail', max: 25 }), mailRouter)
app.use('/api', requireUser, requireAdmin, rateLimit({ name: 'calls', max: 12 }), callsRouter)
app.use('/api', requireUser, rateLimit({ name: 'solar', max: 90 }), solarRouter)

app.use((error, _request, response, next) => {
  void next
  const status = error.status || 500
  response.status(status).json({
    error: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    details: error.details ?? null,
  })
})

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
