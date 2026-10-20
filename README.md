# 小睿：每日内容更新

本项目是原有小睿 PWA 的增量修改，支持本地服务与 GitHub Pages 云端定时更新。

## 线上站点

https://blblbl293529.github.io/xiaorui/

GitHub Actions 在代码推送、手动运行和每小时 UTC 第 17 分钟执行：更新内容，保存去重历史，发布静态页面及 `daily.json`。抖音自动推荐代码已接入，配置获授权的应用凭据后启用；未配置时显示「自动推荐待开通」和搜索入口。电脑关机不影响云端任务；GitHub 定时任务可能延迟，不保证精确到点。连续 60 天无仓库活动时，平台可能停用定时任务，需要在 Actions 页面重新启用。

手机页面的「检查云端更新」读取最近发布结果，不直接触发第三方抓取。来源失败会显示旧内容日期或失败状态。`content-history.json` 只保存公开内容的标识、日期和元数据，用于跨云端运行去重。发布目录仅包含明确列出的前端资源和每日结果，不包含本地日志、数据库或个人记录。

## 启动

Windows PowerShell：

```powershell
.\start-local.ps1
```

或使用 Python 3.10+：

```text
python server.py --port 8765
```

打开 http://127.0.0.1:8765 。本地模式使用 Python API，默认仅本机可访问。线上模式由 `python publish_daily.py` 生成 `_site`，通过 GitHub Pages 发布；不可直接把未构建的源码目录作为每日内容站点。

## 已实现

- 健康页支持腿部塑形、臀部力量、放松拉伸三个抖音自动推荐栏目；可按类别标记当日跟练已完成。
- 通过官方视频搜索接口查询近七天内容，按发布时间选择；跨栏目和跨日去重，无新视频不循环，失败时只保留带原日期的抖音缓存。
- 发现页移除固定视频、壁纸、诗词数组及日期取模轮播。
- 发现页推荐自然、人文、纪录片类抖音视频，显示标题、作者、发布日期、封面与原视频链接。未配置时四个视频栏目返回 `mode: external_search`、`item: null`；启用后返回 `mode: automatic`，不复用旧平台历史视频。
- 今日美图：必应每日壁纸，保留版权信息和来源链接；无随机图片兜底。日期来自源的完整更新时间。
- 今日一文：少数派 RSS，仅标题、来源、发布日期和原文入口，不转载全文。
- 页面可见时，同一天也自动同步服务端结果：存在缺失或失败时每 2 分钟检查，全部成功时每 15 分钟检查；跨日、回到前台、网络恢复或进入健康/发现页时检查（距上次请求至少 60 秒）。服务运行期间每 15 分钟检查来源是否需要更新，成功结果缓存 4 小时，缺失/失败结果 15 分钟重试；手动检查最短间隔 60 秒。
- 选择历史存储于 `.local/daily.sqlite3`，服务重启也保留。ID 全局去重，同日同栏目的已选条目可以继续展示；次日不会重新推荐已使用 ID。无新内容时显示空态，不回头循环。
- 来源失败时，可展示上一条内容，并明确标记原推荐日期。离线浏览器缓存同样标为旧内容；API 不进入 Service Worker 缓存。

「最新」指当前来源能够返回的近期内容中按来源时间选择，不承诺全网最新或每天都有新发布。部分来源可能没有当天内容，页面显示真实日期。

## 已知限制

- 抖音真实接口尚未验证：当前仓库未配置授权凭据。代码和模拟官方响应的回归测试通过，不等于应用已获得平台权限。手机是否唤起抖音 App 由浏览器及设备决定。
- 美图和文章依赖第三方来源，可能改变接口或暂停更新。本地状态以 `/api/daily` 为准；线上状态以 `daily.json` 为准。
- 「标记完成」按北京时间日期及跟练类别保存在当前浏览器；健康、记账数据仍遵循原应用的本地存储方式，本次没有加入云同步。
- 训练区侧重力量和柔韧性，不承诺局部减脂效果。

## 启用抖音自动推荐

1. 在抖音开放平台创建符合条件的移动／网站应用，申请 `aweme.dy.video_search`（抖音视频垂搜）能力；是否获批以平台审核为准。
2. 在仓库 Settings → Secrets and variables → Actions → New repository secret 配置：
   - `DOUYIN_CLIENT_KEY`：应用 Client Key。
   - `DOUYIN_CLIENT_SECRET`：应用 Client Secret。
   - `DOUYIN_DEVICE_ID`：按开放平台要求取得的有效设备 ID（正整数 Int64）；不要复制文档示例或随意编造。
3. 打开 Actions → Publish Xiaorui and refresh daily content → Run workflow。全部获授权且参数有效后，四个栏目会从搜索入口切换为自动推荐；首次运行后核对 `daily.json` 的栏目状态。

Secrets 只注入构建步骤，测试不接触真实凭据；凭据与 token 不写入前端、发布产物或推荐历史。token 在进程内共享并按有效期更新，过期响应最多刷新重试一次。日志只记录错误类型、HTTP 状态及平台错误码，不记录错误正文。`28001018` 表示缺少能力，`28003017` 表示额度耗尽。部分配置缺失会报错，不伪装成成功。

本地需要在服务进程的环境变量中配置同名项并重启。测试环境不要使用生产应用凭据获取 token，避免影响生产 token。无需向聊天发送密钥。

官方参考：[视频搜索](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/douyin-search-capability/aweme-dy-video-search)、[client_token](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/client-token)。

## 接口与验证

- `GET /api/daily`：日期、最近检查时间及六个独立内容区。
- `POST /api/daily/refresh`：受一分钟节流保护的重新检查，不清空历史。
- 内容状态 `fresh / stale / empty / error`；保留 `selectedDate` 与来源 `publishedAt`。未配置的抖音入口使用 `empty` 配合 `mode: external_search`，不触发来源错误日志；已配置时鉴权、网络、额度等失败按栏目报告。
- 静态路由仅允许显式前端文件；`.git`、代码、数据库、错误日志均不对外提供。

```text
python -m unittest discover -s tests -v
node tests/daily-refresh.cjs
node tests/browser.cjs
```

浏览器测试需安装 Playwright、Microsoft Edge，并先启动本地服务。测试包含手机尺寸布局、文本注入防护、完成标记持久化、旧日期与离线降级；真实来源截图保存至 `.local/`。

## Magpie 协作与告警

编排脚本和任务记录位于 `C:\Users\24686\Documents\ChatGPT\diy agent`。前端草稿、需求审查与集成审查均实际通过 `group/deepseek-free` 调用，返回模型为 `deepseek-v4.1-flash`。协调者检查并修复草稿后集成，模型评审不代替实际测试。

该组按顺序使用 WorkBuddy 的 DeepSeek V4.1 Flash、DeepSeek V4 Pro。两者共享同一 Free 账户额度，不是两个独立免费额度池。已配置自动切换，但未人为耗尽账户来验证切换。

本地错误事件只记录组件、时间、类型和 HTTP 状态，写入 `.local/errors.jsonl`。邮件告警需另行配置发件通道，本应用不内置邮件账户。云端抓取状态可在 GitHub Actions 日志及线上 `daily.json` 查看。
