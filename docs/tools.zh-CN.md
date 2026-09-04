# 工具目录

DeepSeek Harness ElectroLab 插件的全部工具，按领域分组。所有工具遵循同一值契约：值参数是裸数字（实数值）或紧凑复数对象——`{re, im}`（直角坐标）或 `{mag, ang}`（极坐标，ang 为弧度）。每个参数的声明固定其数量 kind。输出为 `{re, im, kind, mag, ang}` 快照，均为 SI 基本单位。✅ 标记组合工具（一次调用编排多个数学内核）。

[English](tools.md)

## 表达式与代数

| 工具 | 用途 |
|---|---|
| `calculate` | 复数表达式求值（算术、函数、符号绑定） |
| `rational_coefficients` | 表达式 → 有理分子/分母系数对 |

## 数列求和

| 工具 | 用途 |
|---|---|
| `series_sum` | 等差、等比（有限项或收敛无穷项）与幂和（Σk、Σk²、Σk³） |

## 传递函数与频域

| 工具 | 用途 |
|---|---|
| `poles_zeros` | 传递函数的零极点 |
| `partial_fraction` | 部分分式展开（含多项式部分） |
| `transfer_function_response` | 传递函数在频率点上的响应 |
| `step_response` | s 域阶跃响应 |
| `difference_equation_response` | 差分方程递推（Laurent a/b 约定） |
| ✅ `bode_response` | 对数网格 + 响应 + dB/相位换算，一次调用 |
| `power_series_expansion` | z⁻¹ 级数 = 冲激响应 h[n] |

## 数字信号处理

| 工具 | 用途 |
|---|---|
| `discrete_fourier_transform` | DFT（基 2 FFT，直和回退；窗在内部应用） |
| `inverse_discrete_fourier_transform` | 共轭法 IDFT |
| `fourier_series_coefficients` | 标准周期波形系数 |
| ✅ `signal_analysis` | 统计（RMS/峰值/DC）+ 加窗频谱，一次调用 |

## 信号质量

| 工具 | 用途 |
|---|---|
| `thd` | 采样信号的总谐波失真（频谱折叠感知） |
| `jitter_snr` | 时钟抖动 SNR 上限：−20·log10（2π·f·tⱼ） |
| ✅ `adc_budget` | 量化 + 抖动 + 热噪声 → 总 SNR 与 ENOB |

## 电路

| 工具 | 用途 |
|---|---|
| `equivalent_impedance` | 复阻抗串联/并联等效 |
| ✅ `circuit_impedance` | 嵌套网络树的驱动点阻抗 |
| `resonance` | LC 谐振：f₀、Q、带宽 |
| `ac_power` | 视在/有功/无功功率与功率因数 |
| ✅ `transient_response` | 一阶/二阶瞬态（rc/rl/rlc kind，含阻尼状态） |

## 电子学

| 工具 | 用途 |
|---|---|
| ✅ `opamp_configurations` | 七种理想运放配置（按配置分发） |
| `time_constant` | τ = RC 或 L/R，含截止频率 |
| `voltage_divider` | 分压器，带载或不带载 |
| `led_resistor` | LED 限流电阻与耗散功率 |

## 射频与史密斯圆图

| 工具 | 用途 |
|---|---|
| `impedance_to_reflection` | 阻抗 → 反射系数 Γ |
| `reflection_to_vswr` | Γ → VSWR |
| `return_loss` | Γ → 回波损耗（dB） |
| `quarter_wave_transformer` | Z1 = √（Z0·ZL） |
| ✅ `matched_network` | L/π/T 匹配网络，含电抗→L/C 换算 |

## 传输线

| 工具 | 用途 |
|---|---|
| `wavelength_frequency` | λ = c·vf/f |
| `coaxial_parameters` | 同轴线阻抗、速度因子、单位长度 C′/L′ |
| `rise_time_bandwidth` | tr ≈ 0.35/BW 换算 |

## 噪声

| 工具 | 用途 |
|---|---|
| `thermal_noise` | 约翰逊噪声功率 k·T·B（W） |
| `cascade_noise_figure` | Friis 多级级联 |
| `quantization_noise` | 理想量化器 SNR:6.02·N + 1.76 dB |

## 滤波器

| 工具 | 用途 |
|---|---|
| ✅ `filter_design` | 巴特沃斯低通梯形设计，含衰减校验 |

## 单位换算

| 工具 | 用途 |
|---|---|
| `convert_unit` | 换算到同一族任意单位（°C/°F/K、bar/psi/atm/Pa、cal/kWh/J、hp/W、inch/mile/m、lb/oz/kg、degree→radian、ratio ↔ dB） |

## 文本 ↔ 值编解码

| 工具 | 用途 |
|---|---|
| `parse_value` | 把文本量解析为 SI 基单位的规范值载荷：SI 前缀 p…T、单位（Hz、Ω/ohm、F、H、V、A、W、s、rad、°/deg、K、°C、°F、dB）、复数 `1+2j` 与极坐标 `3 ∠ 0.5` |
| `format_value` | 把值载荷渲染为文本：工程前缀（auto/none/显式）与按 kind 的单位，如 `0.1 F` → `100 mF`、`1 + 2j Ω`、`3 ∠ 0.5 rad V` |

## 编排

| 工具 | 用途 |
|---|---|
| `solve_steps` | 元工具：按步骤串行执行，支持 `@stepN` 引用 |

## 记录

| 工具 | 用途 |
|---|---|
| `record_question` | 开启一条记录并提交合并后的问题；重复开启会把当前记录结算为 duplicate-start 错误记录 |
| `record_analyse` | 向当前记录提交分析文本 |
| `record_answer` | 提交答案文本并立即结算；若文本是合并的完整模板会自动拆分 |

## 外部工具

外部工具是用户自有的计算工具，宿主经 http 或文件传输调用。声明存放于插件主目录（`~/.dsh-electro-lab`）下的 `external-tools.jsonl`；插件启动时，每条未被显式停用的声明都会被编译并注册为工具，因此任何更改都要在重启宿主后生效。声明沿用与内置工具相同的值语法：数量参数接受裸数字或紧凑复数对象——`{re, im}`（直角坐标）或 `{mag, ang}`（极坐标，角度为弧度）；数组参数声明同质 items。保存声明即授权其传输方式。管理工具负责编辑声明档案；记录面板的“外部工具”页提供同样的操作。

失败与内置工具走**同一条错误通道**。外部端点表达「计算失败」时返回 `{requestId, error: "…"}`——若同时带有 `result` 字段则被忽略——宿主把错误内容提升为 code 为 `EXTERNAL_ERROR` 的 `ToolError`。传输类失败由宿主自己抛出：`EXTERNAL_HTTP`（http 状态）、`EXTERNAL_TIMEOUT`（超时）、`EXTERNAL_RESPONSE`（协议违规：requestId 不匹配、缺少 result、error 非字符串）。无论来源是抛出的错误还是上述响应形态之一，调用都会以同一种结构化错误结果呈现给智能体，并以 name/code 记入记录。

| 工具 | 用途 |
|---|---|
| `external_tool_add` | 注册新的外部工具声明（名称已存在时报错） |
| `external_tool_update` | 替换已有的外部工具声明（名称不存在时报错） |
| `external_tool_delete` | 按名称删除外部工具声明 |
