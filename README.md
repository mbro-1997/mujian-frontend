# 幕间前端 · D1 + D2-A/B/C

## 2026-10-29 当前交付入口（C批）

当前两工程dev2，未提交/推送/发布。C批55接口、道具审核/库存/二维码/租期及OpenAPI 2026-10-29.5增量已落地；验收和剩余项以[U-13](../../开发交接/D2-准入与道具可租/U-13-D2-C实施验收摘要.md)、[C-27](../../开发交接/D2-准入与道具可租/C-27-D2-C实施证据与剩余项.md)为准，下方旧阶段数量/未验描述保留历史意义。

正式本机后端使用`target/d2c/mujian-backend-0.1.0.jar --spring.profiles.active=local`，18080；管理端5173默认代理18080。开发库darkmujian已V11，不能重复初始化。当前未在开发库创建C演示商品。隔离18081/18082/5174已关，配置与样本保留`.local/test/`且忽略。小程序恢复集中LAN开发地址，不在业务页注入账号。

本次最终12项后端增量、21项前端、34 WXML、管理端构建通过；55操作279响应经.5契约复校全部通过（原404遗漏已补齐）。真实微信生成与C私有COS访问/过期已实测，真机扫码与完整原生/视觉未签收，不能将构建或测试替身当真机通过。当前停在总工复核。

同仓库原生小程序 `miniprogram` 与 Vue 管理端 `admin-web`，工作分支 dev2，未提交。最新整改及未验项见 [U-05](../../开发交接/D1-最小框架/U-05-D1整改验收摘要.md)，原交付见 [U-03](../../开发交接/D1-最小框架/U-03-D1阶段验收摘要.md)。原有根目录 project.private.config.json 未修改、未纳入版本控制。

## 管理端

Node 24.16.0/npm 11.13.0；精确版本在 package-lock.json。

```sh
cd admin-web
npm ci
npm run build
npm run dev
```

打开 http://127.0.0.1:5173，后端 http://127.0.0.1:18080。Vite 同源代理保留 Host。真实 Cookie/CSRF 登录；凭据不入 localStorage。sessionStorage 仅存非敏感恢复信息；D2审核额外保存原请求键，完整命令只在内存，不存证件和签名URL。AJV 8.17.1 完整检查 JSON Schema 2020-12 响应。菜单 route/component 使用白名单，禁止服务端任意组件导入。

活动由可信键盘/指针/触摸及前台恢复触发，最多每分钟一次；没有无条件定时续期。401 重新登录，403 显示无权，503 显示服务故障；重登恢复原页面和非敏感筛选，不重放命令。已实测登录、菜单、过期、恢复筛选和退出。

## 小程序本机演示

开发者工具导入 miniprogram 目录，用户已在开发者工具创建项目并填入 AppID，保留该用户配置；本轮实际运行基础库 3.15.2。开发版地址由 `miniprogram/config/development.js` 的 local/lan 切换；当前 LAN 地址取该文件的 `lanHost`，手机与电脑连接同一局域网。非 develop 的 baseUrl 为空并拒绝请求。urlCheck=false 只供本机，发布前必须核实 AppID 的正式使用范围、配置 HTTPS 合法域名并开启域名校验；本 D1 没有上传或发布。

测试身份由后端 src/test 下 MiniSessionCli 创建：在后端先执行 `mvn -DskipTests package dependency:build-classpath -Dmdep.outputFile=target/d1/classpath.txt`，再执行 `python3 src/test/run-mini-cli.py .local/runtime.properties .local/mini-new.json`；输出文件须不存在，权限自动设为 600。通过开发者工具本地调试控制台调用 `wx.setStorageSync('mj.session', '<仅从本机秘密文件取得的随机会话>')`，之后重新打开“我的”。不要提交该命令的实际值，不拍摄控制台凭据，不加入应用包。退出会清本地存储并调用真实 /api/auth/logout。

五个 Tab、身份引导与工厂入口已实现；未交付业务明确占位，不编造库存或订单。已在 Nightly 2.02.2606022 / 基础库 3.15.2 实测五 Tab、真实上下文、身份引导返回、退出及受控到期；临时服务端口已关闭。

## 验证与限制

`node --test tests/*.test.cjs` 在仓库根目录执行，当前76项（含既有D1受影响项、D2迟到响应及关闭登录面板边界）；`npm run build` 在admin-web执行，包括vue-tsc。本批回归及类型检查/构建通过，精确包体见D2-A证据/admin-build.log。

小程序的App前台恢复、Page展示和用户操作统一经过session/activity.js与session/page.js共享60秒节流，后台默认不标有效活动。本轮开发工具完成12上下文、工厂入口独立点击；真实前后台切换、修正后的首页最终原生复拍和真机验证未完成，SystemError timeout仍待定位，不能由Node测试替代。

独立卡片预览命令：`node tests/create-component-preview.cjs <输出目录>`，在仓库根目录执行，需先安装admin-web依赖。读取生产WXML/WXSS生成浏览器夹具，展示明确“示例”的正常/加载/空/未接入/长文案状态，不注册入小程序、不调用API、不写库存；不等同原生渲染证据。Vite的MJ_TEST_API_TARGET仅用于独立本机故障代理测试，日常开发不设置。

## D2-A 页面与验收边界（2026-10-28）

原生新增 `components/login-sheet`、`pages/rules`、`pages/realname/{form,status}`、`pages/student/{form,status}`；计划/清单/消息/我的游客入口接公共登录面板，账号页承接身份选择/冲突/绑定及本人摘要。五规则正文由后端真实文档ID加载，确认版本回传；两类材料只在点击提交且同意后上传。只保存原请求ID用于恢复；未知结果不自动换键，重载后无原命令时禁用重试原内容。

