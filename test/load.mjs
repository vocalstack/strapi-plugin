import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

/**
 * Import one of the plugin's TypeScript sources that imports nothing at run time. The package
 * is CommonJS and its sources are written as ES modules for the bundler, so Node cannot import
 * them by path: the types are stripped and the result imported as it is.
 */
export function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
}
