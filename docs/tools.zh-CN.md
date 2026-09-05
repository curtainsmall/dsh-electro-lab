# ElectroLab 状态机手册

[English](tools.md)

DeepSeek Harness ElectroLab 插件把全部电气电子计算放在一台确定性的**状态机**内完成。语言模型从不亲自计算：它通过三个原语与三个记录标记操作状态机，状态机维护一张类型化值变量表，在计算边界换算数值，记录每一步，并把每次求解封口成一条可浏览的记录。

本手册是状态机使用面的完整参考——类型化值、原语、标记、函数目录、存储与外部函数。以 **ElectroLab 模式**启动的会话，会经由 `electro-lab-interface` 技能（状态机手册）与 `electro-lab-template` 技能（记录协议）携带同样的规则。

## 1. 工作原理

- **每个宿主进程一台全局状态机。** 任何会话的标记都作用于同一台状态机；任何时刻至多有一条未封口记录（单一 open 不变量）。
- **LLM 使用面只有六个工具**：`set`、`get`、`call`、`record_question`、`record_analyse`、`record_answer`——外加声明管理器 `external_fns_add` / `external_fns_update` / `external_fns_delete`。约 40 个领域工具、`solve_steps` 与文本↔值编解码工具已退役；数学内核住在状态机的 fn 注册表中，由 `call` 调用。
- **记录是一个过程（时间线）。** 每次状态机操作都会追加一行完全自描述的轨迹行（输入与输出都记录在案）；一条记录可以被重放，从而在不重新计算任何东西的前提下重建任意时刻的状态。
- **输入即值。** 模型给什么，状态机就存什么；字符串永远是字符串。

## 2. 类型化值

类型化值是一个 JSON 对象。`kind` 是 quantity 的一部分：

```json
{ "type": "number",  "value": 100,  "kind": "resistance" }
{ "type": "number",  "value": 25,   "kind": "temperature", "variant": "degC" }
{ "type": "number",  "value": 1500, "kind": "resistance",  "prefix": "kilo" }
{ "type": "complex", "value": { "re": 100, "im": 0 }, "kind": "voltage" }
{ "type": "complex", "value": { "mag": 220, "ang": 0.5236 }, "kind": "voltage" }
{ "type": "string",  "value": "lowpass" }
{ "type": "boolean", "value": true }
```

- `type`——形状判别符：number / complex / string / boolean / array（items 递归）/ object（fields 递归）。
- `kind`——量纲类别（resistance、voltage、time、frequency、temperature、angle、pressure、energy、length、mass、log、none……）。kind 是 quantity 的一部分：值一经存在必带 kind；裸数的 kind 为 `none`；纯 ratio 的 kind 为 `log`。
- `variant`——kind *内部*的一种表示选择。**字段不存在（而非 null）即 SI 基准表示**；存储从不补键。只有下列词是合法的，且每个词只适用于它自己的 kind：

| kind | variant 词 | 基准（无键） |
|---|---|---|
| temperature | degC, degF | K |
| angle | deg | rad |
| pressure | bar, psi, atm | Pa |
| energy | cal, Wh | J |
| power | hp | W |
| length | inch, foot, yard, mile | m |
| mass | lb, oz | kg |

- `prefix`——number/complex 上的量级乘数。**字段不存在即乘数 1。** 词表是完整的小写英文单词，绝不用符号：`pico` `nano` `micro` `milli` `kilo` `mega` `giga` `tera`。prefix 一般只对 SI 基准表示有效（variant 词拒绝前缀）。
- 词表与存储一律是短 ASCII 文本；符号（Ω、°、µ……）从不进入值宇宙。

### 换算边界

变量表按**原样**存储值——`get` 返回的正是 `set` 写入的内容，不做归一化。换算只发生在值被计算*引用*时：在 `call` 边界，状态机把 variant 换算为 SI（degC → K、deg → rad、psi → Pa……），并把复数形状归一化（`{mag, ang}` → `{re, im}`，角度恒为弧度）。变量表不受影响；轨迹同时记录原始 args 与换算后的终点值。

## 3. 原语

```
set  { name, value }     write one slot: value = a typed value; value: null deletes the slot
get  { name }            read one slot (the stored typed value, exactly as written)
call { fn, args, target }  call one registered fn; args values are typed values or "@name" references
```

