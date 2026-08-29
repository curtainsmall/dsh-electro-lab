# 参与贡献

感谢你对 **DeepSeek Harness ElectroLab** 的关注与贡献。

[English](../.github/CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

## 开发流程

```
develop   ← 所有开发在此进行
main      ← 仅发布（PR 合并、打 tag、GitHub Actions）
```

- **`develop`** —— 默认分支。所有进行中的提交、实验、已合并的功能分支都落在 develop 上。
- **`feature/*`** —— 贡献者可选的短期分支，通过 PR 合并回 `develop`。
- **`main`** —— 仅发布。任何情况下禁止直接提交或推送。

## 拉取请求（PR）

- 所有 PR 目标为 **`develop`**（贡献者也可选择 `feature/*`）；**绝不能指向 `main`**。
- 将 `develop` 合并进 `main`、打发布 tag、发布版本号，**仅限仓库所有者操作**。
- 远程规则集强制了这一约束：`main` 要求走 PR（直接推送会被拒绝），develop/tag 规则仅所有者可绕过。

## 提交信息

- 使用 **Conventional Commits** 格式：`type(scope): subject` —— 例如 `feat(expression): ...`、`fix(preset): ...`、`ci(release): ...`。
- 类型：`feat`、`fix`、`refactor`、`docs`、`test`、`chore`、`perf`、`build`、`ci`、`revert`。
- subject 用英文、祈使语气、小写开头。

## 开发环境

- 工具链：**pnpm 11**、**Node ≥ 20**（CI 使用 Node 24）、TypeScript + tsdown + vitest。
- 安装与验证：

  ```sh
  pnpm install
  pnpm typecheck
  pnpm test
  pnpm build
  ```

- 测试位于 `tests/`（与 `src/` 同级，目录结构镜像：`tests/math/`、`tests/tools/`）；每个单元在对应分组内提供 `*.test.ts`。
- 宿主插件在挂载时注册工具、技能与随包 `electro-lab` 预设；`pnpm build` 重新生成 `lib/`（已 gitignore，发布时全新构建）。

## 发布

仅限所有者操作。一次发布 = 一个 tag：

1. 同步更新 `package.json`、`dsh.plugin.json`，并在 `CHANGELOG.md` 添加对应条目（最新条目必须等于新版本号）。
2. 推送 `develop`，向 `main` 发起 PR，CI（`build`）通过后合并。
3. 在 `main` 上打 `vX.Y.Z` 并推送 —— 发布工作流校验 tag 位于 `main` 且版本一致，然后发布到 npm（OIDC 可信发布）并创建 GitHub Release。
4. 预发布版本（`x.y.z-*`）发布到 `beta` dist-tag，并在 GitHub 上标记为预发布。

## 文档

- README 只记录**已实现**的功能 —— 保持简单、与现状一致。
- 文档**双语**：英文版放在规范位置，简体中文版放在 `docs/` 下同名文件（`xxx.zh-CN.md`）。changelog 仅英文。
- 简体中文文档中，分贝术语写作**分贝**。
- 规划/路线图内容在成为实际工作之前不提交进仓库，另行跟踪。

## 许可

通过参与贡献，你同意你的贡献以 [MIT 许可](../LICENSE) 授权。
