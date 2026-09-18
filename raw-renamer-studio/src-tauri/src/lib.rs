mod sidecar;

use tauri::Emitter;
use tauri::Manager;

/// v3.3 (D3): нативное меню macOS — «О программе», Настройки, Открыть папку,
/// Отменить, Справка, Выход. Все пункты — MenuItem с id (однотипный срез),
/// действия выполняются в on_menu_event: либо событие во фронтенд (menu://*),
/// либо нативный выход (handle.exit).
fn setup_native_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};

    let about = MenuItem::with_id(app, "about", "О программе", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Настройки…", true, Some("CmdOrCtrl+,"))?;
    let open = MenuItem::with_id(app, "open", "Открыть папку…", true, Some("CmdOrCtrl+O"))?;
    let undo = MenuItem::with_id(app, "undo", "Отменить переименование", true, Some("CmdOrCtrl+Z"))?;
    let help = MenuItem::with_id(app, "help", "Справка", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, Some("CmdOrCtrl+Q"))?;

    let menu = Menu::with_items(
        app,
        &[&about, &settings, &open, &undo, &help, &quit],
    )?;
    app.set_menu(menu)?;

    app.on_menu_event(|handle, event| match event.id().0.as_str() {
        "about" => {
            let _ = handle.emit("menu://about", ());
        }
        "settings" => {
            let _ = handle.emit("menu://settings", ());
        }
        "open" => {
            let _ = handle.emit("menu://open", ());
        }
        "undo" => {
            let _ = handle.emit("menu://undo", ());
        }
        "help" => {
            let _ = handle.emit("menu://help", ());
        }
        "quit" => {
            handle.exit(0);
        }
        _ => {}
    });
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(sidecar::SidecarState::default())
        .setup(|app| {
            // Запуск Python sidecar: dev — python3 src-python/server.py,
            // release — бинарник из bundle externalBin (PyInstaller).
            sidecar::spawn(app.handle().clone());

            // v3.3 (D3): нативное меню только для macOS (цель платформы).
            #[cfg(target_os = "macos")]
            setup_native_menu(app.handle()).ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::sidecar_url,
            sidecar::sidecar_status,
            sidecar::sidecar_error
        ])
        .build(tauri::generate_context!())
        .expect("error while running RAW Renamer Studio");

    // v3.3 (D1): при выходе из приложения гарантированно убиваем Python —
    // иначе остаётся зомби-процесс (Unix не убивает детей при смерти родителя).
    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let state = app_handle.state::<sidecar::SidecarState>();
            sidecar::kill_sidecar(&*state);
        }
    });
}
