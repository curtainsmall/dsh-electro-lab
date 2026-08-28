# DeepSeek Harness ElectroLab

面向 DeepSeek Harness 的电气电子计算插件:电路分析、瞬态、滤波器、信号质量、噪声与单位换算——所有数值均为 SI 基本单位的自描述复数值对象。

[English](../README.md) | [简体中文](README.zh-CN.md)

## 功能

- **计算** —— 复数表达式求值、有理系数代数与数列求和。
- **电路** —— 阻抗网络、匹配、滤波器、瞬态与谐振。
- **电子学** —— 运放配置、分压器与 LED 驱动。
- **射频与传输线** —— 史密斯圆图、反射、匹配与传输线参数。
- **信号质量** —— 失真、抖动与 ADC 预算。
- **噪声与分贝** —— 噪声源与分贝换算。
- **DSP** —— 变换、统计与传递函数。
- **单位换算** —— 同一族任意单位互转。
- **工作流** —— 多步编排、客户端面板（已完结运行记录）与随包智能体预设。

全部工具见[tools.zh-CN.md](tools.zh-CN.md)。

## 安装

```sh
dsh plugin --profile web add dsh-electro-lab
```

已发布到 npm —— 稳定版位于 `latest` dist-tag,预发布版本位于 `beta`。

## 使用

插件挂载时注册其工具、技能与 `electro-lab` 智能体预设。新建会话时选择该预设:所有数值必须来自工具调用,条件不足时预设会停止。

## 开发

开发环境、提交规范与发布流程详见[参与贡献](CONTRIBUTING.zh-CN.md)。

## 文档

- [tools.zh-CN.md](tools.zh-CN.md)
- [参与贡献](CONTRIBUTING.zh-CN.md)

## 许可

MIT © 2026 curtainsmall
