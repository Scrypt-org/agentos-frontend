# INJ Pass SDK、Embed 与钱包恢复整改设计

日期：2026-07-19  
目标分支：`inj-pass-frontend/dev`，以及消费端 `inj-gift/main`  
状态：待用户最终确认

## 背景与根因

INJ Gift 通过 Connector SDK 加载 INJ Pass `/embed`，再由 Embed 打开 `/auth` 完成钱包选择、解锁和后续签名。目前存在三个相互关联但根因不同的问题：

1. 授权页只显示部分 PRF 钱包。授权页读取的是 `injpass.com` 本地钱包索引；助记词钱包虽然受 `local-mnemonic-v1` 支持，但缺失索引时不会出现在列表。
2. 多钱包存储迁移存在顺序缺陷。`saveWallet()` 先覆盖旧 active wallet，再读取多钱包列表，导致旧版单钱包槽中的助记词钱包可能未被迁入列表。
3. 用户关闭授权窗口后连接一直转圈。Connector 侧只在最初约 5 秒检查弹窗是否关闭，轮询停止后关闭窗口不会发送结果，Embed 和消费端只能等待超时。

助记词钱包创建时还会把加密 vault 写入 `inj-pass` IndexedDB 的 `mnemonic-vaults` store。因此列表索引丢失不等于助记词丢失；只要 IndexedDB 仍在，就能重建钱包元数据。若 IndexedDB 已被浏览器清理，则只能通过用户备份的 24 个助记词重新导入。

## 目标

- PRF、兼容的旧 Passkey、助记词钱包在同一授权流程中可发现、可选择、可解锁。
- 自动找回仍存在于 IndexedDB、但已经从钱包列表消失的助记词钱包。
- 任意连接终态都能贯穿 `/auth → /embed → Connector → INJ Gift`，不再出现悬挂 Promise 或无限 loading。
- 失败、取消或超时后可以立即重试，不需要刷新页面。
- Embed 的新增连接终态和错误提示复用现有语言机制，与宿主保持一致。
- 不上传助记词、私钥、钱包密码或已解密密钥。

## 非目标

- 不实现助记词或私钥的云端同步。
- 不尝试恢复已被浏览器完全删除且用户没有备份的助记词。
- 不改变现有链上账户、合约或主网配置。
- 不把旧 Passkey 静默升级为 PRF；需要迁移时必须向用户说明并获得确认。

## 方案选择

### 方案 A：本地索引修复、Vault 自动恢复、协议状态机闭环（采用）

在保持本地自托管边界的前提下修复钱包存储，枚举 IndexedDB vault 并重建缺失索引，同时为授权协议增加明确终态和持续窗口监测。改动覆盖问题源头，安全边界不变。

### 方案 B：只增加“导入助记词”按钮和连接超时

改动较小，但要求所有受影响用户重新输入助记词，无法利用仍存在的加密 vault；延长或缩短超时也没有修复取消信号缺失，不采用。

### 方案 C：将加密钱包 vault 同步到服务端

可跨设备恢复，但会引入密钥材料托管、账户恢复、版本管理和安全审计的新体系，超出本次范围，不采用。

## 架构设计

### 1. 钱包存储与恢复

新增只负责本地钱包一致性的 reconciliation 层：

- `listVaults()` 以只读事务枚举 `mnemonic-vaults` 中全部加密 vault。
- `reconcileWalletStorage()` 合并三类来源：旧 active wallet、多钱包索引、IndexedDB 助记词 vault。
- 合并键统一使用小写地址，已有完整元数据优先；只存在 vault 时，重建 `local-mnemonic-v1` keystore，并保留序列化加密 vault 作为 IndexedDB 不可用时的回退。
- 自动恢复的钱包使用明确的默认名称，例如 `Recovered INJ Pass`，用户之后可以改名。
- reconciliation 不请求密码、不解密 vault、不接触助记词明文。

同时修正 `saveWallet()`：先读取旧 active wallet 和现有列表，完成合并后再写 active wallet 与钱包列表。这样旧单钱包数据不会再被新钱包覆盖。

