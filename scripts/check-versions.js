const fs = require('fs')
const path = require('path')

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const root = path.resolve(__dirname, '..')
const packageJson = readJSON(path.join(root, 'package.json'))
let versionJson = null
try {
  versionJson = readJSON(path.join(root, 'version.json'))
} catch (e) {
  console.error('Missing or invalid version.json')
  process.exit(2)
}

let versionFile = null
try {
  versionFile = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()
} catch (e) {
  console.error('Missing VERSION file')
  process.exit(2)
}

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const metaMatch = indexHtml.match(/<meta[^>]*name=["']app-version["'][^>]*content=["']([^"']+)["'][^>]*>/i)
const indexVersion = metaMatch ? metaMatch[1] : null

const expected = packageJson.version
const mismatches = []
if (versionJson.version !== expected) mismatches.push(`version.json: ${versionJson.version}`)
if (versionFile !== expected) mismatches.push(`VERSION: ${versionFile}`)
if (indexVersion && indexVersion !== expected) mismatches.push(`index.html meta: ${indexVersion}`)

if (mismatches.length) {
  console.error('Version mismatch detected. Expected', expected)
  mismatches.forEach(m => console.error(' -', m))
  process.exit(1)
}

console.log('Versions match:', expected)
process.exit(0)
