import { validateEnv } from '../lib/config'

try {
  validateEnv()
  console.log('✓ All required env vars are present.')
} catch (e) {
  console.log('✗', (e as Error).message)
  process.exit(1)
}
