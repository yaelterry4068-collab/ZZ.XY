# 沾沾

一个本地运行的 Windows 剪贴板历史工具。第一版目标是独立安装、后台常驻、自动记录、快速找回。

## 第一版功能

- 自动记录文本剪贴板
- 自动记录图片剪贴板
- 图片保存为本地文件，历史数据只保存路径
- 可在设置中关闭图片记录
- 历史列表展示
- 搜索文本记录
- 点击文字历史项恢复到系统剪贴板
- 点击图片历史项查看大图
- 点击“复制”按钮把文字或图片重新复制到系统剪贴板
- 删除单条记录
- 清空全部记录
- 可设置最多保存 100-2000 条记录
- 关闭窗口后进入系统托盘
- 托盘支持打开、暂停监听、退出
- 可设置呼出快捷键：连续按两次 `Z` 或 `Alt+Space`
- 启动后默认后台运行，不显示传统菜单栏和标题栏
- 按 `Esc` 隐藏窗口
- 窗口使用透明安全边距和真实圆角悬浮面板
- 设置中的图片记录开关为自定义暗色 toggle
- 应用、托盘和安装包使用自定义图标
- 呼出、隐藏、悬停、复制反馈和图片预览带轻量动效
- 呼出窗口后自动聚焦搜索框
- 支持 `↑` / `↓` 选择记录，`Enter` 复制并隐藏，`Delete` 删除当前记录
- 鼠标点击“复制”后保留窗口，并显示“已复制 / 复制成功”反馈
- 首次启动会显示快捷键提示
- 设置面板可查看记录数量、图片数量、图片占用和数据目录
- 图片预览支持复制、上一张、下一张

## 本地运行

```bash
npm.cmd install
npm.cmd start
```

如果 Electron 下载不完整，可以使用镜像后重新安装：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm.cmd install --registry=https://registry.npmmirror.com
```

## 打包

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm.cmd run dist
```

打包完成后，安装包位于：

```text
dist-zhan/沾沾-Setup-0.1.0.exe
```

## 自动验收

打包后可以运行一键烟测：

```bash
npm.cmd run smoke
```

烟测会启动打包后的程序，临时写入一段测试文本到剪贴板，检查历史文件是否成功记录，然后关闭测试进程。测试会尽量恢复原来的文本剪贴板。

本地历史数据保存位置：

```text
C:\Users\<你的用户名>\AppData\Roaming\沾沾\clipboard-data\history.json
```

## 验收标准

- 安装包可以双击安装
- 安装后桌面图标可以启动
- 复制文字后能在历史中出现
- 复制图片后能在历史中出现预览
- 点击文字历史项可以恢复到剪贴板
- 点击图片历史项可以打开大图查看
- 点击“复制”按钮可以把文字或图片重新复制到剪贴板
- 连续按两次 `Z` 可以从任意位置呼出窗口
- 按 `Esc` 可以隐藏窗口
- 按 `↑` / `↓` 可以切换选中记录
- 按 `Enter` 可以复制当前选中记录并自动隐藏窗口
- 鼠标点击“复制”会保留窗口，方便继续查看记录
- 需要复制后立刻隐藏时，使用 `Enter`
- 搜索可以筛选文本记录
- 删除单条和清空全部可用
- 关闭窗口后程序仍在托盘后台运行
- 托盘菜单可以重新打开窗口和退出
- 重启软件后历史记录仍然保留
