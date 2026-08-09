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
const appOrigin = process.env.APP_ORIGIN

app.use(cors(appOrigin ? { origin: appOrigin } : {}))
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/route-check', (_request, response) => {
  response.json({
    ok: true,
    routes: [
      'GET /api/health',
      'POST /api/calls/test',
      'POST /api/calls/send-leads',
      'POST /api/calls/verify-consent',
      'GET /api/calls/answer/:scriptId',
    ],
  })
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

export default app
