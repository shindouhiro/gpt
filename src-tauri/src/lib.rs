use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{Emitter, Manager, State};
mod runtime;

#[derive(Default)]
struct Tasks(Mutex<Option<Child>>);
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    mode: String,
    inputs: Vec<String>,
    output: String,
    prompt: String,
    use_default: bool,
    require_alpha: bool,
}
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
#[tauri::command]
fn defaults(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .picture_dir()
        .or_else(|_| app.path().document_dir())
        .unwrap_or(data_dir(&app)?)
        .join("Image Workshop");
    data_dir(&app)?;
    Ok(dir.to_string_lossy().into_owned())
}
#[tauri::command]
fn start_task(app: tauri::AppHandle, state: State<Tasks>, request: Request) -> Result<(), String> {
    let mut active = state.0.lock().map_err(|e| e.to_string())?;
    if active.is_some() {
        return Err("已有任务正在运行".into());
    }
    if !["process", "login", "retry", "check"].contains(&request.mode.as_str()) {
        return Err("未知任务类型".into());
    }
    if request.mode == "process" && request.inputs.is_empty() {
        return Err("请先选择图片".into());
    }
    let data = data_dir(&app)?;
    if ["process", "retry"].contains(&request.mode.as_str())
        && !PathBuf::from(&request.output).is_absolute()
    {
        return Err("输出目录必须是绝对路径".into());
    }
    let mut value = serde_json::to_value(request).map_err(|e| e.to_string())?;
    if !PathBuf::from(value["output"].as_str().unwrap_or_default()).is_absolute() {
        value["output"] = serde_json::json!(data.join("Image Workshop"));
    }
    value["profile"] = serde_json::json!(data.join("chrome-profile"));
    let file = data.join("request.json");
    std::fs::write(
        &file,
        serde_json::to_vec(&value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let runtime = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime")
    } else {
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("runtime")
    };
    let mut command = runtime::node_command(
        &runtime.join(if cfg!(windows) { "node.exe" } else { "node" }),
        &runtime.join("tools/desktop/worker.mjs"),
        &file,
        &data,
    );
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // 防止用户环境中的 Node 注入选项影响内置运行环境。
    command.env_remove("NODE_OPTIONS").env_remove("NODE_PATH");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动内置处理程序：{e}"))?;
    let stdout = child.stdout.take().ok_or("无法读取任务输出")?;
    let stderr = child.stderr.take().ok_or("无法读取任务错误")?;
    *active = Some(child);
    let out_app = app.clone();
    let output_thread = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                if value.get("desktopEvent").is_some() {
                    let _ = out_app.emit("task-event", value);
                    continue;
                }
            }
            let _ = out_app.emit("task-log", line);
        }
    });
    let err_app = app.clone();
    let error_thread = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = err_app.emit("task-log", line);
        }
    });
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(150));
        let state = app.state::<Tasks>();
        let result = {
            let mut guard = state.0.lock().unwrap();
            match guard.as_mut().unwrap().try_wait() {
                Ok(Some(status)) => Some(status.code().unwrap_or(1)),
                Ok(None) => None,
                Err(_) => Some(1),
            }
        };
        if let Some(code) = result {
            let _ = output_thread.join();
            let _ = error_thread.join();
            let mut guard = state.0.lock().unwrap();
            *guard = None;
            let _ = std::fs::remove_file(&file);
            let _ = app.emit("task-finished", code);
            break;
        }
    });
    Ok(())
}
#[tauri::command]
fn cancel_task(state: State<Tasks>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(b"cancel\n").map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
fn open_output(path: String) -> Result<(), String> {
    let dir = PathBuf::from(path);
    if !dir.is_absolute() || !dir.is_dir() {
        return Err("输出目录尚未创建".into());
    }
    let mut cmd = Command::new(if cfg!(windows) {
        "explorer.exe"
    } else {
        "/usr/bin/open"
    });
    cmd.arg(dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Tasks::default())
        .invoke_handler(tauri::generate_handler![
            defaults,
            start_task,
            cancel_task,
            open_output
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<Tasks>().0.lock().unwrap().is_some() {
                    api.prevent_close();
                    let _ = window.emit(
                        "task-log",
                        "任务正在运行，请先停止任务，待处理程序退出后关闭窗口。",
                    );
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("桌面应用启动失败");
}
