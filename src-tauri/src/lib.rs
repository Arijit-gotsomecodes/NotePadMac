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
fn exit_app(window: tauri::Window) {
    use tauri::Manager;
    let app = window.app_handle();
    let remaining: Vec<_> = app.webview_windows().into_iter().filter(|(k, _)| k != "tab-drag-ghost").collect();
    if remaining.len() <= 1 {
        app.exit(0);
    } else {
        let _ = window.destroy();
    }
}

/// Smoothly fades out the native NSWindow alpha (1 -> 0) over ~150ms,
/// then closes/destroys the window, giving a native-level exit animation.
#[tauri::command]
fn fade_close_window(window: tauri::Window) {
    use tauri::Manager;
    #[cfg(target_os = "macos")]
    {
        let app = window.app_handle().clone();
        let remaining_count = app.webview_windows().into_iter()
            .filter(|(k, _)| k != "tab-drag-ghost")
            .count();
        let is_last = remaining_count <= 1;

        if let Ok(ns_window_ptr) = window.ns_window() {
            // Convert to usize before the closure so it is Send-safe
            let ns_win_addr = ns_window_ptr as usize;
            window.run_on_main_thread(move || {
                use objc2::msg_send;
                use objc2_app_kit::NSAnimationContext;

                unsafe {
                    let ns_win: *mut objc2::runtime::AnyObject = ns_win_addr as _;
                    if ns_win.is_null() { return; }

                    // Begin a 0.15s animation context
                    NSAnimationContext::beginGrouping();
                    let ctx = NSAnimationContext::currentContext();
                    ctx.setDuration(0.15);

                    // Animate window alpha to 0 via the animator proxy
                    let animator: *mut objc2::runtime::AnyObject = msg_send![ns_win, animator];
                    let _: () = msg_send![animator, setAlphaValue: 0.0_f64];

                    NSAnimationContext::endGrouping();

                    // Schedule actual close after animation finishes
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(160));
                        if is_last {
                            std::process::exit(0);
                        } else {
                            // Order out the window (hides it without process exit)
                            let ptr = ns_win_addr as *mut objc2::runtime::AnyObject;
                            let _: () = msg_send![ptr, orderOut: ptr];
                        }
                    });
                }
            }).ok();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        let app = window.app_handle();
        let remaining = app.webview_windows().into_iter()
            .filter(|(k, _)| k != "tab-drag-ghost")
            .count();
        if remaining <= 1 { app.exit(0); } else { let _ = window.destroy(); }
    }
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

use std::sync::Mutex;
use std::collections::HashMap;

static PENDING_OPEN_FILES: Mutex<Vec<String>> = Mutex::new(Vec::new());
static PENDING_WINDOW_TABS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

