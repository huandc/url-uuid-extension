# url-uuid-extension

从当前页面 URL 中提取 UUID 的工具集，支持一键复制与替换后刷新。

提供两种使用方式：

- **Chrome 插件**（Manifest V3）：`modules/chrome-uuid-extension/`
- **油猴脚本**（Tampermonkey / Greasemonkey）：`userscript/url-uuid.user.js`

## 功能

- 下拉选择 UUID 格式：`UUID（带 -）` / `UUID（不带 -）` / `自定义格式（正则）`，选择会自动保存；自定义正则支持 `pattern` 或 `/pattern/` 写法，自动加 `i` 标志
- 可开关「显示悬浮按钮」；开启后页面含 UUID 时显示可拖动复制按钮，位置会记住
- 界面主题可选：`白色` / `黑色` / `跟随系统`（弹窗与油猴面板同步支持）
- 按所选格式识别、展示、复制、替换当前 URL 中的 UUID；URL 含多个 UUID 时以下拉框选择，替换时仅替换所选的那一个
- 输入新 UUID 后点击「确定并刷新」，替换 URL 并跳转
- 严格校验 UUID 版本（v1–v5）与变体位，避免误识别

## Chrome 插件

安装（开发者模式）：

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本目录：`modules/chrome-uuid-extension`

详见 [`modules/chrome-uuid-extension/README.md`](modules/chrome-uuid-extension/README.md)。

## 油猴脚本

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Greasemonkey）扩展
2. 新建脚本，将 [`userscript/url-uuid.user.js`](userscript/url-uuid.user.js) 的全部内容粘贴进去（或直接把该文件拖入 Tampermonkey 管理面板）
3. 保存后打开任意含 UUID 的页面即可使用

与插件版相同的用法：右下角「复制 UUID」悬浮按钮点击复制、可拖动记忆位置；点击旁边的 ⚙ 打开设置面板，可切换格式、查看 / 复制当前 UUID、输入新 UUID 后「确定并刷新」。

> 油猴版的设置（格式、按钮位置）保存在脚本自身的 GM 存储中，与插件版互不影响，可同时使用。

## 文件结构

```
url-uuid-extension/
├── modules/
│   └── chrome-uuid-extension/   # Chrome 插件（Manifest V3）
└── userscript/
    └── url-uuid.user.js         # 油猴脚本
```
