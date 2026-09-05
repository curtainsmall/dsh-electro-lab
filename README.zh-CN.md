# DeepSeek Harness ElectroLab

面向 DeepSeek Harness 的电气电子计算插件。

[English](README.md)

## 安装

```sh
dsh plugin --profile web add dsh-electro-lab
```

## ElectroLab 模式

插件以智能体预设的方式工作：新建会话时选择 **ElectroLab 模式**，然后用自然语言提出任意电气电子计算问题即可。会话被隔离在插件的工具内——无 shell、无文件系统、无网络——因此答案里的每个数字都来自状态机；条件不足时智能体会停下并追问。

全部计算都发生在一台确定性的**状态机**内。智能体通过三个原语操作它——`set`（把一个类型化值写入槽）、`get`（读取一个槽）与 `call`（运行 38 个数学求解器之一并存储结果）——两端由记录标记 `record_question` / `record_analyse` / `record_answer` 括起。类型化值自带 kind、variant 与 prefix（例如 `{type: "number", value: 25, kind: "temperature", variant: "degC"}`）；状态机按原样存储它们，只在计算边界执行 SI 与单位换算。每一步都落在每条记录专属的轨迹文件中，因此每次求解都是一条可重现的过程，可在不重新计算的前提下重放。

求解器目录覆盖表达式代数、级数、传递函数、DSP/DFT、信号质量（THD、抖动、ADC 预算）、电路（阻抗、谐振、瞬态、交流功率）、电子学（运放、分压器、LED）、射频与史密斯圆图（反射、匹配网络）、传输线、噪声与滤波器设计。详见[状态机手册](docs/tools.zh-CN.md)。

已结算记录列在客户端面板的**「记录」页**中（由 `record-index.jsonl` 索引，每 5 秒刷新）；未完成的记录会照实标记为 incomplete。记录本体是 `~/.dsh-electro-lab/records/` 下的过程轨迹。

## 外部求解器

除内置求解器外，你还可以注册自己的计算求解器，经 **http** 或 **file** 传输访问。声明（名称、描述、参数、显式的 **returns** 形状、传输选项）存放于 `~/.dsh-electro-lab/external-solvers.jsonl`；状态机启动时，每条启用的声明都会作为外部求解器注册，因此更改在宿主重启后生效。可通过管理工具（`external_solver_add` / `external_solver_update` / `external_solver_delete`）或记录面板的**「外部求解器」页**注册——该页还能编辑、启用/停用与删除声明。线协议是类型化信封：`{requestId, args}` → `{requestId, result}`（类型化值，void 时为 `null`）或 `{requestId, error}`——只发 POST、只传类型化值、线上不出现符号。

[`external-solvers-example/`](external-solvers-example/README.zh-CN.md) 是独立的 npm 工程，内含该功能的手动测试对端——`node src/echo.ts http` / `file` 可将信封协议端到端回显。

## 开发

开发环境、提交规范与发布流程详见[参与贡献](docs/CONTRIBUTING.zh-CN.md)。

## 文档

- [状态机手册](docs/tools.zh-CN.md)（另见 [English](docs/tools.md)）
- [external-solvers-example](external-solvers-example/README.zh-CN.md)
- [参与贡献](docs/CONTRIBUTING.zh-CN.md)

## 许可

MIT © 2026 curtainsmall
