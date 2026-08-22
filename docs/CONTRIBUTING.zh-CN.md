# 参与贡献

感谢你对 **dsh-electro-lab** 的关注与贡献。

[English](../.github/CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

## 开发流程

```
develop   ← 所有开发在此进行
main      ← 仅发布（打 tag，GitHub Actions）
```

- **`develop`** —— 默认分支。所有进行中的提交、实验、已合并的功能分支都落在 develop 上。
- **`feature/*`** —— 贡献者可选的短期分支，通过 PR 合并回 `develop`。
- **`main`** —— 仅发布。任何情况下禁止直接提交或推送。

## 拉取请求（PR）

- 所有 PR 目标为 **`develop`**（贡献者也可选择 `feature/*`）；**绝不能指向 `main`**。
- 将 `develop` 合并进 `main`、打发布 tag、发布版本号，**仅限仓库所有者操作**。

## 文档

- README 只记录**已实现**的功能 —— 保持简单、与现状一致。
- 文档**双语**：英文版放在规范位置，简体中文版放在 `docs/` 下同名文件（`xxx.zh-CN.md`）。
- 规划/路线图内容在成为实际工作之前不提交进仓库，另行跟踪。

## 开发环境

待定 —— 构建工具链（TypeScript、tsdown 等）随第一个代码提交一并落地。

## 许可

通过参与贡献，你同意你的贡献以 [MIT 许可](../LICENSE) 授权。
