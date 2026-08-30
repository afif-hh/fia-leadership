import { readFile } from 'node:fs/promises'

/**
 * Teaches Nitro's Rollup pass the `?raw` import suffix, so `server/policies/manifest.ts` can
 * inline the consent documents (#59, #72).
 *
 * Vite implements `?raw` natively, which is why the policy tests pass under vitest without this —
 * and why its absence is easy to miss. Nitro bundles the server with Rollup, which has no such
 * convention: it takes the whole specifier literally and fails with
 * `ENOENT: … open 'v1.md?raw'`. Worse, the build only breaks once something *reachable from a
 * route* imports the manifest, so the gap stays invisible while the modules are still unwired.
 *
 * Inlining rather than reading at runtime is not optional: the deploy target is Cloudflare
 * Workers, which has no filesystem. It is also what lets `policy_hash` be a digest of exactly the
 * bytes that shipped.
 *
 * Lives here rather than inside `nuxt.config.ts` so it can be unit-tested — otherwise the only
 * thing standing between this and a broken deploy is remembering to run a production build by
 * hand.
 */

/**
 * The three hooks this needs, declared structurally rather than imported from `rollup`.
 *
 * Rollup is a transitive dependency of Vite and Nitro, not a direct one, so importing its types
 * here would mean adding a dependency purely to name a shape — and pinning a second copy of a
 * version those two already agree on between themselves. Rollup accepts any object with these
 * hooks, so structural typing costs nothing and keeps the dependency list honest.
 */
export interface RawMarkdownPlugin {
  name: string
  resolveId(source: string, importer?: string): string | null
  load(id: string): Promise<string | null>
}

const SUFFIX = '?raw'

export function rawMarkdown(
  readFileImpl: (path: string) => Promise<string> = (path) => readFile(path, 'utf-8')
): RawMarkdownPlugin {
  return {
    name: 'fia-raw-markdown',

    resolveId(source: string, importer?: string) {
      if (!source.endsWith(`.md${SUFFIX}`) || !importer) return null
      // Resolved here rather than left to Rollup, whose resolver would look for a file whose name
      // literally ends in "?raw". The suffix is put back so `load` can still recognise it.
      const path = new URL(source.slice(0, -SUFFIX.length), `file://${importer}`).pathname
      return `${path}${SUFFIX}`
    },

    async load(id: string) {
      if (!id.endsWith(`.md${SUFFIX}`)) return null
      const text = await readFileImpl(id.slice(0, -SUFFIX.length))
      return `export default ${JSON.stringify(text)}`
    },
  }
}
