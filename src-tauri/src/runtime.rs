use std::{path::Path, process::Command};

pub fn node_command(node: &Path, worker: &Path, request: &Path, data: &Path) -> Command {
    // Tauri 的 Windows 资源目录可能带扩展路径前缀；Node 24 加载该入口会报 EISDIR。
    // 仅在语义等价时转换路径，保留 UNC、中文和空格，不手动截断前缀。
    let mut command = Command::new(dunce::simplified(node));
    command
        .arg(dunce::simplified(worker))
        .arg(dunce::simplified(request))
        .current_dir(dunce::simplified(data));
    command
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn bundled_node_starts_with_canonical_windows_paths() {
        let root = std::env::temp_dir().join(format!("图片工作台 回归 {}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let worker = root.join("入口 脚本.cjs");
        let request = root.join("请求.json");
        std::fs::write(&request, r#"{"message":"中文路径正常"}"#).unwrap();
        std::fs::write(
            &worker,
            "const fs = require('node:fs'); console.log(fs.readFileSync(process.argv[2], 'utf8'));",
        )
        .unwrap();
        let node = Path::new(env!("CARGO_MANIFEST_DIR")).join("runtime/node.exe");
        let result = node_command(
            &std::fs::canonicalize(node).unwrap(),
            &std::fs::canonicalize(worker).unwrap(),
            &std::fs::canonicalize(request).unwrap(),
            &std::fs::canonicalize(&root).unwrap(),
        )
        .env("PATH", "")
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .output()
        .unwrap();
        std::fs::remove_dir_all(root).unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(String::from_utf8_lossy(&result.stdout).contains("中文路径正常"));
    }
}
