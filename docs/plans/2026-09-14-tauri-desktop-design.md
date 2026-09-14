# Tauri 桌面图片工作台

目标：Windows、macOS 用户安装应用后，选择图片或文件夹，使用已登录的 ChatGPT 网页账号处理并下载图片；不要求用户安装 Node.js 或 pnpm。

采用 Tauri 2 + Vue 3 + TypeScript，Tailwind 和 Radix Vue 组件。App 负责组合，InputPanel 选择素材、PromptPanel 编辑提示词、TaskPanel 显示状态；useWorkshop 维护任务和事件生命周期。

Rust 后端仅启动固定的内置 Node 与 worker，不接受任意可执行程序。请求通过 JSON 文件传递，避免提示词成为 shell 代码。登录目录放置应用数据目录，输出默认放在用户图片目录。处理引擎沿用上传预览验证、发送附件确认、下载、Sharp PNG 校验和原会话补下载。

CLI 通过 JSON 行输出队列和状态；只有写盘并完成图像校验才发出 done。标准输入 cancel 用于 Windows/macOS 统一取消，正常退出后才解除应用运行状态。任务运行时阻止关闭主窗口，避免下载中途退出。默认透明提示词可勾选；自定义提示词可决定是否要求 Alpha。

构建使用当前平台的 Node 与原生 sharp；Windows 和 macOS 必须分别在对应系统构建，不混用二进制。现阶段不支持移动端和 Linux。Chrome 和 ChatGPT 网页访问仍是运行条件。

## 本机验证结果

- 前端 TypeScript / Vite 构建、ESLint、Rust cargo check 通过。
- 7 项测试通过：请求与多图路径校验、原配置补下载、真实浏览器连续两张 Blob 下载、透明 PNG 校验、无系统 PATH 的内置运行环境、桌面 UI 模拟事件与偏好恢复。
- macOS ARM64 发行编译、`.app`、DMG 产物生成成功。
- 实际 `.app` 打开并通过原生 IPC 调用包内 worker，补下载空队列正常完成。
- 原生选图已可使用；用户在应用中启动一张图片后，因独立登录目录未登录，在上传前退出。未宣称真实 ChatGPT 生成下载完成。
- Windows / Intel macOS 构建配置已提供，未在这台 ARM64 Mac 上执行 Windows 实机验证。GitHub 工作流需将本项目作为仓库根目录发布后触发。