管理端 `views/verification/VerificationQueue.vue` 被实名/学生页面共享，显式登记于 `router/registry.ts`。列表/普通详情只收脱敏DTO；敏感查看另授权、审计、120秒清理。通过/驳回二次确认，学生通过必选1～5年，驳回必填备注；不默认选年限。应用错误按reasonCode映射，500/503/断网保留原请求。

受影响D1与新增前端测试统一 `node --test tests/*.test.cjs`；后端契约复制到 `admin-web/src/api/d2a.contract.json`，通过 `../mujian-backend/deploy/sync-d2-codes.py --check` 与正式源一致性检查。构建通过不等于原生、真机或视觉验收。

本轮管理端用正式代码连接独立测试后端，实测学生缺年限拦截/选择2年通过、实名缺备注拦截/驳回，并保存截图和SQL。测试身份全部虚构，未向开发库写入业务夹具；临时5174测试进程已停止。正式5173仍连接18080。

2026-10-28续验：真实凭据已配置且探针验证；COS私有上传/签名已验，手机LAN可达但getPhoneNumber返回no permission，成功登录仍未验。最新证据见 [C-15](../../开发交接/D2-准入与道具可租/C-15-D2-A整改续验记录.md) 和 [U-06](../../开发交接/D2-准入与道具可租/U-06-D2-A整改续验与手机号权限阻断.md)。以下保留前轮范围说明：解锁续验已修复四游客入口布尔绑定与登录面板TabBar遮挡，方案入口开/关/规则返回及五正文逐份阅读已采证；新增6项回归。其他三入口、所有认证页面全状态、同尺寸原型对照及真机尚未完成；窗口控制仍不稳定，D1-ENV-01 SDK timeout仍有记录。不能把Node测试/浏览器截图标作小程序真机通过。详见 [U-04](../../开发交接/D2-准入与道具可租/U-04-D2-A实施验收摘要.md)、[C-12](../../开发交接/D2-准入与道具可租/C-12-D2-A实施证据与剩余项.md)。


### C-14整改当前入口

两域verification-page共用原编号未知结果恢复及必填槽位检查；Web VerificationQueue按领域加载筛选策略。手机号回调由services/phone-authorization.js统一分类，开发版仅显示脱敏errMsg；不保存code/完整回调，也不把缺code全归为取消。93项定向测试和管理构建通过；F02原生同视口视觉未签收。

本机/LAN切换只编辑miniprogram/config/development.js，mode为local或lan；LAN IP变化后修改 `lanHost`，重新编译并预览。手机在「我的」点选测试账号，通过微信静默登录核对开发者身份。[手机开发预览说明](../../开发交接/切换身份脚本.md)trial/release未配置正式HTTPS，继续拒绝请求。不能把局域网开发结果当合法域名验收。


## D2-B 当前交付（2026-10-28）

B已在现有dev2工程实现，结果与限制以 [C-22](../../开发交接/D2-准入与道具可租/C-22-D2-B实施证据与剩余项.md) 和 [U-10](../../开发交接/D2-准入与道具可租/U-10-D2-B实施验收摘要.md) 为准，待总工复核。上文D1/A数量和过程性阻断为历史记录；通用说明已记录用户更正AppID后真实取号成功，不再追问旧no_permission。

工厂准入、完整资料变更、4个管理端页面、37操作均有实现；改号默认关闭且后端拒绝伪造phone/proof，普通资料可变更。B新迁移为V7/V8，已应用本地darkmujian；禁止修改已执行迁移或清库。正式后端使用`target/d2b/mujian-backend-0.1.0.jar --spring.profiles.active=local`，附加`-Djava.net.preferIPv4Stack=true`位于`-jar`前；读取既有`.local/runtime.properties`，当前18080已运行。

B定向前端命令：仓库根`node --test tests/factory-client.test.cjs tests/factory-admin.test.cjs`；实际响应schema测试另需MJ_EVIDENCE_DIR后执行`node --test tests/factory-contract.test.cjs`，没有采样会失败。管理端在admin-web运行`npm run build`。后端保护测试命令、持久测试配置和新库初始化方式见C-22第6节。不要用不带实采目录的旧全通配命令冒充本批验收。

本次隔离UI使用D2BVisualFixturesCli，仅测试classpath、真实测试MySQL/Redis及虚构微信/COS，已停止；5173→正式18080保留。原生IDE编译通过，原生工厂完整操作仍被窗口控制工具故障阻断；原型最终渲染对照未签收。不得把Node/浏览器证据代替真机通过。真实COS样本只存在私有B前缀，删除门禁保持关闭。


### C-22第8节增量修复（2026-10-29）

已知B-R01～04缺陷已修复，证据及原生/视觉余项见C-22第8.4～8.6节，待总工复核。当前正式本地后端使用`target/d2b-review/mujian-backend-0.1.0.jar`（local profile、既有LAN配置，`-Djava.net.preferIPv4Stack=true`位于`-jar`前），18080/5173保留，隔离5175已停止。此处覆盖上文历史构建路径；未执行新迁移，禁止修改已应用V7/V8。

前端根`node scripts/sync-response-contracts.cjs --check`核对正式D1/A/B派生响应注册表及B运行副本（小程序使用factory-contract-data.js，不以require加载JSON）；无--check时重新生成。共享请求按具体操作完整schema分类可信业务拒绝、会话失效及未知结果。仅增量实采契约验证时同时指定`MJ_INCREMENTAL=1`和新`MJ_EVIDENCE_DIR`，使用既有factory-contract.test.cjs，缺实际批准错误样本会失败，不会跳过。无关已过项继续复用，不重复全量或迁移验证。
