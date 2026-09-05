# Contributing

Thanks for your interest in contributing to **DeepSeek Harness ElectroLab**.

[English](CONTRIBUTING.md) | [简体中文](../docs/CONTRIBUTING.zh-CN.md)

## Development process

```
develop   ← all development happens here
main      ← release only (PR merge, tagged, GitHub Actions)
```

- **`develop`** — default branch. All work-in-progress commits, experiments, and merged feature branches land here.
- **`feature/*`** — optional short-lived branches for contributors; merged back into `develop` via PR.
- **`main`** — release only. No direct commits or pushes, ever.

## Pull requests

- All PRs target **`develop`** (or `feature/*` when the contributor prefers); **never `main`**.
- Merging `develop` into `main`, tagging releases, and publishing versions are **reserved to the repo owner only**.
- The remote enforces this: `main` requires a pull request (direct pushes are rejected), and only the owner can bypass `develop`/tag rules.

## Commit messages

- Use **Conventional Commits**: `type(scope): subject` — e.g. `feat(expression): ...`, `fix(preset): ...`, `ci(release): ...`.
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `revert`.
- Write the subject in English, imperative mood, lowercase.

## Development setup

- Toolchain: **pnpm 11**, **Node ≥ 20** (CI runs Node 24), TypeScript + tsdown + vitest.
- Setup and verify:

  ```sh
  pnpm install
  pnpm typecheck
  pnpm test
  pnpm build
  ```

- Tests live in `tests/` (sibling of `src/`, layout mirrored: `tests/math/`, `tests/engine/`, `tests/tool-declarations/`); each unit ships a `*.test.ts` next to its group.
- The host plugin registers the engine tools (`set` / `get` / `call` + the record markers), skills, and the packaged `electro-lab` preset; `pnpm build` regenerates `lib/` (gitignored, built fresh on publish).

## Release

Reserved to the owner. One release = one tag:

1. Bump `package.json`, `dsh.plugin.json`, and add the matching `CHANGELOG.md` entry (latest entry must equal the new version).
2. Push `develop`, open a PR to `main`, merge once CI (`build`) passes.
3. Tag `vX.Y.Z` on `main` and push it — the release workflow guards tag-on-`main` and version consistency, then publishes to npm (OIDC trusted publishing with `NPM_TOKEN` fallback) and creates a GitHub Release.
4. Prerelease versions (`x.y.z-*`) publish under the `beta` dist-tag and are marked prerelease on GitHub.

## Documentation

- README documents **implemented** features only — keep it simple and current.
- Docs are **dual-language**: en-US version in the canonical location, the Simplified Chinese version next to it under `docs/` with matching name (`xxx.zh-CN.md`). The changelog is English-only.
- In Simplified Chinese docs, write **分贝** for the decibel term; unit symbols (`dBm`, `dBu`, `dBµV`, `dBW`) stay unchanged.
- Plan/roadmap items are not committed to the repo until they become real work; track them elsewhere.

## License

By contributing, you agree your contributions are licensed under the [MIT License](../LICENSE).
