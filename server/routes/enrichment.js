import { Router } from 'express'
import { enrichContact } from '../services/enrichmentClient.js'

const router = Router()

router.post('/enrichment/contact', async (request, response, next) => {
  try {
    const lead = request.body?.lead ?? {}

    if (!lead || typeof lead !== 'object') {
      response.status(400).json({
        error: 'A lead payload is required.',
      })
      return
    }

    const result = await enrichContact(lead)
    response.json(result)
  } catch (error) {
    next(error)
  }
})

export default router
