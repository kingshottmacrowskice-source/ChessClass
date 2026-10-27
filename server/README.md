# 模型密钥配置

在同一目录的 `models.local.json` 中填写密钥（首次获取源码时可复制 `models.example.json` 为此文件）：

```json
{
  "mimo": { "apiKey": "你的 MiMo Token Plan 专属密钥" },
  "deepseek": { "apiKey": "你的 DeepSeek API 密钥" }
}
```

未使用的服务保留空字符串即可。保存文件后立即生效，无需重启。文件须为有效 JSON，保留双引号，不添加注释。

启动项目，在“分析设置 → 模型预设”中选择 MiMo、DeepSeek Flash 或 DeepSeek V4 Pro，再点击“测试连接”。DeepSeek 两个模型共用同一个 Key；MiMo 使用 Token Plan 国内地址。

密钥只由运行项目的服务端读取，不会发送给浏览器、写入局面库或打包到网页。`models.local.json` 已排除在 Git 之外；不要将填写后的文件公开分享。服务默认只监听本机。自定义模型仍可选择原有的浏览器直连方式。
