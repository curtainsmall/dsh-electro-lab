# dsh-electro-lab

**ElectroLab** —— 用于解决电工电子问题的 DeepSeek Harness 插件。

[English](../README.md) | [简体中文](README.zh-CN.md)

## 功能

- **计算引擎** —— 复数表达式求值（`calculate`、`rational_coefficients`）、反三角函数与双参数 `atan2`。
- **传递函数核心** —— 零极点、部分分式、Bode 与阶跃响应、z 域幂级数展开。
- **数字信号处理** —— DFT/IDFT（基 2 FFT）、傅里叶级数、窗函数、差分方程、信号统计。
- **电路工具** —— 嵌套网络阻抗、L/π/T 匹配网络、巴特沃斯滤波器设计、RC/RL 瞬态、谐振。
- **电子学工具** —— 运放配置、分压器、LED 限流电阻、时间常数、传输线原语（同轴线、四分之一波长变换器、上升时间/带宽）、反射系数/VSWR/回波损耗。
- **噪声与分贝** —— 热噪声、Friis 级联、量化信噪比、分贝电平与比值换算（dBm/dBu/dBµV/dBW）。
- **单位换算** —— 常见非 SI 单位（°C/°F、bar/psi/atm、cal/kWh、hp、inch/mile、lb/oz）换算为对应 SI 基本量。
- **`solve_steps`** —— 多步求解器,通过 `@stepN` 引用串联工具结果。
- **客户端 UI** —— 工作台面板与交互式史密斯圆图。
- **随包智能体预设与技能** —— `electro-lab` 预设在任何工具调用之前进行门控;技能 `electro-lab-template` 与 `electro-lab-interface` 随插件提供。

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

- [参与贡献](../.github/CONTRIBUTING.md)
- [English](../README.md)

## 许可

MIT © 2026 curtainsmall
