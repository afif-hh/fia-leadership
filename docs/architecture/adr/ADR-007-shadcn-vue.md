```
ADR-007: shadcn-vue as the component source, bent to the FIA tokens
Status: Accepted
Date: 2026-08-22
Type: architecture
Context: PRD §2 names no component library, and `docs/design/design.md` is the
  authoritative design system. Anything adopted has to bend to it rather than
  bring its own palette.
Decision: shadcn-vue in the `reka-nova` style (reka-ui primitives, `@lucide/vue`
  icons), vendored as source under `app/components/ui/`. One source of colour
  truth: `tokens.css` owns every value and `main.css` holds only the shadcn
  aliases, so all 22 semantic names resolve to FIA tokens and inherit the
  existing `[data-theme="dark"]` flip without a dark block of their own.
  Components are referenced by explicit import, not Nuxt auto-import.
Consequences: The components are ours to maintain — upstream fixes arrive only
  by re-running the CLI and diffing. `--radius: 0.5rem` is load-bearing: it makes
  shadcn's derived scale identical to Tailwind's defaults and to the deleted
  `tailwind.config.ts`. The vendored files carry 14 `vue/require-default-prop`
  lint warnings, accepted rather than patched so re-adds stay clean. `sidebar-08`
  does not exist in this style — the shell reproduces its shape from primitives.
  No colour literal may be added to a component.
Rollback: Vendored source, so removal is deleting a directory and replacing the
  call sites; the token layer is independent and would survive.
```

Decided in [#18](https://github.com/afif-hh/fia-leadership/issues/18).
