import express from 'express'
import { getCallScript } from '../services/callScriptStore.js'

const router = express.Router()

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildPlivoXml(script) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${escapeXml(script)}</Speak></Response>`
}

router.all('/answer/:scriptId', (request, response) => {
  const script = getCallScript(request.params.scriptId)

  if (!script) {
    response
      .status(404)
      .type('application/xml')
      .send(buildPlivoXml('This Stratton call script has expired. Goodbye.'))
    return
  }

  response
    .type('application/xml')
    .send(buildPlivoXml(script))
})

export default router
