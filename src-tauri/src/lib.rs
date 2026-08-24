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

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg(target_os = "macos")]
fn adjust_traffic_lights(window: &tauri::Window) {
    if let Ok(ns_window_ptr) = window.ns_window() {
        use objc2::msg_send;
        use objc2_foundation::{NSPoint, NSRect};

        unsafe {
            let ns_win: *mut objc2::runtime::AnyObject = ns_window_ptr as _;
            if ns_win.is_null() {
                return;
            }

            // 0: Close, 1: Miniaturize, 2: Zoom
            for (i, btn_type) in [0usize, 1, 2].iter().enumerate() {
                let btn: *mut objc2::runtime::AnyObject = msg_send![ns_win, standardWindowButton: *btn_type];
                if !btn.is_null() {
                    let superview: *mut objc2::runtime::AnyObject = msg_send![btn, superview];
                    if !superview.is_null() {
                        let sv_frame: NSRect = msg_send![superview, frame];
                        let btn_frame: NSRect = msg_send![btn, frame];
                        let x = 16.0 + (i as f64) * 20.0;
                        let y = sv_frame.size.height - 15.0 - btn_frame.size.height;
                        let origin = NSPoint::new(x, y);
                        let _: () = msg_send![btn, setFrameOrigin: origin];
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn get_cli_file() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        for arg in &args[1..] {
            if !arg.starts_with('-') && std::path::Path::new(arg).exists() {
                return Some(arg.clone());
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
            exit_app,
            get_cli_file,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(win) = app.get_webview_window("main") {
                    let w = win.as_ref().window().clone();
                    win.run_on_main_thread(move || {
                        adjust_traffic_lights(&w);
                    }).ok();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            {
                if let tauri::WindowEvent::Resized(_) = event {
                    let win = window.clone();
                    window.run_on_main_thread(move || {
                        adjust_traffic_lights(&win);
                    }).ok();
                }
            }
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Opened { urls } = event {
            use tauri::Emitter;
            for url in urls {
                if let Ok(file_path) = url.to_file_path() {
                    if let Some(path_str) = file_path.to_str() {
                        let _ = app_handle.emit("open-file-path", path_str.to_string());
                    }
                }
            }
        }
    });
}
