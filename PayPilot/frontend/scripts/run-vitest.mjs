// Runs Vitest with a normalised working directory.
// On Windows a lower-case drive letter (d:\ vs D:\) makes Vitest load two copies
// of its runner and every suite fails with "reading 'config'". Starting the
// process from the upper-case path avoids it. No-op on other platforms.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const cwd = process.cwd().replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`)
const require = createRequire(join(cwd, 'package.json'))
const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

const result = spawnSync(process.execPath, [vitestBin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' })
process.exit(result.status ?? 1)
