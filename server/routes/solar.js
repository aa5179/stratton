import { Router } from 'express'
import { getSolarInsights, getSolarLeadsNear, getSolarStateLeads } from '../services/solarClient.js'

const router = Router()

router.get('/solar', async (request, response, next) => {
  try {
    const lat = Number(request.query.lat)
    const lng = Number(request.query.lng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      response.status(400).json({
        error: 'Both lat and lng query parameters are required numbers.',
      })
      return
    }

    const insights = await getSolarInsights({ lat, lng })
    response.json(insights)
  } catch (error) {
    next(error)
  }
})

router.get('/solar/leads', async (request, response, next) => {
  try {
    const lat = Number(request.query.lat)
    const lng = Number(request.query.lng)
    const radiusMeters = Number(request.query.radiusMeters ?? 1000)
    const maxSamples = Number(request.query.maxSamples ?? 24)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      response.status(400).json({
        error: 'Both lat and lng query parameters are required numbers.',
      })
      return
    }

    const insights = await getSolarLeadsNear({
      lat,
      lng,
      radiusMeters,
      maxSamples,
    })

    response.json(insights)
  } catch (error) {
    next(error)
  }
})

router.get('/solar/state-leads', async (request, response, next) => {
  try {
    const state = String(request.query.state ?? '').trim()
    const maxPlaces = Number(request.query.maxPlaces ?? 12)

    if (!state) {
      response.status(400).json({
        error: 'A state query parameter is required.',
      })
      return
    }

    const insights = await getSolarStateLeads({
      state,
      maxPlaces,
    })

    response.json(insights)
  } catch (error) {
    next(error)
  }
})

export default router
