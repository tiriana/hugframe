# Releasing

Releases are automated. Merging to `main` is the only trigger.

## What happens on a merge to main

1. The `Release` workflow runs [release-please](https://github.com/googleapis/release-please) over the commits since the last release.
2. release-please opens or updates one Release PR. It bumps the version in each released package's manifest, writes that package's `CHANGELOG.md`, and updates the version every other package depends on.
3. Merging that PR tags each released package, creates its GitHub Release, and the workflow dispatches the publish workflow once per tag.
4. The publish workflow resolves the tag to a package, builds it, and publishes it to the registry over OIDC. The dispatch is explicit because a release created with the default `GITHUB_TOKEN` does not trigger the `release: published` workflow run; `workflow_dispatch` is the exemption that makes this work.

## The Release PR is authored by a GitHub App

GitHub holds the `pull_request` runs of a pull request created by a workflow using `GITHUB_TOKEN` in
`action_required` until a maintainer approves them, and no repository setting exempts a bot. release-please
therefore pushes as a GitHub App, so the Release PR's checks run by themselves, and the workflow then puts
that PR into auto-merge, squashed exactly as release PRs have been merged so far.

The App path engages once all of this exists:

1. A GitHub App installed on this repository with **Contents: write**, **Pull requests: write** and
   **Issues: write**.
2. The repository variable `RELEASE_APP_CLIENT_ID`, holding the App's **Client ID**, and the repository
   secret `RELEASE_APP_PRIVATE_KEY`, holding its private key.
3. **Allow auto-merge** enabled in the repository settings (`allow_auto_merge`).

Until then the workflow falls back to `GITHUB_TOKEN` (`steps.app-token.outputs.token || secrets.GITHUB_TOKEN`),
so releases keep working, with the approval prompt that has always been there.

## Commit messages decide the version

| Commit                                         | Release |
| ---------------------------------------------- | ------- |
| `fix: ...`                                     | patch   |
| `feat: ...`                                    | minor   |
| `feat!: ...` or a `BREAKING CHANGE:` footer    | major   |
| `chore:`, `docs:`, `ci:`, `test:`, `refactor:` | nothing |

A message that does not parse as [Conventional Commits](https://www.conventionalcommits.org/) is rejected by the `commit-msg` git hook. `npm install` installs that hook through the `prepare` script, so run it once after cloning.

## Versions live in the manifests

release-please writes the released version into each package's `package.json` and records it in
`.release-please-manifest.json`. The Release PR is the only thing that changes either, so `main` only
receives version commits through a normal pull request merge and no branch-protection exemption is
needed.

## Tag format

Each package is tagged `<component>-v<version>`, for example `hugframe-v2.0.1`. The component is declared
per package in `release-please-config.json`. Tags are per package because two packages can carry the same
version number.

## Adding a package to the release

Add its directory to `packages` in `release-please-config.json`, add the same directory to `workspaces` in
the root `package.json`, and give it an entry in `.release-please-manifest.json` naming its current
version. Without that manifest entry release-please treats the package as never released and collects the
entire commit history into its first changelog.

## Re-running a failed publish

Re-run the failed publish workflow from the Actions tab, or dispatch it by hand with the tag:

```sh
gh workflow run publish.yml --field tag=hugframe-v2.0.1
```

Either way it reads the version from the package manifest at that tag, so it needs no new release and no
new tag. A version that is already on the registry is skipped rather than failing the run.

## Publishing credentials

The publish workflow authenticates with OpenID Connect, so no long-lived registry token is stored in this
repository. Register the publisher once per package, then delete the section that does not apply to this
project. A package whose trusted publisher is not registered yet fails its publish with a `404` on the
`PUT`, which is how `@hugframe/react`'s first release never reached npm, so register the publisher before a
package's first release rather than after.

For npm:

1. Open the package on npmjs.com, then Settings, then Trusted publishing.
2. Add a GitHub Actions publisher with the repository and the workflow filename `publish.yml`.
3. Make `package.json` `repository.url` match the GitHub repository exactly. npm rejects a mismatch, and a smoke test in `packages/hugframe/test/smoke.test.cjs` guards the shape of that field.

For PyPI:

1. Open the project on PyPI, then Publishing, then add a trusted publisher.
2. Set the owner, repository, workflow filename `publish.yml` and environment name `pypi`.
3. Create the `pypi` environment in the repository settings if a release should wait for approval.

The environment names (`npm`, `pypi`) in the workflow files only have to match if you set an environment on the registry side.
