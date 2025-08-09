# Vertin的小提示 (Vertin's Tips)

为 SillyTavern 添加 AI 回复提示音的插件。

功能
- 回复成功/错误时自动播放提示音
- 本地音频上传（浏览器 IndexedDB 持久化）
- 音量调节与测试按钮
- 支持中文文件名

安装
- 将 vertin-tips 目录复制到 SillyTavern/public/scripts/extensions/third-party/
- 重启 SillyTavern 或刷新页面

使用
- 打开：SillyTavern → 扩展设置 → “Vertin的小提示”
- 勾选“启用提示音”
- 为“成功/错误提示音”选择音源：
  - 上传本地文件（mp3/wav/ogg，≤10MB），或
  - 将文件放入 audio/success 与 audio/error，点击“刷新列表”
- 点击“测试”试听；使用滑块调节音量

说明
- 本插件不向服务器上传文件；所有上传内容仅存储在浏览器（IndexedDB）
- 不支持 URL 音源
- 若需同时在“成功/错误”下拉出现，请分别上传或分别放置到对应目录

许可证
- MIT

作者
- RaphllA
