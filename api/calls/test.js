import express from 'express'
import dotenv from 'dotenv'
import { requireAdmin, requireUser } from '../../server/middleware/auth.js'
import { rateLimit } from '../../server/middleware/rateLimit.js'
import { sendTestCallPayload } from '../../server/routes/calls.js'

dotenv.config()

const app = express()

app.use(express.json())
app.use(requireUser, requireAdmin, rateLimit({ name: 'calls-test', max: 12 }))
app.use(async (request, response, next) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed.' })
    return
  }

  try {
    response.json(await sendTestCallPayload())
  } catch (error) {
    next(error)
  }
})
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