语义：

- `"100 kΩ"` 永远是字符串；表示 100 kΩ 的电阻，必须给 `{ "type": "number", "value": 100, "kind": "resistance", "prefix": "kilo" }`。
- `@name` / `@name.path` 是槽引用（`@` 前缀即引用记号，无 `@` 即字面量）。状态机展开引用后，按 fn 签名对它做 kind/形状校验。引用不存在的槽会以 `ENGINE_UNDECLARED` 失败。
- **每次调用都返回一张收据**——不存在「异常 vs 正常返回」的分野：

```
success: set  → { ok: true, name, rev }   (delete: { ok: true, name, deleted })
         get  → { ok: true, name, value }
         call → { ok: true, target, rev }  (void fn: { ok: true, target: null })
failure:      → { ok: false, code, error }
```

  先看 `ok`。收据不携带业务数据（`get` 除外）；读值只能经由 `get`。
- **target 与 fn 签名匹配**（由状态机按注册表判别，模型无需记忆规则）：void fn（声明为 `returns: null`）接受 `target: null`（具名 target → `ENGINE_VOID_TARGET`）；有返回值的 fn 必须给具名 target（缺失/null → `ENGINE_TARGET_REQUIRED`）。
- **target 恒覆盖**：写入已存在的槽会用新值整体替换（kind 校验通过后）并推进 `rev`；不继承旧表示的任何部分。
- **删除 = 以 `value: null` 执行 `set`**：槽从变量表消失；删除不存在的槽是幂等的 ok；之后重建会从 rev 1 重新开始；轨迹行带 `deleted: true`。
- 槽的 kind 在首次写入时钉死：以不同 kind 覆盖会失败（`ENGINE_KIND_MISMATCH`），且不推进版本号。
- 失败的操作**没有副作用**：不建槽、变量表不变、版本号不动。失败仍会落入轨迹。

## 4. 记录与标记

```
record_question { text }    open a record (clears the table); a re-open seals the previous record as duplicate-start
record_analyse  { text }    the analysis: knowns and the approach with formulas — no computed numbers
record_answer   { text }    the final answer; seals the record
```

- 至多一条未封口记录。第二次 `record_question` 会把当前未封口记录封口（duplicate-start）并开启新记录——两条 open 行永不可能并存。
- 没有未封口记录时的 `record_answer` 会保留一条 duplicate-end 错误记录。
- 中断的记录（索引中 `sealedAt: null` 且有本体文件）会在下次状态机启动时续写：轨迹在同一文件中继续，变量表据其重建。incomplete（未完成）的记录永远不会自行变完整——它要么日后被封口（duplicate-start），要么永远停在 incomplete。

## 5. 函数目录

所有函数遵守同一个值契约：quantity 参数是类型化值（见 §2）；传递函数的数组系数是按降幂排列的 kind-`none` 量。目录与数学内核一一对应。

### 表达式与代数

| fn | 用途 |
|---|---|
| `calculate` | 求值字符串数学表达式，返回复数结果 |
| `rational_coefficients` | 把单变量表达式化简为有理函数，返回分子/分母系数 |

### 数列求和

| fn | 用途 |
|---|---|
| `series_sum` | 数列求和：等差、等比（有限项或收敛的无穷级数）或幂和 |

### 传递函数与频域

| fn | 用途 |
|---|---|
| `partial_fraction` | 比值形式传递函数的部分分式展开 |
| `poles_zeros` | 比值形式传递函数的零极点 |
| `transfer_function_response` | 在频率点上求值传递函数（H(jω) 或 H(e^(jωT))） |
| `step_response` | 连续传递函数在时间点上的阶跃响应 |
| `difference_equation_response` | 差分方程递推输出 y[n]（Laurent a/b 约定） |
| `bode_response` | 在对数频率网格上绘制比值形式传递函数的 Bode 图 |
| `power_series_expansion` | z 域传递函数关于 z⁻¹ 的幂级数展开（冲激响应） |

### 数字信号处理

| fn | 用途 |
|---|---|
| `discrete_fourier_transform` | 复采样序列的 DFT（可选加窗） |
| `inverse_discrete_fourier_transform` | 频谱的 IDFT：恢复时域序列（DFT 的往返） |
| `fourier_series_coefficients` | 标准奇对称波形的傅里叶级数系数（a₀、aₙ、bₙ） |
| `signal_analysis` | 一次调用给出信号统计与加窗频谱（RMS、峰值、峰峰值、DC） |

