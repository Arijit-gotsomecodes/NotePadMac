mod file_ops;
mod models;
mod session;

use file_ops::{read_file, write_file};
use session::{load_session, save_session};
use std::sync::Mutex;
use tauri::Emitter;

/// Files macOS asked us to open before the webview was ready to listen. On a
/// cold launch (double-clicking a .txt in Finder) the Opened event arrives well
/// before the frontend mounts, so the paths are parked here and collected by
/// `take_pending_files` once it starts.
static PENDING_OPEN_FILES: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[tauri::command]
fn take_pending_files() -> Vec<String> {
    PENDING_OPEN_FILES
        .lock()
        .map(|mut pending| std::mem::take(&mut *pending))
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            save_session,
            load_session,
            take_pending_files,
        ])
        // build + run, rather than .run(), so we can observe RunEvent::Opened.
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // Fired when the app is asked to open files: Finder double-click,
        // "Open With", or `open -a NotepadMac file.txt`.
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                let Ok(path) = url.to_file_path() else { continue };
                let Some(path) = path.to_str() else { continue };
                let path = path.to_string();

                if let Ok(mut pending) = PENDING_OPEN_FILES.lock() {
                    pending.push(path.clone());
                }
                // Also emit live, for when the app is already running.
                let _ = app_handle.emit("open-file-path", path);
            }
        }
    });
}
