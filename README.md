# Nevo

Learning that adapts to how you learn.

Nevo is one product expressed as three experiences that share one identity,
permissions, and data model:

- **Student App** — tablet-first, calm, low cognitive load
- **Teacher Console** — responsive across desktop and tablet
- **School Admin Layer** — desktop-first, permission-scoped

## Stack

- [Next.js 16](https://nextjs.org) (App Router) · React 19 · TypeScript
- Tailwind CSS v4 (CSS-first `@theme`) + [shadcn/ui](https://ui.shadcn.com) (Radix base)
- Design tokens in `src/styles/tokens`, mirrored into `src/app/globals.css`

## Development

```bash
npm run dev     # start the dev server at http://localhost:3000
npm run build   # production build
npm run lint    # eslint
```

## Backend

API calls go through the same-origin proxy at `/api/backend/*`
(`src/app/api/backend/[...path]/route.ts`), which forwards to the FastAPI
backend — by default the hosted instance at
`https://api.nevolearning.com`. No env setup is needed for
development. To point elsewhere set `NEXT_PUBLIC_API_URL`; to bypass the proxy
and call the backend directly (requires CORS on the backend) also set
`NEXT_PUBLIC_API_DIRECT=1`. Auth is Bearer-token (`src/lib/auth/session.ts`);
surfaces not yet wired to live endpoints still run on mock seams.

## Project structure

Organized by application context, not by component type. See the architecture
docs in `context/` (gitignored) for the full specification.

```
src/
  app/        App Router routes
  components/ shared, per-context, and ui/ (shadcn) components
  hooks/      custom React hooks
  lib/        api client, utils, constants
  styles/     design tokens
```