### 信号质量

| fn | 用途 |
|---|---|
| `thd` | 采样信号的总谐波失真（分数与 dB） |
| `jitter_snr` | 采样时钟抖动设定的 SNR 上限 |
| `adc_budget` | ADC 噪声预算：量化、抖动与可选的热噪声 SNR 汇总为总 SNR 与 ENOB |

### 电路

| fn | 用途 |
|---|---|
| `equivalent_impedance` | 一组阻抗串联（Z = Σ Zi）或并联（1/Z = Σ 1/Zi）后的总阻抗 |
| `circuit_impedance` | 某频率下（可嵌套）串/并联网络的驱动点总阻抗；network 是元件叶子（kind resistance\|inductance\|capacitance）与串/并联组的树的 JSON 文本 |
| `resonance` | 串联/并联 LC 谐振：resonantFrequency、qualityFactor 与 bandwidth |
| `ac_power` | 由 RMS 值求交流功率：视在 = V·I、有功 = 视在·cosφ、无功 = 视在·sinφ、功率因数 = cosφ |
| `transient_response` | 一阶/二阶充放电瞬态在时间点列表上的取值；每个时间点返回电压与电流 |

### 电子学

| fn | 用途 |
|---|---|
| `opamp_configurations` | 各配置的理想运放增益与输出：反相、同相、电压跟随器、差分、积分器、微分器 |
| `time_constant` | 时间常数与截止频率：τ = RC（给电容）或 τ = L/R（给电感） |
| `voltage_divider` | 电阻分压器，带载或不带载，外加戴维南输出电阻 |
| `led_resistor` | LED 串联电阻：R = (Vs − Vf)/I 及其耗散功率 P = I²·R |

### 射频与史密斯圆图

| fn | 用途 |
|---|---|
| `impedance_to_reflection` | 反射系数 Γ = (Z − Z0)/(Z + Z0) |
| `reflection_to_vswr` | 由反射系数求 VSWR：vswr = (1+|Γ|)/(1−|Γ|) |
| `return_loss` | 以 dB 计的回波损耗：−20·log10(|Γ|) |
| `quarter_wave_transformer` | 四分之一波长变换器的特性阻抗：Z1 = √(Z0·ZL) |
| `matched_network` | 两个实数电阻之间的匹配网络（拓扑 l/pi/t）；以有序元件返回低通/高通共轭解 |

### 传输线

| fn | 用途 |
|---|---|
| `wavelength_frequency` | 由频率求波长（感知速度因子） |
| `coaxial_parameters` | 由几何尺寸求同轴线特性（阻抗、速度因子、每米 C 与 L） |
| `rise_time_bandwidth` | 上升时间与带宽互转（tr ≈ 0.35/BW） |

### 噪声

| fn | 用途 |
|---|---|
| `thermal_noise` | 带宽内的热（约翰逊）噪声功率：P = k·T·B（温度以开尔文计） |
| `cascade_noise_figure` | 由每级噪声系数与增益（dB）求级联总噪声系数（Friis） |
| `quantization_noise` | 均匀量化器的理想 SNR（dB）：SNR = 6.02·N + 1.76 |

### 滤波器

| fn | 用途 |
|---|---|
| `filter_design` | 巴特沃斯低通梯形设计：阶数、截止频率与相等的源/负载电阻给出元件表（串联电感、并联电容），并给出截止频率与查询频率处的衰减 |

### fn 表面说明

fn 表面正是在「每 fn 单一返回形状」纪律下迁移后的内核。值得注意的推论：

