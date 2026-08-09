import crypto from 'node:crypto'

const SCRIPT_TTL_MS = 30 * 60 * 1000
const scripts = new Map()

function cleanupExpiredScripts() {
  const now = Date.now()

  scripts.forEach((entry, scriptId) => {
    if (entry.expiresAt <= now) {
      scripts.delete(scriptId)
    }
  })
}

export function registerCallScript(script) {
  cleanupExpiredScripts()

  const scriptId = crypto.randomUUID()
  scripts.set(scriptId, {
    script,
    expiresAt: Date.now() + SCRIPT_TTL_MS,
  })

  return scriptId
}

export function getCallScript(scriptId) {
  cleanupExpiredScripts()

  const entry = scripts.get(scriptId)

  if (!entry || entry.expiresAt <= Date.now()) {
    scripts.delete(scriptId)
    return ''
  }

  return entry.script
}
