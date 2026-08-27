# 工具目录

DeepSeek Harness ElectroLab 插件的全部工具,按领域分组。所有工具遵循同一值对象契约:输入为 `{form, re, im, kind}`(rect)或 `{form, mag, angRad, kind}`(polar),均为 SI 基本单位;输出为 `{re, im, kind, mag, angRad}` 快照。✅ 标记组合工具(一次调用编排多个数学内核)。

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
| ✅ `bode_response` | 对数网格 + 响应 + dB/相位换算,一次调用 |
| `power_series_expansion` | z⁻¹ 级数 = 冲激响应 h[n] |

## 数字信号处理

| 工具 | 用途 |
|---|---|
| `discrete_fourier_transform` | DFT（基 2 FFT,直和回退;窗在内部应用） |
| `inverse_discrete_fourier_transform` | 共轭法 IDFT |
| `fourier_series_coefficients` | 标准周期波形系数 |
| ✅ `signal_analysis` | 统计（RMS/峰值/DC）+ 加窗频谱,一次调用 |

## 信号质量

| 工具 | 用途 |
|---|---|
| `thd` | 采样信号的总谐波失真（频谱折叠感知） |
| `jitter_snr` | 时钟抖动 SNR 上限:−20·log10(2π·f·tⱼ) |
| ✅ `adc_budget` | 量化 + 抖动 + 热噪声 → 总 SNR 与 ENOB |

## 电路

| 工具 | 用途 |
|---|---|
| `equivalent_impedance` | 复阻抗串联/并联等效 |
| ✅ `circuit_impedance` | 嵌套网络树的驱动点阻抗 |
| `resonance` | LC 谐振:f₀、Q、带宽 |
| `ac_power` | 视在/有功/无功功率与功率因数 |
| ✅ `transient_response` | 一阶/二阶瞬态（rc/rl/rlc kind,含阻尼状态） |

## 电子学

| 工具 | 用途 |
|---|---|
| ✅ `opamp_configurations` | 七种理想运放配置（按配置分发） |
| `time_constant` | τ = RC 或 L/R,含截止频率 |
| `voltage_divider` | 分压器,带载或不带载 |
| `led_resistor` | LED 限流电阻与耗散功率 |

## 射频与史密斯圆图

| 工具 | 用途 |
|---|---|
| `impedance_to_reflection` | 阻抗 → 反射系数 Γ |
| `reflection_to_vswr` | Γ → VSWR |
| `return_loss` | Γ → 回波损耗（dB） |
| `quarter_wave_transformer` | Z1 = √(Z0·ZL) |
| ✅ `matched_network` | L/π/T 匹配网络,含电抗→L/C 换算 |

## 传输线

| 工具 | 用途 |
|---|---|
| `wavelength_frequency` | λ = c·vf/f |
| `coaxial_parameters` | 同轴线阻抗、速度因子、单位长度 C′/L′ |
| `rise_time_bandwidth` | tr ≈ 0.35/BW 换算 |

## 噪声

| 工具 | 用途 |
|---|---|
| `thermal_noise` | 约翰逊噪声功率 k·T·B（W 与 dBm） |
| `cascade_noise_figure` | Friis 多级级联 |
| `quantization_noise` | 理想量化器 SNR:6.02·N + 1.76 dB |

## 分贝与对数

| 工具 | 用途 |
|---|---|
| `db_convert` | 绝对电平多参考换算（W/dBm/dBW/V/dBu/dBµV） |
| `decibel_ratio` | 比值 ↔ 分贝（线性量 10·log10,二次量 20·log10） |

## 滤波器

| 工具 | 用途 |
|---|---|
| ✅ `filter_design` | 巴特沃斯低通梯形设计,含衰减校验 |

## 单位换算

| 工具 | 用途 |
|---|---|
| `convert` | 换算到同一族任意单位（°C/°F/K、bar/psi/atm/Pa、cal/kWh/J、hp/W、inch/mile/m、lb/oz/kg、degree→radian、ratio ↔ dB） |

## 编排

| 工具 | 用途 |
|---|---|
| `solve_steps` | 元工具:按步骤串行执行,支持 `@stepN` 引用 |
