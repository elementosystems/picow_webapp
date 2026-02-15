const fs = require('fs')
const path = require('path')

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const pkg = readJSON(pkgPath)
const v = pkg.version

// Update version.json
const versionJsonPath = path.join(root, 'version.json')
fs.writeFileSync(versionJsonPath, JSON.stringify({ version: v }, null, 2) + '\n', 'utf8')
console.log('Wrote', versionJsonPath)

// Update VERSION (plain text)
const versionFilePath = path.join(root, 'VERSION')
fs.writeFileSync(versionFilePath, v + '\n', 'utf8')
console.log('Wrote', versionFilePath)

// Update index.html meta[name=app-version]
const indexPath = path.join(root, 'index.html')
let html = fs.readFileSync(indexPath, 'utf8')
if (html.match(/<meta[^>]*name=["']app-version["'][^>]*>/i)) {
  html = html.replace(/(<meta[^>]*name=["']app-version["'][^>]*content=["'])([^"']*)(["'][^>]*>)/i, `$1${v}$3`)
  fs.writeFileSync(indexPath, html, 'utf8')
  console.log('Updated meta app-version in index.html')
} else {
  // Insert meta into head
  html = html.replace(/<head(.*?)>/i, `<head$1>\n    <meta name="app-version" content="${v}" />`)
  fs.writeFileSync(indexPath, html, 'utf8')
  console.log('Inserted meta app-version into index.html')
}

console.log('Synced versions to', v)