- `reflection_to_vswr` / `return_loss`：|Γ| = 1 / |Γ| = 0 两个极端无界——值宇宙中没有无穷，因此这类调用会抛错。
- `circuit_impedance.network` 是 JSON 文本字符串（封闭的 spec 无法表达递归的异构树）。
- `resonance.resistance` 为必填，结果恒携带 qualityFactor 与 bandwidth。
- `filter_design.queryFrequency` 为必填（只想要设计结果时传截止频率即可）；元件幅度是 kind-`none` 值，其单位由元件 kind 字符串携带。
- `opamp_configurations` 覆盖六种单输入配置（求和放大器没有单一增益）。
- `transient_response` 在 rc/rl/rlc 上返回同一种固定点形状（{time, voltage, current}）；不返回 rlc 阻尼特征。
- `voltage_divider` 返回固定四字段对象；不带载时 `unloadedOutputVoltage` 等于 `outputVoltage`，`loadCurrent` 为 0。
- `series_sum` 在所有分支上返回同一种固定形状（kind/power/sum/lastTerm/converges）；发散的无穷级数输入会报错。
- 带单位的回显字段沿用旧声明并使用 kind `none`（开尔文温度、波长、同轴直径、频率回显列表）——这些量的类型化值是 SI 基准数字。

## 6. 存储

记录主目录是 `~/.dsh-electro-lab`（可用 `DSH_ELECTRO_LAB_HOME` 环境变量覆盖）：

```
~/.dsh-electro-lab/
  record-index.jsonl     ← index (outside records/)
  records/
    <id>.jsonl           ← the trace body (id is a UUID v4)
```

### record-index.jsonl（仅作索引）

```json
{ "id": "…", "openedAt": 1730000000000, "sealedAt": null, "question": "given R = 100ohm…" }
```

字段：id、openedAt、sealedAt（null = 未封口）、question（不可变的标题）。不存错误、统计或内容；行序即追加序。截断是 UI 的职责。

### 轨迹本体（按步全量）

每次状态机操作或标记一行；每一行都携带恢复该步所需的全部信息——输入与输出都在：

```json
{ "seq": 1, "tool": "marker", "kind": "question", "ok": true, "text": "…", "at": … }
{ "seq": 2, "tool": "set", "ok": true, "name": "R", "value": { …typed value as given… }, "rev": 1, "at": … }
{ "seq": 3, "tool": "call", "ok": true, "fn": "resonance",
  "args": { …original… }, "resolved": { …expanded + SI/rect end values… },
  "result": { …typed output… }, "target": "res", "rev": 1, "at": … }
{ "seq": 4, "tool": "call", "ok": false, "code": "ENGINE_UNDECLARED", "error": "…", "at": … }
{ "seq": 5, "tool": "set", "ok": true, "name": "tmp", "value": null, "deleted": true, "at": … }
{ "seq": 6, "tool": "marker", "kind": "answer", "ok": true, "text": "…", "at": … }
```

- `call` 行存储结果：任何调用的输出都作为事实进入该行——恢复状态时直接用存储的结果，**从不重新计算**（外部 fn 的输出源自网络/文件，无法重算）。
- `resolved` 是实际进入 run 的参数集：引用已展开，换算全部完成（SI、直角坐标）。`args` 保留原文；两者逐键对照。
- 内核内部的中间步骤与模型的推理文本都不会被记录；粒度就是一次状态机操作。轨迹的读者是人——每一步都就地呈现原始输入、换算值与结果，并可用任意方式独立复核。

### 恢复 = 重放

重建状态按序重放各行：`set` 行把槽置为存储的值，`call` 行把 target 槽置为存储的结果（非 void），set-null 行删除，marker 行跳过。纯状态机——不重算、不发网络、无随机。

### 一致性

- 孤儿索引行（sealedAt 为 null 但没有本体文件）在状态机启动时清除——索引只是投影，可安全重建。
- 新系统不读取旧格式的 `records.jsonl`；旧文件保持原样不动。

## 7. 宿主端点

- `GET /api/dsh-electro-lab/records-index`——供记录面板列表使用的索引行（`{ rows: [{ id, openedAt, sealedAt, question }] }`）。列表每 5 秒轮询一次；从不读取轨迹本体。
- `GET /api/dsh-electro-lab/external-fns`——声明档案与脏位（`{ fns: […], restartRequired }`）。
- `PUT /api/dsh-electro-lab/external-fns?config=<base64url JSON>`——校验并写入（upsert）一条声明（置脏位）。
- `DELETE /api/dsh-electro-lab/external-fns?name=<name>`——删除一条声明。

## 8. 外部函数