恢复过程失败时不得阻止已有钱包使用；记录可诊断错误，并在 UI 提供手动导入入口。

### 2. Auth 钱包选择与兼容性

收到 `WALLET_CONNECT` 后，Auth 先等待 reconciliation 完成，再生成钱包列表：

- PRF 钱包：选择后执行现有 PRF 解锁/验证流程。
- 旧 Passkey：本地元数据完整且存在 credential ID 时允许连接；无法使用时仍显示，但附带具体原因和迁移入口，不再直接隐藏。
- 助记词钱包：选择后进入密码输入状态，调用现有 `unlockLocalMnemonicWallet()`；私钥只保留在授权窗口的内存 session 中。
- 列表为空或目标钱包未恢复时，提供“导入 24 个助记词”和“创建其他钱包”入口。

错误信息区分：密码错误、Passkey 不可用、旧钱包需要迁移、本地 vault 已不存在，以及用户取消。不得把这些情况统一显示为 `Failed to connect wallet`。

### 3. 授权协议状态机

连接请求使用单一请求 ID，并采用以下状态：

`idle → opening → awaiting_wallet → unlocking → connected`

所有非成功路径进入明确终态：

- `cancelled`：用户点击取消或关闭授权窗口。
- `popup_blocked`：浏览器阻止弹窗。
- `timeout`：授权在限定时间内未完成。
- `failed`：钱包读取、解锁或协议校验失败。

每个请求只能完成一次。统一 cleanup 必须清理 message listener、窗口轮询、发送重试和 timeout，防止旧请求影响后续重连。

Auth 在尚未完成连接时，通过 `pagehide`/`beforeunload` 尽力发送取消响应；Bridge 同时持续轮询 `popup.closed`，直到请求进入终态。窗口检测不能在发送请求次数耗尽后停止。双重机制用于覆盖浏览器不触发或不允许 unload 消息的情况。

协议错误使用稳定错误码，显示文本由各 UI 按语言映射：

- `USER_CANCELLED`
- `POPUP_BLOCKED`
- `CONNECTION_TIMEOUT`
- `WALLET_NOT_FOUND`
- `WALLET_MIGRATION_REQUIRED`
- `WALLET_UNLOCK_FAILED`
- `PROTOCOL_ERROR`

### 4. Embed 页面整体优化

Embed 成为协议状态的可视化控制器，而不是自行推测状态：

- 初始显示 `Choose wallet`。
- 请求发出后显示 `Connecting…`，并禁止重复提交。
- 收到任一终态后立即退出 loading。
- 取消、失败、超时和弹窗拦截显示对应提示，并提供 `Try again`。
- 重试创建全新的 request ID，不复用上一个 Promise、popup 引用或 timer。
- 连接成功后展示选中的钱包名称和缩略地址。
- iframe 重载或卸载时取消当前本地请求并清理监听器。

项目已经具备宿主语言传递和中英文展示能力，本次不重做国际化框架。新增的连接错误码接入现有语言机制：优先使用宿主已传入的 language；未传入时沿用 Embed 当前 locale。错误码保持不变，只有新增显示文本进入现有中英文映射。

### 5. Connector SDK

Connector 维护唯一的连接 attempt：

- 并发 `connect()` 返回同一个进行中的 Promise，避免重复弹窗。
- 成功后保存 session；切换钱包显式启动新 attempt 并替换 session。
- 取消或失败后清空 pending attempt，但不伪造 disconnected 以外的成功状态。
- 接收 Embed 的结构化成功或错误消息，校验 `origin`、`source` 和 request ID。
- `disconnect()` 和销毁 Connector 时清理 iframe、监听器、timer 及待处理 Promise。
- 对外暴露稳定错误对象 `{ code, message, cause? }`，消费端不再依赖英文字符串判断。

已有签名 session 继续复用于创建、领取和其他授权操作；钱包切换后，旧授权窗口和旧 session 必须失效。

### 6. INJ Gift 接入

