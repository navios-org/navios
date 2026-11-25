import fs from 'node:fs'
import path from 'node:path'

/**
 * Checks if a vite.config.ts file exists in the current working directory
 * @returns {boolean} True if vite.config.ts exists, false otherwise
 */
export const hasViteConfig = (): boolean => {
  const cwd = process.cwd()
  return (
    fs.existsSync(path.join(cwd, 'vite.config.ts')) ||
    fs.existsSync(path.join(cwd, 'vite.config.mts')) ||
    fs.existsSync(path.join(cwd, 'vite.config.js'))
  )
}

export function getVideConfig() {
  const cwd = process.cwd()
  return fs.existsSync(path.join(cwd, 'vite.config.ts'))
    ? path.join(cwd, 'vite.config.ts')
    : fs.existsSync(path.join(cwd, 'vite.config.mts'))
      ? path.join(cwd, 'vite.config.mts')
      : path.join(cwd, 'vite.config.js')
}
