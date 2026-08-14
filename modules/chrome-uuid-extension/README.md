# URL UUID Chrome 插件

从当前页面 URL 中提取 UUID，支持一键复制与替换后刷新。

## 功能

- 下拉选择 UUID 格式：`UUID（带 -）` / `UUID（不带 -）` / `自定义格式（正则）`，选择会自动保存；自定义正则支持 `pattern` 或 `/pattern/` 写法，自动加 `i` 标志
- 可开关「显示悬浮按钮」；开启后页面含 UUID 时显示可拖动复制按钮，位置会记住
- 界面主题可选：`白色` / `黑色` / `跟随系统`（弹窗与油猴面板同步支持）
- 按所选格式识别、展示、复制、替换当前 URL 中的 UUID；URL 含多个 UUID 时以下拉框选择，替换时仅替换所选的那一个
- 输入新 UUID 后点击「确定并刷新」，替换 URL 并跳转

## 安装（开发者模式）

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本目录：`modules/chrome-uuid-extension`

## 使用

1. 打开包含 UUID 的页面，例如：
   `https://example.com/resource/a1b2c3d4-e5f6-4789-a012-3456789abcde`
2. 页面右下角会出现「复制 UUID」悬浮按钮，点击即可复制
3. 或点击浏览器工具栏中的插件图标，查看 / 复制 / 替换 UUID

## 文件结构

```
modules/chrome-uuid-extension/
├── manifest.json   # 插件配置（Manifest V3）
├── popup.html      # 弹窗界面
├── popup.css       # 弹窗样式
├── popup.js        # 弹窗逻辑
├── content.js      # 页面悬浮复制按钮
├── content.css     # 悬浮按钮样式
└── README.md
```

## 油猴脚本

不想安装 Chrome 插件？仓库还提供了同功能的油猴脚本（Tampermonkey），见根目录 [`userscript/url-uuid.user.js`](../../userscript/url-uuid.user.js)。
