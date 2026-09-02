# DeepSeek Harness ElectroLab

面向 DeepSeek Harness 的电气电子计算插件。

[English](../README.md) | [简体中文](README.zh-CN.md)

## 安装

```sh
dsh plugin --profile web add dsh-electro-lab
```

## ElectroLab 模式

插件以智能体预设的形式工作：新建会话时选择 **ElectroLab 模式**，直接用自然语言提出任意电气电子计算问题即可。会话被隔离在插件的计算工具内——无 shell、无文件系统、无网络——因此答案里的每个数字都来自工具调用结果；条件不足时智能体会停下并追问。

工具集覆盖电路、信号与电子学计算，支持复数、精确单位换算，且求解结果总带有校验。工具由**智能体调用，而非你手动输入**——你描述问题，它挑选工具、喂入条件并汇报结果。工具列表见[tools.zh-CN.md](tools.zh-CN.md)。

每次求解都落盘存档，可在客户端面板浏览：检视完整记录、导出或删除。一键即可把任意已结算记录通过宿主 LLM 生成为完整技术文章并保存到磁盘。文章支持两种输出格式：

| 格式 | 说明 |
|---|---|
| Markdown | 纯文本文章，随处可读可编辑 |
| LaTeX | XeLaTeX 排版源文件，可选编译为 PDF |

## 开发

开发环境、提交规范与发布流程详见[参与贡献](CONTRIBUTING.zh-CN.md)。

## 文档

- [tools.zh-CN.md](tools.zh-CN.md)
- [参与贡献](CONTRIBUTING.zh-CN.md)

## 许可

MIT © 2026 curtainsmall