#[tauri::command]
fn get_cli_file() -> Option<String> {
    // 1. Check if any file was opened via macOS RunEvent::Opened
    if let Ok(mut pending) = PENDING_OPEN_FILES.lock() {
        if let Some(file) = pending.pop() {
            return Some(file);
        }
    }
    // 2. Check CLI args
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

#[tauri::command]
fn detach_tab(app: tauri::AppHandle, tab_json: String, x: Option<f64>, y: Option<f64>) -> Result<(), String> {
    let win_id = format!("win-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    
    if let Ok(mut map_lock) = PENDING_WINDOW_TABS.lock() {
        if map_lock.is_none() {
            *map_lock = Some(HashMap::new());
        }
        if let Some(ref mut map) = *map_lock {
            map.insert(win_id.clone(), tab_json);
        }
    }

    let mut builder = tauri::WebviewWindowBuilder::new(&app, &win_id, tauri::WebviewUrl::App("index.html".into()))
        .title("Notepad")
        .inner_size(900.0, 650.0)
        .min_inner_size(400.0, 300.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .transparent(true)
        .visible(false);

    if let (Some(px), Some(py)) = (x, y) {
        builder = builder.position(px - 150.0, py - 20.0);
    }

    let win = builder
        .build()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let w = win.as_ref().window().clone();
        win.run_on_main_thread(move || {
            adjust_traffic_lights(&w);
        }).ok();
    }
    
    Ok(())
}

#[tauri::command]
fn get_window_tab(window: tauri::Window) -> Option<String> {
    let label = window.label();
    if let Ok(mut map_lock) = PENDING_WINDOW_TABS.lock() {
        if let Some(ref mut map) = *map_lock {
            return map.remove(label);
        }
    }
    None
}

use std::sync::atomic::{AtomicU64, Ordering};
static CURRENT_GHOST_WIDTH: AtomicU64 = AtomicU64::new(175u64);

fn get_ghost_width() -> f64 {
    f64::from_bits(CURRENT_GHOST_WIDTH.load(Ordering::Relaxed))
}

fn set_ghost_width(w: f64) {
    CURRENT_GHOST_WIDTH.store(w.to_bits(), Ordering::Relaxed);
}

#[tauri::command]
fn show_drag_ghost(app: tauri::AppHandle, title: String, x: f64, y: f64, width: Option<f64>) -> Result<(), String> {
    use tauri::{Manager, Emitter, Listener};
    let tab_width = width.unwrap_or(175.0);
    set_ghost_width(tab_width);
    let win_w = (tab_width + 40.0).max(220.0);
    let win_h = 48.0;
    let pos_x = x - tab_width / 2.0;
    let pos_y = y - 18.0;

    if let Some(ghost) = app.get_webview_window("tab-drag-ghost") {
        let was_visible = ghost.is_visible().unwrap_or(true);
        ghost.set_size(tauri::LogicalSize::new(win_w, win_h)).ok();
        ghost.set_position(tauri::LogicalPosition::new(pos_x, pos_y)).ok();
        ghost.show().ok();
        ghost.emit("update-ghost-title", title).ok();
        ghost.emit("update-ghost-width", tab_width).ok();
        // Trigger pop-in animation on the frontend only when re-appearing after being hidden
        if !was_visible {
            ghost.emit("ghost-show", {}).ok();
        }
    } else {
        let ghost = tauri::WebviewWindowBuilder::new(&app, "tab-drag-ghost", tauri::WebviewUrl::App("index.html?ghost=true".into()))
            .title("Ghost")
            .inner_size(win_w, win_h)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .shadow(false)
            .skip_taskbar(true)
            .position(pos_x, pos_y)
            .build()
            .map_err(|e| e.to_string())?;

        let app_handle = app.clone();
        let t_clone = title.clone();
        ghost.once("ghost-ready", move |_| {
            if let Some(g) = app_handle.get_webview_window("tab-drag-ghost") {
                g.emit("update-ghost-title", t_clone).ok();
                g.emit("update-ghost-width", tab_width).ok();
            }
        });

        #[cfg(target_os = "macos")]
        {
            use objc2::msg_send;
            if let Ok(ns_ptr) = ghost.as_ref().window().ns_window() {
                let ns_win: *mut objc2::runtime::AnyObject = ns_ptr as _;
                unsafe {
                    let _: () = msg_send![ns_win, setIgnoresMouseEvents: true];
                    let _: () = msg_send![ns_win, setHasShadow: false];
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn move_drag_ghost(app: tauri::AppHandle, x: f64, y: f64) {
    use tauri::Manager;
    let tab_width = get_ghost_width();
    let pos_x = x - tab_width / 2.0;
    let pos_y = y - 18.0;
    if let Some(ghost) = app.get_webview_window("tab-drag-ghost") {
        ghost.set_position(tauri::LogicalPosition::new(pos_x, pos_y)).ok();
    }
}

#[tauri::command]
fn hide_drag_ghost(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(ghost) = app.get_webview_window("tab-drag-ghost") {
        ghost.hide().ok();
    }
}

#[derive(serde::Serialize, Clone)]
struct DragHoverTarget {
    target_window: String,
    local_x: f64,
}

#[tauri::command]
fn check_drag_hover(app: tauri::AppHandle, source_window: String, screen_x: f64, screen_y: f64) -> Option<DragHoverTarget> {
    use tauri::Manager;
    for (label, win) in app.webview_windows() {
        if label == source_window || label == "tab-drag-ghost" {
            continue;
        }
        if let (Ok(pos), Ok(size), Ok(scale)) = (win.outer_position(), win.outer_size(), win.scale_factor()) {
            let logical_x = (pos.x as f64) / scale;
            let logical_y = (pos.y as f64) / scale;
            let logical_w = (size.width as f64) / scale;

            if screen_x >= logical_x && screen_x <= (logical_x + logical_w) && screen_y >= (logical_y - 15.0) && screen_y <= (logical_y + 65.0) {
                let local_x = screen_x - logical_x;
                return Some(DragHoverTarget {
                    target_window: label,
                    local_x,
                });
            }
        }
    }
    None
}

#[tauri::command]
fn finish_tab_drag(
    app: tauri::AppHandle,
    source_window: String,
    tab_json: String,
    screen_x: f64,
    screen_y: f64,
    allow_detach: bool,
) -> Result<String, String> {
    use tauri::{Manager, Emitter};

    if let Some(ghost) = app.get_webview_window("tab-drag-ghost") {
        ghost.hide().ok();
    }

    // Check if dropped into another window's tab bar
    for (label, win) in app.webview_windows() {
        if label == source_window || label == "tab-drag-ghost" {
            continue;
        }
        if let (Ok(pos), Ok(size), Ok(scale)) = (win.outer_position(), win.outer_size(), win.scale_factor()) {
            let logical_x = (pos.x as f64) / scale;
            let logical_y = (pos.y as f64) / scale;
            let logical_w = (size.width as f64) / scale;

            if screen_x >= logical_x && screen_x <= (logical_x + logical_w) && screen_y >= (logical_y - 15.0) && screen_y <= (logical_y + 90.0) {
                let local_x = screen_x - logical_x;
                // Send both tab data and cursor position so the target window
                // can calculate the insert index without relying on crossDropIndexRef
                let payload = serde_json::json!({
                    "tab_json": tab_json,
                    "local_x": local_x,
                });
                win.emit("import-tab", payload).ok();
                return Ok("merged".to_string());
            }
        }
    }

    // If allowed to detach (more than 1 tab), spawn new window
    if allow_detach {
        detach_tab(app, tab_json, Some(screen_x), Some(screen_y))?;
        return Ok("detached".to_string());
    }

    Ok("stay".to_string())
}

#[tauri::command]
fn try_merge_window(
    app: tauri::AppHandle,
    source_window: String,
    tab_json: String,
    screen_x: Option<f64>,
    screen_y: Option<f64>,
) -> Result<bool, String> {
    use tauri::{Manager, Emitter};

    let src_win = match app.get_webview_window(&source_window) {
        Some(w) => w,
        None => return Ok(false),
    };

    let (src_pos, src_size, src_scale) = match (src_win.outer_position(), src_win.outer_size(), src_win.scale_factor()) {
        (Ok(p), Ok(s), Ok(sc)) => (p, s, sc),
        _ => return Ok(false),
    };

    let src_x = (src_pos.x as f64) / src_scale;
    let src_y = (src_pos.y as f64) / src_scale;
    let src_w = (src_size.width as f64) / src_scale;

    for (label, win) in app.webview_windows() {
        if label == source_window || label == "tab-drag-ghost" {
            continue;
        }
        if let (Ok(pos), Ok(size), Ok(scale)) = (win.outer_position(), win.outer_size(), win.scale_factor()) {
            let target_x = (pos.x as f64) / scale;
            let target_y = (pos.y as f64) / scale;
            let target_w = (size.width as f64) / scale;

            let cursor_matched = if let (Some(sx), Some(sy)) = (screen_x, screen_y) {
                sx >= (target_x - 10.0) && sx <= (target_x + target_w + 10.0) && sy >= (target_y - 20.0) && sy <= (target_y + 80.0)
            } else {
                false
            };

            let overlap_matched = src_x >= (target_x - src_w * 0.85) && src_x <= (target_x + target_w + 50.0)
                && src_y >= (target_y - 35.0) && src_y <= (target_y + 85.0);

            if cursor_matched || overlap_matched {
                let local_x = if let Some(sx) = screen_x {
                    sx - target_x
                } else {
                    src_x - target_x
                };
                let payload = serde_json::json!({
                    "tab_json": tab_json,
                    "local_x": local_x,
                });
                win.emit("import-tab", payload).ok();
                app.emit("highlight-drop-target", serde_json::json!({ "target_window": null })).ok();
                src_win.destroy().ok();
                return Ok(true);
            }
        }
    }

    app.emit("highlight-drop-target", serde_json::json!({ "target_window": null })).ok();
    Ok(false)
}

#[tauri::command]
fn merge_all_windows() {
    #[cfg(target_os = "macos")]
    {
        use objc2::msg_send;
        unsafe {
            let ns_app: *mut objc2::runtime::AnyObject = msg_send![objc2::class!(NSApplication), sharedApplication];
            if !ns_app.is_null() {
                let key_win: *mut objc2::runtime::AnyObject = msg_send![ns_app, keyWindow];
                if !key_win.is_null() {
                    let nil_obj: *mut objc2::runtime::AnyObject = std::ptr::null_mut();
                    let _: () = msg_send![key_win, mergeAllWindows: nil_obj];
                }
            }
        }
    }
}

#[tauri::command]
fn get_window_count(app: tauri::AppHandle) -> usize {
    use tauri::Manager;
    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| label != "tab-drag-ghost")
        .count()
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
            fade_close_window,
            get_cli_file,
            detach_tab,
            get_window_tab,
            show_drag_ghost,
            move_drag_ghost,
            hide_drag_ghost,
            check_drag_hover,
            finish_tab_drag,
            try_merge_window,
            merge_all_windows,
            get_window_count,
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
                use tauri::Manager;
                let app = window.app_handle();
                let remaining: Vec<_> = app.webview_windows().into_iter().filter(|(k, _)| k != "tab-drag-ghost").collect();
                if remaining.is_empty() {
                    app.exit(0);
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
                        let path_string = path_str.to_string();
                        if let Ok(mut pending) = PENDING_OPEN_FILES.lock() {
                            pending.push(path_string.clone());
                        }
                        let _ = app_handle.emit("open-file-path", path_string);
                    }
                }
            }
        }
    });
}
