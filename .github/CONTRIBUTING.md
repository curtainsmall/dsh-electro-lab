# Contributing

Thanks for your interest in contributing to **dsh-electro-lab**.

[English](CONTRIBUTING.md) | [简体中文](../docs/CONTRIBUTING.zh-CN.md)

## Development process

```
develop   ← all development happens here
main      ← release only (tagged, GitHub Actions)
```

- **`develop`** — default branch. All work-in-progress commits, experiments, and merged feature branches land here.
- **`feature/*`** — optional short-lived branches for contributors; merged back into `develop` via PR.
- **`main`** — release only. No direct commits or pushes, ever.

## Pull requests

- All PRs target **`develop`** (or `feature/*` when the contributor prefers); **never `main`**.
- Merging `develop` into `main`, tagging releases, and publishing versions are **reserved to the repo owner only**.

## Documentation

- README documents **implemented** features only — keep it simple and current.
- Docs are **dual-language**: en-US version in the canonical location, the Simplified Chinese version next to it under `docs/` with matching name (`xxx.zh-CN.md`).
- Plan/roadmap items are not committed to the repo until they become real work; track them elsewhere.

## Development setup

TBD — the build toolchain (TypeScript, tsdown, …) lands with the first code commit.

## License

By contributing, you agree your contributions are licensed under the [MIT License](../LICENSE).
