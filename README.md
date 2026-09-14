# Image Workshop 图片工作台

Tauri 2 桌面应用，支持 macOS / Windows。选择图片或文件夹，用现有 ChatGPT 网页账号批量处理，自动校验并保存 PNG。安装包内置 Node 和处理依赖，最终用户无需安装开发环境，但需要 Google Chrome。

## 使用

1. 打开应用，点击「登录 ChatGPT」。在专用 Chrome 登录，完成后退出该专用 Chrome，应用自动检查登录状态。
2. 选择多张图片或一个文件夹。文件夹读取当前层级的 PNG/JPEG/WebP。
3. 勾选默认透明背景提示词，或取消勾选并输入自己的指令；白底任务不要要求透明区域。
4. 选择输出目录并点击「开始处理」。每次开始都重新生成，不跳过之前处理过的图片。
5. 等待显示「已保存」。中途失败可以使用「补下载未完成图片」恢复已提交的原会话。

运行中先点击停止，等处理程序退出后再关闭窗口。首次登录必须人工完成；网站限额、验证和生成失败会在日志中显示。

## 开发和打包

开发需要 Node 24、pnpm 10、稳定版 Rust 和 Tauri 对应系统构建工具。

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
pnpm desktop:build
```

`desktop:prepare` 将当前系统 Node、Playwright、Sharp 及运行脚本放入 src-tauri/runtime，打包后从应用资源目录启动。不依赖用户 PATH 中的 Node。请用官方 Node 发行版构建，不使用依赖 Homebrew 动态库的 Node。

macOS 产物在 `src-tauri/target/release/bundle/`。Windows 上可运行 `pnpm desktop:build --bundles nsis` 生成安装程序。仓库包含 `.github/workflows/desktop.yml`，可手动触发 Windows x64、macOS ARM64 和 Intel 构建；尚未配置发行签名/公证。

在 GitHub 仓库的 Actions →「桌面应用构建」→ Run workflow 启动构建。通过后从该次运行的 Artifacts 下载对应系统安装包：Windows-x64 为 EXE，macOS-arm64 适用于 Apple Silicon，macOS-x64 适用于 Intel。也可推送 `desktop-v*` 标签触发。产物保留 30 天，安装包内置对应平台的 Node，不需要用户另外安装 Node。

登录态保存在系统应用数据目录 `com.hikaru.imageworkshop/chrome-profile`，与源码目录中旧的 CLI 登录态分开，需要首次登录一次。默认输出在用户图片目录 `Image Workshop`。包内不包含账号、原图或输出。

## 验证

```sh
pnpm test:desktop
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

当前支持桌面 Windows/macOS，移动端和 Linux 尚未适配。macOS 上的通过不代表 Windows 实机通过，Windows 产物需在 Windows 验证登录和多图下载。

本地完整测试需先运行 `pnpm desktop:prepare` 和 `pnpm dev`，再在另一终端设置 `GPT_UI_TEST=1`、`GPT_RUNTIME_TEST=1` 后执行 `pnpm test:desktop`。UI 测试使用 Tauri IPC 模拟，运行环境测试清空 PATH；下载回归使用本地浏览器 Blob，不消耗 ChatGPT 额度。真实账号的生成结果仍需在桌面应用中验证。

登录流程会先在后台检查已有会话。需要登录时，处理程序先完全退出自动化浏览器，再打开普通 Chrome，避免在 Playwright 窗口中进行 Google 登录。完成登录后退出该专用 Chrome，后台验证成功后自动继续本次处理。若普通 Chrome 仍显示 Google 安全拒绝，应用无法代替 Google 批准登录，请先确认该账号能在最新版普通 Chrome 中正常登录。

macOS 登录窗口通过系统 LaunchServices 启动，并显式请求新窗口；Windows 同样显式请求新窗口。启动命令失败时会显示错误，不再仅凭创建子进程就宣称窗口已经打开。

会话检查使用 ChatGPT 的会话响应区分已登录、明确未登录和网络/站点验证错误；不再把无头浏览器遇到的「Just a moment…」页面判定为退出登录。实际图片操作仍在有窗口的 Chrome 中进行。登录检查不会输出会话令牌。
