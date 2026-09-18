//! Управление Python Sidecar (master §8.1) — стабильная версия.
//!
//! Гарантии (после инцидента SIGABRT в did_finish_launching):
//!  * НИ ОДНОГО panic/expect/unwrap на критическом пути — любая ошибка
//!    запуска превращается в событие `sidecar://error` во фронтенд;
//!  * инициализация НЕ блокирует did_finish_launching: весь жизненный цикл
//!    (spawn, чтение stdout, reap, рестарт) живёт в фоновых потоках;
//!  * crash/зависание Python → событие `sidecar://dead` + авто-перезапуск
//!    (не более MAX_RESTARTS); зависание «нажитое» ловит Python-внутренний
//!    watchdog (8 с без heartbeat → exit(0)) — supervisor его подхватит;
//!  * stdout читается отдельным потоком до EOF (pipe не переполняется),
//!    готовность — по строке "SIDECAR_READY";
//!  * фронтенд не зависит от гонки событий: может в любой момент спросить
//!    готовый URL командой `sidecar_url`.

use std::io::{BufRead, BufReader};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, Manager, Runtime, State};

const MAX_RESTARTS: u32 = 3;
const RESTART_DELAY_MS: u64 = 1500;
const REAP_INTERVAL_MS: u64 = 500;

#[derive(Default)]
pub struct SidecarState {
    pub port: Arc<AtomicU64>,
    pub pid: Arc<Mutex<Option<u32>>>,
    pub alive: Arc<AtomicBool>,
}

#[derive(Serialize, Clone)]
pub struct ReadyPayload {
    pub port: u16,
}

#[derive(Serialize, Clone)]
pub struct DeadPayload {
    pub code: i32,
}

#[derive(Serialize, Clone)]
pub struct ErrorPayload {
    pub message: String,
}

#[tauri::command]
pub fn sidecar_url(state: State<SidecarState>) -> String {
    let p = state.port.load(Ordering::Relaxed);
    if p == 0 {
        String::new()
    } else {
        format!("http://127.0.0.1:{p}")
    }
}

#[tauri::command]
pub fn sidecar_status(state: State<SidecarState>) -> u64 {
    state.port.load(Ordering::Relaxed)
}

fn log(msg: &str) {
    eprintln!("{msg}");
}

fn emit_err<R: Runtime>(app: &tauri::AppHandle<R>, message: &str) {
    log(&format!("[sidecar] ОШИБКА: {message}"));
    let _ = app.emit(
        "sidecar://error",
        ErrorPayload {
            message: message.to_string(),
        },
    );
}

/// Точка входа: вызывается из setup() Tauri. Ничего не блокирует —
/// разворачивает только supervisor-поток.
pub fn spawn<R: Runtime>(app: tauri::AppHandle<R>) {
    let port = {
        let st = app.state::<SidecarState>();
        st.port.clone()
    };
    let pid = {
        let st = app.state::<SidecarState>();
        st.pid.clone()
    };
    let alive = {
        let st = app.state::<SidecarState>();
        st.alive.clone()
    };
    if std::thread::Builder::new()
        .name("sidecar-supervisor".into())
        .spawn(move || supervisor_loop(app, port, pid, alive))
        .is_err()
    {
        eprintln!("[sidecar] не удалось создать поток супервизора");
    }
}

fn spawn_child(cmd_path: &str, args: &[String]) -> std::io::Result<Child> {
    let mut c = Command::new(cmd_path);
    c.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    // Windows: Tauri — GUI-приложение без консоли; без этого флага
    // console-исполняемый sidecar вывалит чёрное консольное окно.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c.spawn()
}

/// Отдельный поток: читает stdout до EOF (pipe не забивается), находит
/// "SIDECAR_READY", сохраняет порт и шлёт `sidecar://ready` во фронтенд.
fn read_stdout<R: Runtime>(stdout: ChildStdout, app: tauri::AppHandle<R>, port: Arc<AtomicU64>) {
    let reader = BufReader::new(stdout);
    let mut ready_sent = false;
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        if !ready_sent {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                if v.get("event").and_then(|e| e.as_str()) == Some("SIDECAR_READY") {
                    if let Some(p) = v.get("port").and_then(|p| p.as_u64()) {
                        port.store(p, Ordering::Relaxed);
                        let _ = app.emit(
                            "sidecar://ready",
                            ReadyPayload { port: p as u16 },
                        );
                        log(&format!("[sidecar] READY: порт {p}"));
                        ready_sent = true;
                        continue;
                    }
                }
            }
        }
        log(&format!("[sidecar] {line}"));
    }
}

