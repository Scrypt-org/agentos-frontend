# SDK 已有 Passkey 钱包恢复设计

日期：2026-07-19
目标项目：`inj-pass-frontend`
目标分支：`main`

## 背景

INJ Pass 主程序已经支持使用可发现 Passkey 恢复钱包。恢复流程通过后端验证 credential 与钱包地址的关联，并依次尝试 PRF 派生和老 `legacy-sha256` 派生；地址匹配后会重建本地 keystore。

SDK `/auth` 授权页目前只列出本地钱包索引、当前 active wallet，以及能够从 IndexedDB 重建的助记词钱包。若老 Passkey 钱包仍保存在后端，但本地钱包索引已经丢失，主程序可以恢复，SDK 授权页却没有恢复入口，因此用户只能看到仍留在本地索引中的 PRF 钱包。

## 目标

- 在 `/auth` 钱包选择页提供“使用已有 Passkey 钱包”按钮。
- 由用户主动触发系统 Passkey 选择器，页面加载时不得自动弹出。
- 复用主程序现有 `recoverWallet()`，同时支持 PRF 和 `legacy-sha256` 钱包。
- 恢复成功后继续当前 dApp 连接请求，不打开新页面，也不要求用户重新连接。
- 保持私钥、credential、请求来源和连接 session 的现有安全边界。

## 非目标

- 不允许匿名枚举后端账户的全部钱包。
- 不改变 Passkey 注册、后端 credential 数据结构或钱包派生算法。
- 不把老钱包自动迁移成 PRF 钱包。
- 不修改 Connector 的公开连接协议。
- 不处理 Gas 代付或 INJ Gift 零余额领取问题。

## 交互设计

钱包选择页继续显示本地可用钱包。在列表下方、创建或恢复钱包链接上方增加“使用已有 Passkey 钱包”按钮。

用户点击后：

1. 页面进入 `recovering_wallet` 状态并禁用重复操作。
2. 系统显示可发现 Passkey 选择器。
3. INJ Pass 后端验证 assertion，并返回关联钱包地址。
4. `recoverWallet()` 自动判断 PRF 或老 `legacy-sha256` 派生方式，验证派生地址。
5. 验证成功的 keystore 写回标准本地钱包存储。
6. 授权页刷新钱包列表，自动选中恢复的钱包。
7. 授权页继续当前 `WALLET_CONNECT` 请求并返回连接结果。

按钮只在存在有效的待处理连接请求时可用。恢复期间保留当前 `requestId`、目标 origin 和 opener，不创建第二个连接 attempt。

## 组件与职责

### Passkey 恢复服务

继续使用 `recoverWallet()` 作为唯一恢复实现：

- 发起 discoverable WebAuthn assertion。
- 调用后端验证 credential。
- 使用后端返回的 `walletAddress` 校验本地派生结果。
- 优先尝试 PRF；不匹配时尝试兼容的 legacy credential ID 表示。
- 使用现有 `saveWallet()` 写回 keystore。

授权页不得复制派生、地址校验或保存逻辑。

### Auth 状态机

在现有状态中增加 `recovering_wallet`。恢复动作只负责发现和重建钱包；成功后仍调用现有连接完成函数，使 PRF、老 Passkey 与本地列表钱包共享同一响应逻辑。

恢复得到的私钥只用于证明恢复结果与地址匹配。授权页在进入标准连接流程前必须清零该临时字节数组。随后 `finishWalletConnect()` 使用标准 `unlockWalletKey()` 再次执行用户验证，确保建立 dApp session 时存在明确授权。

### 钱包标签

- `prf-v1`：`Passkey PRF`
- `legacy-sha256` 或缺失 `keyScheme` 且具有 credential：`Legacy Passkey`
- `local-mnemonic-v1`：`Traditional`
- 缺失必要 credential 的旧条目：`Migration required`

老 Passkey 允许连接，但 UI 明确标识其兼容性质，不在授权过程中自动升级。

## 错误与取消

恢复失败不得结束原连接请求，授权页返回钱包选择状态并允许重试或取消。

错误至少区分：

- 用户取消系统 Passkey 选择：显示取消提示，不显示系统故障。
- 后端没有关联钱包：提示该 Passkey 未关联 INJ Pass 钱包。
- 派生地址不匹配：阻止连接，提示需要在 INJ Pass 主程序中处理恢复。
- 后端超时或网络错误：保留当前连接请求并允许重试。
- Passkey 不可用：提示在保存该 Passkey 的设备或密码管理器中重试。

授权窗口被关闭时，继续沿用现有 `USER_CANCELLED` 终态和 popup closed 检测。

## 安全边界

- dApp 只能收到用户批准的钱包地址、钱包名称和后续交易结果。
- 后端返回的钱包地址必须与本地派生地址匹配后才能保存和连接。
- 临时恢复私钥不得写入日志、React state、消息协议或持久存储明文。
- `postMessage` 继续校验 source、origin 和 request ID。
- 恢复按钮不能绕过当前 origin allowlist。
- 同一个连接请求只能完成一次。

## 测试

### 单元测试

- 恢复 PRF 钱包后写入列表并继续连接。
- 恢复老 Passkey 后显示 `Legacy Passkey` 并允许连接。
- 临时恢复私钥在交接前被清零。
- 用户取消后回到钱包选择状态，pending request 保持有效。
- 地址不匹配时不保存、不连接。
- 重复点击只触发一次恢复 ceremony。

### 集成测试

- 构造“后端有关联老 Passkey、本地无钱包索引”的状态，从 INJ Gift 发起连接并在同一授权窗口完成恢复和连接。
- 恢复后发起一次签名和一次交易请求，确认继续使用所选老 Passkey 钱包。
- 取消恢复后可以选择现有 PRF 钱包或再次恢复。
- 关闭授权窗口后 INJ Gift 不持续 loading。

## 验收标准

- SDK 钱包选择页显示“使用已有 Passkey 钱包”按钮。
- 页面加载不会自动触发 WebAuthn。
- 本地索引缺失的 PRF 和老 Passkey 钱包均可通过按钮恢复。
- 恢复成功后自动完成当前连接，不需要跳转或重新点击连接。
- 老 Passkey 后续签名与交易仍要求 Passkey 用户验证。
- 现有 PRF、本地助记词、取消和重试链路不回归。
