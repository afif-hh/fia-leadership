/**
 * `?raw` imports of the policy documents.
 *
 * Vite ships this declaration in `vite/client`, but that is a browser-lib type set the server
 * tsconfig does not pull in — declaring the one suffix actually used keeps the server's lib
 * surface unchanged and states plainly what the build is relied on to do.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}
