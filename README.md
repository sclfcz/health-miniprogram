# 康养日记 · 健康日记小程序

面向**老人与家属**的慢病 / 用药管理微信小程序，基于**微信小程序 + 微信云开发（CloudBase）**实现。

患者在端上管理用药计划与健康数据，到点由订阅消息提醒服药；**连续漏服 3 次后自动向已绑定家属推送预警**。
家属可以绑定患者、查看患者的用药与健康数据。

> 仓库中的 `AppID`、云环境 ID、订阅消息模板 ID 均为**占位符**，运行前必须替换成你自己的值，
> 详见 [快速开始](#快速开始)。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 登录 / 注册 | `pages/login`，按角色注册为 `patient`（患者）或 `family`（家属） |
| 用药管理 | 用药计划支持每天 / 按周 / 按月（`cycle_type` + `cycle_detail`），多时段（`timeSlots`），支持服药打卡与补服 |
| 到点提醒 | 云函数 `medicationReminder`，每 5 分钟扫描当天到点未打卡的计划，下发订阅消息 |
| 漏服记录 | 超过计划时间 **30 分钟**仍未打卡，自动生成 `missed` 记录（云函数 `checkMedicationMissed`） |
| 家属预警 | 最近**连续 3 次**漏服时通知全部有效绑定家属，并写 `warning_logs` 防重复 |
| 家属绑定 | 家属申请 → 患者同意 → 写 `family_relations`，全流程状态机校验（云函数 `handleBindingRequest`） |
| 健康数据 | 血压 / 血糖 / 体重录入与历史（`health_metrics`），7 天 / 30 天趋势分析 |
| 月报 | 用药依从率、漏服/补服统计与建议（`pages/report`） |
| 健康百科 | 科普文章列表 / 详情 / 编辑（`medical_knowledge`），可用 `initKnowledge` 初始化 |
| 药品库检索 | 云函数 `searchMedicine`，可用 `initMedicineLibrary` 初始化药品库 |

## 核心机制

### 1. 患者到点提醒（`cloudfunctions/medicationReminder`）

- 定时触发器每 **5 分钟**（`config.json` → `0 */5 * * * * *`）。
- 只处理"当前时间落在计划时间 `[t, t + REMINDER_WINDOW_MINUTES]` 内、且当天该时段尚无任何记录"的计划。
- 发送前查 `reminder_logs` 的 `logKey`（`日期_计划ID_时段序号`）：**只有 `status: 'success'` 的日志才算已提醒**，
  失败（如用户未授权返回 `43101`）仍会在窗口内重试第二次。

### 2. 连续漏服 → 家属预警（`cloudfunctions/checkMedicationMissed`）

- 定时触发器每 **10 分钟**（`config.json` → `0 */10 * * * * *`）。
- 超过计划时间 `MISSED_GRACE_MINUTES`（30 分钟）→ 补写 `med_records` 中 `status: 'missed'` 的记录。
- 按 `date + scheduled_time` **倒序**回看该患者最近的记录，遇到 `taken` / `supplement` 即停止计数；
  连续 `missed` 数达到 `MISSED_THRESHOLD`（3）→ 通知所有 `family_relations.status == 1` 的家属。
- 幂等键 `warningKey = 患者_滚动窗口最旧一条记录ID`，写进 `warning_logs`；已成功通知过则不再重复发送。

### 3. 为什么 `checkMedication` 不再挂定时器

`checkMedication` 是同一套漏服逻辑的早期合并实现，它与 `checkMedicationMissed` 原本在**同一时刻**（`0 */10`）各跑一遍，
会造成**重复写记录、重复推送**，且它自身没有 `warning_logs` 幂等。
现在功能完全由上面两个定时函数承担；`checkMedication` 保留代码以便手动调用排查，但**不要重新给它加触发器**。

## 目录结构

```text
miniprogram/                     小程序前端
  app.js                         云开发初始化（env 在这里配置）
  config/message.js              订阅消息模板 ID + 漏服宽限常量
  pages/                         21 个页面（用药、健康、家属、百科、月报…）
  utils/medication.js            用药计划 / 打卡记录的前端公共逻辑（含分页与北京时间工具）
  components/ custom-tab-bar/    自定义组件与 tabBar
cloudfunctions/                  云函数（每个目录是独立部署单元）
  medicationReminder/            患者到点提醒（含定时触发器）
  checkMedicationMissed/         漏服记录 + 家属预警（含定时触发器）
  checkMedication/               旧版合并实现（已摘除定时器，仅供手动排查）
  register / getOpenId           注册与身份
  sendBindingRequest / handleBindingRequest / getBindingRequests   家属绑定链路
  searchMedicine / initMedicineLibrary                             药品库
  initKnowledge / createReminderTestData                           初始化与测试数据
  quickstartFunctions            云开发官方模板遗留
同学运行测试配置说明.md           部署 + 冒烟测试手册（含两条提醒链路的手动验证步骤与故障排查）
```

## 数据模型

需要在云开发控制台创建以下集合：

```text
patient  family  binding_requests  family_relations
medication_plans  med_records  reminder_logs  warning_logs
medicine_library  medical_knowledge  health_metrics
```

| 集合 | 作用 | 关键字段 |
| --- | --- | --- |
| `medication_plans` | 用药计划 | `patientOpenid`、`med_name`、`timeSlots[]`、`cycle_type`、`cycle_detail[]`、`status` |
| `med_records` | 服药 / 补服 / 漏服记录 | `patientOpenid`、`plan_id`、`date`、`time_slot`、`scheduled_time`、`status`（`taken`/`supplement`/`missed`） |
| `reminder_logs` | 到点提醒日志（防重复） | `logKey`、`status`（`success`/`failed`） |
| `warning_logs` | 家属预警日志（防重复） | `warningKey`、`status`、`sendResults[]` |
| `family_relations` | 已通过审核的家属-患者关系 | `familyOpenid`、`patientOpenid`、`status` |
| `health_metrics` | 血压 / 血糖 / 体重 | `patientOpenid`、`measure_time`、`systolic`、`diastolic`、`sugar`、`weight` |

**建议索引**（数据量上去后明显更快，见说明文档 §9）：

```text
med_records(patientOpenid, date, scheduled_time)   medication_plans(status, patientOpenid)
reminder_logs(logKey, status)                      warning_logs(warningKey, status)
health_metrics(patientOpenid, create_time)         family_relations(familyOpenid, patientOpenid, status)
```

## 快速开始

### 1. 替换占位符

| 占位符 | 位置 |
| --- | --- |
| `wx0000000000000000` | `project.config.json` → `appid` |
| `your-cloud-env-id` | `miniprogram/app.js` → `globalData.env` |
| `YOUR_TEMPLATE_ID` | `miniprogram/config/message.js`（4 个字段）、`cloudfunctions/medicationReminder/messageConfig.js`、`cloudfunctions/checkMedicationMissed/messageConfig.js`、`cloudfunctions/checkMedication/messageConfig.js` |
| `YOUR_ADMIN_OPENID` | `miniprogram/config/admin.js`（知识百科“编辑”入口的白名单；保留占位符则不展示编辑入口） |

订阅消息模板需包含字段 `thing1`（药品）、`time2`（时间）、`phrase3`（状态）、`thing5`（患者姓名），
且 `phrase3` 只能传「待服药」或「未服药」，否则会返回 `47003`。

### 2. 部署

1. 用微信开发者工具打开本目录，确认 `AppID` 与云环境 ID 已替换。
2. 在云开发控制台创建上面的集合（权限先按测试需要放宽，验证完收紧）。
3. 右键 `cloudfunctions` 下各函数 →「上传并部署：云端安装依赖」。
   定时触发器与 `subscribeMessage.send` 权限写在各自的 `config.json` 里。
4. 需要示例数据时手动调用 `initKnowledge` / `initMedicineLibrary` / `createReminderTestData`。

### 3. 验证两条链路

完整的准备步骤、手动触发命令与故障排查见 **[同学运行测试配置说明.md](./同学运行测试配置说明.md)**：

- §5 患者到点收到提醒；
- §6 连续漏服 3 次 → 家属收到预警；
- §9 最近一轮缺陷修复记录（含每项的失败用例与修法）。

## 实现约束（改代码前必读）

以下几条是踩过坑后固化的约定，破坏任意一条都会让"提醒 / 漏服"链路出错：

1. **端上查询必须带 `patientOpenid`**：`utils/medication.js` 的 `generateDailyTasks()` 在缺归属时返回空列表，
   而不是退化成全库查询（全库查询既泄露他人数据，也会让患者看到别人的计划）。家属看患者走页面参数，患者本人取登录态 openid。
2. **"漏服"只有一个宽限常量、一个比较符**：`MISSED_GRACE_MINUTES`（端上在 `miniprogram/config/message.js`，
   云端在 `checkMedicationMissed/messageConfig.js`），判据统一为 `nowMinutes >= scheduled + 宽限`，
   否则会出现"云端已写 missed、端上仍显示待服药"，用户还能补打卡导致同一 `plan+slot` 两条记录。
3. **时间一律按北京时间**：云函数运行在 UTC，显式 `+8`；端上用 `medicationUtils.chinaNow()` 推导"今天/现在"。
   否则设备时区不是 UTC+8 时，端上任务列表与云端提醒会差一天。
4. **批量查询必须分页**：云函数端单次 `get()` 默认最多返回 **100** 条，小程序端 **20** 条，超出部分**静默丢弃**。
   云函数用 `fetchAllPages()`，端上用 `fetchAllForPatient()`；分页的 `skip` 必须配稳定 `orderBy`。
5. **排序比较器必须是全序**：漏服计数依赖记录顺序，若比较器对同一 `plan+slot` 的 `missed` / `taken` 返回 0，
   结论会随数据库返回顺序翻转（家属预警时有时无）。现按 `业务时间 → create_time → _id` 打破平局。
6. **定时器只挂两个**：`medicationReminder`（5 分钟）与 `checkMedicationMissed`（10 分钟）。

## 测试

仓库自带一套**不需要微信开发者工具、无任何第三方依赖**的回归测试：

```bash
node tests/regression.test.js
```

它会对 3 个时区（`Asia/Shanghai` / `UTC` / `America/New_York`）各跑一遍，共 11 项断言：

| 断言 | 钉住的不变式 |
| --- | --- |
| T1 | 同一 `plan+slot` 同时存在 `missed` / `taken` 时，“连续漏服”结论不能随数据库返回顺序变化 |
| T2 | 恰好 `scheduled + 30` 分钟时，端上状态与云端是否写 `missed` 必须一致 |
| T3 | 端上与云端对同一瞬间必须得出同一天 / 同一星期（设备时区无关） |
| T4 | 一次发送失败（如 `43101`）不能永久堵死窗口内的提醒重试 |
| T5 | 患者记录超过平台默认 100 条时，“最近连续漏服”不能被截断 |
| T6 / T6b | 端上查询必须带 `patientOpenid`；缺归属时不得拉到他人数据 |
| T7 | 当天记录超过 100 条时，已服药的计划不能被重复写成 `missed` |
| T8a/b/c | 文档 §6.3/§6.4 的端到端场景：3 个时段均过点 → 3 条 `missed` + 1 条家属预警，且重跑不重复 |

实现方式：`tests/fakedb.js` 仿真了云开发数据库的常用语义，并特意仿真了“**云函数端不传 `limit`
最多返回 100 条**”这一平台行为；云函数与前端 `utils` 被放进 `vm` 沙箱执行（注入假的 `wx-server-sdk`），
因此可以在 Node 里直接调用它们的内部函数。发送路径用测试用模板 ID 驱动，所以**仓库里的占位符无需替换**。

这些断言在修复前是**红的**：撤回“全序比较器”会让 T1/T5/T7 失败，撤回“端上归属过滤”会让 T6 失败，
撤回“提醒幂等”会让 T4 失败，撤回“北京时间推导”会在非 UTC+8 时区让 T3 失败。

## 已知限制与后续可做

- **写入幂等**：`med_records` 目前用自动 `_id`，理论上多设备并发打卡仍可能产生重复行（结论已不受影响，但数据冗余）。
  彻底的做法是用确定性 `_id`（`患者_计划_日期_时段`）写入。
- **越权防护层次**：跨用户读取目前靠“端上归属过滤 + 集合权限规则”，生产环境应改为云函数中转并校验 `family_relations`
  （可参考 `handleBindingRequest` 的写法）。同理，知识百科的“编辑”入口只靠前端比对管理员 openid
  （`miniprogram/config/admin.js`），这**不是权限控制**：小程序包可被反编译，写入权限必须靠数据库安全规则
  （例如 `medical_knowledge` 只允许云函数写）保证。
- **测试**：`tests/` 覆盖了漏服判定、时区、分页、幂等这些纯逻辑；UI 与真实订阅消息下发仍需按
  [同学运行测试配置说明.md](./同学运行测试配置说明.md) 在开发者工具里手动验证。
- **遗留**：`quickstartFunctions`、`components/cloudTipModal` 及 `miniprogram/images` 下部分示意图来自云开发官方 quickstart 模板。

## 许可

未附带开源许可证文件；如需开源请自行选择（例如 MIT）。
