mod sidecar;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(sidecar::SidecarState::default())
        .setup(|app| {
            // Запуск Python sidecar: dev — python3 src-python/server.py,
            // release — бинарник из bundle externalBin (PyInstaller).
            sidecar::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::sidecar_url,
            sidecar::sidecar_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running RAW Renamer Studio");
}
