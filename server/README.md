# 模型密钥配置

## Bilibili 实时弹幕登录配置

弹幕由本机服务通过 WebSocket 接收，设置页和直播源共享连接。历史弹幕接口为空不再影响接收。连接认证成功只表示通道已建立，设置页的“已收到 N 条直播事件”才表示实际收到消息。

推荐在 `/live-settings` 的“B站账号”中点击“扫码登录 B站”，用哔哩哔哩 App 扫码并确认。二维码在本机渲染，有效期 180 秒，支持取消和过期刷新；生成间隔至少 10 秒，登录状态每 2 秒检查一次。该流程参考 fishingNet 的 B站网页登录实现，不是开放平台 OAuth。真实网络已验证二维码生成和等待扫码；完成手机确认及实际弹幕接收仍需用户验证。

成功后服务端仅保存弹幕连接需要的 `SESSDATA`、`DedeUserID` 及返回的设备标识至 `bilibili.local.json`，不会将 Cookie 返回网页或写入浏览器存储。二维码会话密钥仅存进程内存，重启后需要重新生成二维码。页面上的“清除本机登录”会清空本机凭据，不会退出其他设备。

手动配置仍兼容：可复制 `bilibili.example.json` 为同目录下的 `bilibili.local.json`，将已登录浏览器的请求 Cookie 填入 `cookie` 字段（需包含 `SESSDATA`、`DedeUserID`，建议保留 `buvid3`）：

```json
{ "cookie": "" }
```

Cookie 可在浏览器开发者工具的“网络”中，选择发往 Bilibili 的请求，在请求标头中找到。不要将它发到聊天或提交到仓库。该文件已被 Git 忽略，服务也禁止通过网页读取 `server/` 目录。服务不会把 Cookie 返回给直播页面。保存后下一次状态查询自动重连，无需重启；Cookie 过期后需更新。登录配置能否解决接收问题，需要实际发送弹幕验证。

实时连接无人查询 60 秒后自动回收，直播页面或设置页打开且启用自动连接时会持续查询。重新启用后只接收新消息，不补播停用期间的历史弹幕。

## 模型和语音密钥

在同一目录的 `models.local.json` 中填写密钥（首次获取源码时可复制 `models.example.json` 为此文件）：

```json
{
  "mimo": { "apiKey": "你的 MiMo Token Plan 专属密钥" },
  "deepseek": { "apiKey": "你的 DeepSeek API 密钥" },
  "tts": { "base": "https://api.openai.com/v1", "apiKey": "你的 OpenAI 兼容 TTS 密钥（可选）" },
  "cosyvoice": { "apiKey": "你的阿里云 DashScope 密钥（可选，声音最自然）" }
}
```

未使用的服务保留空字符串即可。保存文件后立即生效，无需重启。文件须为有效 JSON，保留双引号，不添加注释。

启动项目，在“分析设置 → 模型预设”中选择 MiMo、DeepSeek Flash 或 DeepSeek V4 Pro，再点击“测试连接”。DeepSeek 两个模型共用同一个 Key；MiMo 使用 Token Plan 国内地址。

直播模式的“声音”默认走浏览器自带语音合成（优先挑选微软/Google 的中文神经网络音色，无需 Key）；把来源切到 CosyVoice（填写 `cosyvoice.apiKey`）可获得与 Coopanion 同款的自然音色，OpenAI 兼容则填写 `tts.apiKey`。

密钥只由运行项目的服务端读取，不会发送给浏览器、写入局面库或打包到网页。`models.local.json` 已排除在 Git 之外；不要将填写后的文件公开分享。服务默认只监听本机。自定义模型仍可选择原有的浏览器直连方式。

### COEIROINK 日语配音

启动本机 COEIROINK v2（默认接口 http://127.0.0.1:50032），在直播设置中开启声音并选择「COEIROINK（日语配音 / 中文显示）」，点击试听。使用首个已安装角色的首个风格。中文回答仍用于显示和历史，配音额外调用当前 DeepSeek 聊天模型翻译成日语，再由本机合成 WAV；需已有 deepseek.apiKey，会增加一次模型调用和延迟。翻译或合成失败不会回退朗读中文；试听会显示错误，直播错误写入日志。

预合成本地台词：运行 `node scripts/prebuild-local-voice.mjs`，读取 `data/live-settings.json` 当前语速/音调，使用 COEIROINK 首个音色生成所有固定台词（含棋子、格子变体）。音频存于 `data/local-voice/`，不提交 Git；清单记录音色和参数。直播接口优先读缓存，命中时无需运行 COEIROINK，也无需模型密钥。改变语速或音调后需重新运行预合成，未缓存的参数仍实时合成。若要更换预合成音色，先备份并移走旧的 `data/local-voice/`，再生成。气泡依旧跟随实际播放开始和结束。

动态 AI 配音在同一次翻译请求中选择当前角色的可用风格：普通、轻声、得意挑衅、失落受挫。服务端验证 styleId，不存在的风格回退首选。固定本地台词不进行风格选择，继续使用首选风格及预合成缓存。
