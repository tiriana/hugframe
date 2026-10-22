# hugframe

An iframe that hugs its content, then morphs into a chromeless full-window view.

This repository holds the library and everything published around it. The library itself is documented
in [packages/hugframe/README.md](packages/hugframe/README.md); the [live demo](https://tiriana.github.io/hugframe/)
and the [API reference](https://tiriana.github.io/hugframe/api/) are built from `apps/site`.

## Layout

1. `packages/hugframe` — the library, published to npm as `hugframe`. Its `files` field is limited to `dist`, so the demo, the tests and the workflows never reach the tarball.
2. `apps/site` — the demo, the playground and the API reference. Private, never published; the Pages workflow deploys it from `apps/site/.pages`.

Workspaces are [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces). `npm install` at the
root installs every package and links them to each other, so `apps/site` resolves `hugframe` through the
workspace rather than the registry.

## Working on this repository

```sh
npm install
npx playwright install chromium   # once, for the end-to-end suite
npm run dev          # the demo on http://localhost:5176
npm run build        # every package
npm run build:pages  # the demo plus the API reference, assembled into apps/site/.pages
npm test             # the node:test suites
npm run test:e2e     # builds the Pages site, serves it locally, and drives it in Chromium
npm run lint         # prettier --check
```

The site consumes the built library rather than its source, so a package has to be built before the site
can be. The site's own scripts build it first, which is why `npm run dev` and `npm run test:e2e` work
from a clean checkout. While iterating on the library, `npm run build --workspace packages/hugframe -- --watch`
rebuilds it as you edit.

The end-to-end suite drives a real Chromium, so run `npx playwright install chromium` once.
`npm run test:e2e` builds the Pages output, serves it on a free port under the `/hugframe/` prefix, runs
every browser suite against that local build, and exits non-zero if any of them fails. Set `GF_BASE` to
point a suite at another deployment instead.

Every pull request against `main` gets the built site as a preview at
`https://tiriana.github.io/hugframe/pr-preview/pr-<number>/`, removed again when the pull request closes.
That preview is one directory deeper than the deployment, so `npm run build:pages` reads `GF_BASE_PATH` to
write a different prefix into the asset URLs; the preview workflow sets it to
`/hugframe/pr-preview/pr-<number>/`. The default stays `/hugframe/`.

That removal rides on a workflow run, and a merge can cancel it before it starts, so a preview can outlive
its pull request. A scheduled sweep reconciles `pr-preview/` against the pull requests' state and removes
any directory whose pull request is no longer open.

Releases are automated from Conventional Commits. See [RELEASING.md](RELEASING.md) for what a merge to
`main` does and how to add a package to the release.

## License

MIT.