/// Супервизор: spawn → чтение stdout (фоновый поток) → reap (try_wait) →
/// при смерти: событие + авто-перезапуск. Ни один шаг не паникует.
fn supervisor_loop<R: Runtime>(
    app: tauri::AppHandle<R>,
    port: Arc<AtomicU64>,
    pid: Arc<Mutex<Option<u32>>>,
    alive: Arc<AtomicBool>,
) {
    let mut restarts = 0u32;
    loop {
        let (cmd_path, args) = match build_command(&app) {
            Ok(v) => v,
            Err(message) => {
                emit_err(&app, &message);
                if restarts >= MAX_RESTARTS {
                    break;
                }
                restarts += 1;
                std::thread::sleep(Duration::from_millis(RESTART_DELAY_MS));
                continue;
            }
        };
        log(&format!("[sidecar] запуск: {cmd_path}"));
        let mut child = match spawn_child(&cmd_path, &args) {
            Ok(c) => c,
            Err(e) => {
                emit_err(&app, &format!("не удалось запустить sidecar: {e}"));
                if restarts >= MAX_RESTARTS {
                    break;
                }
                restarts += 1;
                std::thread::sleep(Duration::from_millis(RESTART_DELAY_MS));
                continue;
            }
        };

        // std::process::Child::id() в современных Rust (>=1.9x) возвращает
        // u32 напрямую (Option утратил смысл — на всех поддерживаемых ОС pid
        // известен сразу).
        let id = child.id();
        *pid.lock().unwrap_or_else(|e| e.into_inner()) = Some(id);
        log(&format!("[sidecar] pid={id}"));

        // Сбросим состояние «до READY» и поднимем читалку stdout в фоне.
        port.store(0, Ordering::Relaxed);
        alive.store(true, Ordering::Relaxed);
        if let Some(out) = child.stdout.take() {
            let app2 = app.clone();
            let port2 = port.clone();
            let _ = std::thread::Builder::new()
                .name("sidecar-stdout".into())
                .spawn(move || read_stdout(out, app2, port2));
        }

        // Неблокирующий reap: процесс не вешает ни GUI, ни supervisor.
        let started = Instant::now();
        let exit_code = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status.code().unwrap_or(-1),
                Ok(None) => std::thread::sleep(Duration::from_millis(REAP_INTERVAL_MS)),
                Err(e) => {
                    log(&format!("[sidecar] try_wait: {e}"));
                    break -1;
                }
            }
        };
        alive.store(false, Ordering::Relaxed);
        *pid.lock().unwrap_or_else(|e| e.into_inner()) = None;
        log(&format!(
            "[sidecar] завершился code={exit_code} (жил {:?})",
            started.elapsed()
        ));
        let _ = app.emit("sidecar://dead", DeadPayload { code: exit_code });

        if restarts >= MAX_RESTARTS {
            emit_err(
                &app,
                "sidecar завершился несколько раз — авто-перезапуск остановлен. \
                 Перезапустите приложение.",
            );
            break;
        }
        restarts += 1;
        log(&format!(
            "[sidecar] авто-перезапуск {restarts}/{MAX_RESTARTS} через {RESTART_DELAY_MS} мс"
        ));
        std::thread::sleep(Duration::from_millis(RESTART_DELAY_MS));
    }
}

/// Dev: живьём из исходников — python3 src-python/server.py (путь Python можно
/// переопределить env RAWRENAMER_PYTHON, например venv).
#[cfg(debug_assertions)]
fn dev_command() -> (String, Vec<String>) {
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let py = std::env::var("RAWRENAMER_PYTHON").unwrap_or_else(|_| {
        if cfg!(windows) {
            "python".into()
        } else {
            "python3".into()
        }
    });
    (
        py,
        vec![
            base.join("src-python").join("server.py").to_string_lossy().into_owned(),
            "--port".into(),
            "0".into(),
            "--port-file".into(),
            base.join(".sidecar").join("port").to_string_lossy().into_owned(),
            "--data-dir".into(),
            base.join(".data").to_string_lossy().into_owned(),
            "--watchdog".into(),
            "8".into(),
        ],
    )
}

/// Release: бинарник PyInstaller из bundle externalBin
/// (src-tauri/binaries/raw-renamer-sidecar-<target-triple>).
/// Tauri раскладывает externalBin по-разному в зависимости от ОС
/// (macOS: Contents/MacOS/binaries, Windows: resources\binaries, …) —
/// перебираем все разумные каталоги. Возвращает Option — без паник.
#[cfg(not(debug_assertions))]
fn find_release_binary<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(rd) = app.path().resource_dir() {
        candidates.push(rd.join("binaries"));
        candidates.push(rd.join("resources").join("binaries"));
        if let Some(parent) = rd.parent() {
            candidates.push(parent.join("MacOS").join("binaries"));
            candidates.push(parent.join("Resources").join("binaries"));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("binaries"));
            candidates.push(parent.join("resources").join("binaries"));
            candidates.push(parent.to_path_buf());
        }
    }
    candidates.iter().find_map(|dir| {
        std::fs::read_dir(dir)
            .ok()
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .find(|p| {
                p.file_name()
                    .map(|n| n.to_string_lossy().starts_with("raw-renamer-sidecar-"))
                    .unwrap_or(false)
            })
    })
}

#[cfg(not(debug_assertions))]
fn build_command<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(String, Vec<String>), String> {
    let p = find_release_binary(app).ok_or_else(|| {
        "бинарник sidecar не найден в bundle (ожидался файл \
         raw-renamer-sidecar-<target-triple> в каталогах binaries) — \
         пересоберите проект скриптом сборки"
            .to_string()
    })?;
    Ok((
        p.to_string_lossy().into_owned(),
        vec![
            "--port".into(),
            "0".into(),
            "--watchdog".into(),
            "8".into(),
        ],
    ))
}

#[cfg(debug_assertions)]
fn build_command<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(String, Vec<String>), String> {
    let _ = app;
    Ok(dev_command())
}