外部函数是驻留在远端端点、归用户所有的计算函数；状态机通过 **http** 或 **file** 传输访问它们。声明存放于记录主目录下的 `external-fns.jsonl`；状态机启动时，每条启用的声明都会**原样**注册进 fn 注册表、成为一个外部 fn（没有编译层——传输由状态机自己包装）。更改在宿主重启后生效；脏位置位期间，界面会显示待重启提示。

### 声明

```json
{
  "name": "echo_http",
  "description": "Echo peer over http: returns every parameter it receives, verbatim",
  "enabled": true,
  "parameters": {
    "message": { "type": "string", "description": "a text echoed back verbatim", "required": true },
    "values":  { "type": "array", "items": { "type": "quantity", "kind": "none" }, "description": "values echoed back verbatim" },
    "flag":    { "type": "boolean", "description": "a boolean echoed back verbatim" }
  },
  "returns": {
    "type": "object",
    "fields": {
      "message": { "type": "string" },
      "values":  { "type": "array", "items": { "type": "quantity", "kind": "none" } },
      "flag":    { "type": "boolean" }
    }
  },
  "transport": "http",
  "transportOptions": { "url": "http://127.0.0.1:8787/echo" },
  "timeoutMs": 10000
}
```

- 参数规格：`{ "type": "quantity", "kind": <lowercase kind name> }`（quantity 接受裸数字、`{re, im}` 或 `{mag, ang}` 载荷）、`{ "type": "string", "enum"?: [...] }`、`{ "type": "boolean" }`、`{ "type": "array", "items": <spec> }`（同质，items 可嵌套）。
- `returns` 对注册而言**必填**：使用同样的 spec 叶子（或显式 `null` = void）。没有 returns、或带不可映射的 `"any"` 叶子的声明会被保留在档案中，但在启动时被跳过并给出警告。
- http 的 `transportOptions`：`url`、可选 `headers`。档案方言为兼容仍接受 `method` 字段，但宿主恒发 **POST**——类型化参数以 JSON 请求体形式传输。
- file 的 `transportOptions`：`directory`（宿主在其中写入 `in.<id>.json` 并轮询 `out.<id>.json`）、可选 `inPrefix` / `outPrefix` / `pollMs`。
- 命名规则：小写开头、`a-z0-9_`、最长 64，在外部 fn 与内置 fn 中唯一。

### 线协议（类型化信封）

```
request:  { "requestId": "<uuid>", "args": { "<parameter>": <typed value> } }
success:  { "requestId": "<uuid>", "result": <typed value> }    // non-void
success:  { "requestId": "<uuid>", "result": null }             // void: still a result message, just valueless
failure:  { "requestId": "<uuid>", "error": "<string message>" }
```

- 类型化值在线路上是自描述的：`type` 判别形状，`value` 承载内容，complex 恒为 rect，`kind` 携带量纲。variant/prefix 从不出现——状态机已换算到 SI 基准。第三方实现只需实现五个 type 分支。
- **`result` 字段恒在**（void = null）——它为将来的消息种类预留位置，`result` 与任何同级消息永不混淆。
- 宿主按 fn 签名校验响应：非 void fn 收到 `result: null`（或没有 result）是协议错误；void fn 收到 result 同样是协议错误。
- `requestId` 回显会被校验；超时与协议违规由宿主抛出。失败与本地 fn 共享同一条结构化错误路径——无论来源如何，调用都以同一种错误收据呈现，并连同其 code 记入轨迹。

| code | 含义 |
|---|---|
| `EXTERNAL_ERROR` | 端点自身报告失败（信封的 `error` 字段） |
| `EXTERNAL_HTTP` | http 传输失败（非 2xx 状态） |
| `EXTERNAL_TIMEOUT` | 外部调用超时 |
| `EXTERNAL_RESPONSE` | 响应信封中的协议违规 |

### 管理工具

| 工具 | 用途 |
|---|---|
| `external_fns_add` | 注册一条新的外部函数声明（名称已存在时报错） |
| `external_fns_update` | 替换一条已有声明（不存在时报错） |
| `external_fns_delete` | 按名称删除一条声明 |

写入会立即持久化并置脏位；结果报告 `restartRequired: true`。记录面板的**「外部函数」页**以表单编辑方式提供同样的操作。[`external-tool-example/`](../external-tool-example/README.zh-CN.md) 是独立的 npm 工程，内含该信封协议的手动测试对端——`node src/echo.ts http` / `file` 可将其端到端回显。