INJ Gift 已经完成 Connector 基础接入、主网配置和现有中英文提示。本次不重写接入层，只对新的结构化连接终态做最小兼容调整：

- `connecting` 仅在当前 attempt 未结束时为真。
- `USER_CANCELLED` 不显示为系统故障，恢复连接按钮并允许用户重试。
- 新增错误码复用当前页面已有语言状态，显示可行动提示。
- 页面卸载、路由变化或手动断开时取消当前 attempt。
- 创建红包与领取红包都从同一个已连接 session 获取账户和签名能力，不再隐式发起第二次连接。

## 数据与安全边界

- IndexedDB 枚举只读取加密 vault 元数据和密文。
- 密码只用于当前浏览器内的 PBKDF2/AES-GCM 解密，不写入 localStorage、日志或消息协议。
- 私钥只存在于 Auth 授权窗口内存，响应仅包含地址、签名和批准结果。
- Auth/Embed/Connector 的 postMessage 必须同时校验来源 origin、窗口 source 和 request ID。
- 自动恢复不得删除任何现有 wallet entry 或 vault；冲突时保留信息更完整、更新时间更新的记录。

## 测试设计

### 单元测试

- 保存新钱包前正确迁移旧 active wallet。
- 多钱包列表按地址去重且不覆盖更完整元数据。
- IndexedDB vault 能重建缺失的 `local-mnemonic-v1` keystore。
- reconciliation 失败不会破坏已有钱包列表。
- Auth 对 PRF、旧 Passkey、助记词和不可迁移钱包生成正确状态。
- Connector 对每个错误码只 settle 一次并完整 cleanup。
- locale 到错误文案的中英文映射。

### 集成测试

- 选择助记词钱包、输入密码、连接并签名。
- 用户点击 Cancel 后 Embed 与 INJ Gift 立即恢复可重试状态。
- 用户直接关闭授权窗口后立即结束 loading，并可再次连接。
- 弹窗被拦截和连接超时均得到明确错误。
- 快速重复点击只打开一个授权 attempt。
- 成功连接后切换钱包，旧 session 不再可用。

### 手动验证

- 在 `injpass.com` 创建 PRF、旧兼容 Passkey 和助记词测试钱包，确认 Auth 列表与主界面一致。
- 构造“IndexedDB 有 vault、localStorage 列表缺项”的遗留状态，确认自动恢复。
- 在 INJ Gift 创建和领取页面分别验证连接、取消、重试和签名。
- 验证桌面 Chrome 弹窗、INJ Pass MiniDapp iframe，以及中英文界面。

## 发布与回滚

1. 先在 `inj-pass-frontend/dev` 完成存储、Auth、Bridge、Embed 和 SDK 测试。
2. 发布测试环境并使用真实浏览器验证遗留钱包恢复及弹窗关闭。
3. 更新 INJ Gift 的 Connector 消费逻辑并验证主网只读信息和签名前流程。
4. SDK 采用向后兼容的小版本发布；旧消费端仍能读取 `message`，新消费端使用 `code`。
5. 分阶段部署 INJ Pass 与 INJ Gift，并保留上一版本构建以便回滚。

回滚不得删除 reconciliation 已恢复的钱包索引；恢复操作是非破坏性的，旧版本仍可读取生成后的标准 keystore 列表。

## 验收标准

- 同一 `injpass.com` 浏览器中仍存在 IndexedDB vault 的助记词钱包会重新出现在主界面和 Auth 列表。
- 助记词钱包可通过本地密码完成连接和签名。
- 兼容旧 Passkey 可连接；不可兼容钱包可见且有明确迁移说明。
- 关闭授权窗口后 1 秒内 Embed 和 INJ Gift 停止 loading，并可立即重试。
- 所有连接终态都有结构化错误码，且不会遗留 listener、timer 或 pending Promise。
- 新增连接错误复用既有中英文机制，现有 INJ Gift 文案和接入行为不回归。
- 现有 PRF 连接、创建红包和领取红包链路不回归。
