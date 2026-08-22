mod file_ops;
mod models;
mod session;

use file_ops::{read_file, write_file};
use session::{load_session, save_session};
use tauri::Manager;

#[tauri::command]
fn prompt_save_dialog(
    app: tauri::AppHandle,
    document_name: String,
) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            use objc2_app_kit::{NSAlert, NSAlertStyle};
            use objc2_foundation::NSString;

            let mtm = objc2::MainThreadMarker::new().expect("run_on_main_thread ran off the main thread");
            let alert = NSAlert::new(mtm);
            alert.setMessageText(&NSString::from_str(&format!(
                "Do you want to save the changes made to the document \u{201C}{}\u{201D}?",
                document_name
            )));
            alert.setInformativeText(&NSString::from_str(
                "Your changes will be lost if you don\u{2019}t save them.",
            ));
            alert.setAlertStyle(NSAlertStyle::Warning);
            alert.addButtonWithTitle(&NSString::from_str("Save"));
            alert.addButtonWithTitle(&NSString::from_str("Cancel"));
            alert.addButtonWithTitle(&NSString::from_str("Don\u{2019}t Save"));

            let response = alert.runModal();
            let res_str = match response {
                1000 => "save",
                1001 => "cancel",
                1002 => "dont_save",
                _ => "cancel",
            };
            let _ = tx.send(res_str.to_string());
        })
        .map_err(|e| e.to_string())?;

        rx.recv()
            .map_err(|_| "the alert closed unexpectedly".to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, document_name);
        Ok("cancel".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            save_session,
            load_session,
            prompt_save_dialog,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
