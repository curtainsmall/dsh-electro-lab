# DeepSeek Harness ElectroLab

面向 DeepSeek Harness 的电气电子计算插件:电路分析、瞬态、滤波器、信号质量、噪声与单位换算——所有数值均为 SI 基本单位的自描述复数值对象。

[English](../README.md) | [简体中文](README.zh-CN.md)

## 功能

- **ElectroLab 模式** —— **ElectroLab 模式** 智能体预设把会话隔离在插件的计算工具内:无 shell、无文件系统、无网络。
- **可信任的计算** —— 每个数字都来自工具调用结果,绝不来自记忆或手算。
- **记录供检视** —— 每次五步求解都落盘存档,可在客户端面板浏览。

全部工具见[tools.zh-CN.md](tools.zh-CN.md)。

## 安装

```sh
dsh plugin --profile web add dsh-electro-lab
```

已发布到 npm —— 稳定版位于 `latest` dist-tag,预发布版本位于 `beta`。

## 使用

插件挂载时注册其工具、技能与 **ElectroLab 模式** 智能体预设。新建会话时选择该预设:所有数值必须来自工具调用,条件不足时预设会停止。

## 开发

开发环境、提交规范与发布流程详见[参与贡献](CONTRIBUTING.zh-CN.md)。

## 文档

- [tools.zh-CN.md](tools.zh-CN.md)
- [参与贡献](CONTRIBUTING.zh-CN.md)

## 许可

MIT © 2026 curtainsmall
