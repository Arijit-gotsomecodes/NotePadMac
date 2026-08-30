mod file_ops;
mod models;
mod session;

use file_ops::{read_file, write_file};
use session::{load_session, save_session};

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

/// Fades in the native NSWindow from alpha=0 -> 1 over ~160ms via NSAnimationContext.
/// This ensures traffic lights (native NSWindow controls, outside the WebView) and
/// the WebView content animate in together, preventing traffic lights from floating
/// on a transparent background.
#[tauri::command]
fn show_window_with_fade(window: tauri::Window, reduce_motion: Option<bool>) {
    #[cfg(target_os = "macos")]
    {
        if reduce_motion.unwrap_or(false) {
            // Setup forces alphaValue=0 to prevent traffic light flash.
            // With reduce motion we skip the fade animation, but we must
            // restore alpha=1 before showing, otherwise the window stays invisible.
            if let Ok(ns_window_ptr) = window.ns_window() {
                unsafe {
                    use objc2::msg_send;
                    let ns_win: *mut objc2::runtime::AnyObject = ns_window_ptr as _;
                    if !ns_win.is_null() {
                        let _: () = msg_send![ns_win, setAlphaValue: 1.0_f64];
                    }
                }
            }
            let _ = window.show();
            return;
        }

        if let Ok(ns_window_ptr) = window.ns_window() {
            let ns_win_addr = ns_window_ptr as usize;
            window.run_on_main_thread(move || {
                use objc2::msg_send;
                use objc2_app_kit::NSAnimationContext;

                unsafe {
                    let ns_win: *mut objc2::runtime::AnyObject = ns_win_addr as _;
                    if ns_win.is_null() { return; }

                    // Set alpha to 0 first so the window is invisible when it appears
                    let _: () = msg_send![ns_win, setAlphaValue: 0.0_f64];

                    // Show the window (entire NSWindow, including traffic lights)
                    let nil: *mut objc2::runtime::AnyObject = std::ptr::null_mut();
                    let _: () = msg_send![ns_win, makeKeyAndOrderFront: nil];

                    // Animate the whole window alpha 0 -> 1 (~160ms)
                    NSAnimationContext::beginGrouping();
                    let ctx = NSAnimationContext::currentContext();
                    ctx.setDuration(0.16);
                    let animator: *mut objc2::runtime::AnyObject = msg_send![ns_win, animator];
                    let _: () = msg_send![animator, setAlphaValue: 1.0_f64];
                    NSAnimationContext::endGrouping();
                }
            }).ok();
        } else {
            let _ = window.show();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.show();
    }
}

/// Smoothly fades out the native NSWindow alpha (1 -> 0) over ~160ms,
/// then closes/destroys the window, giving a native-level exit animation.
#[tauri::command]
fn fade_close_window(window: tauri::Window, reduce_motion: Option<bool>) {
    use tauri::Manager;
    #[cfg(target_os = "macos")]
    {
        let app = window.app_handle().clone();
        let remaining_count = app.webview_windows().into_iter()
            .filter(|(k, _)| k != "tab-drag-ghost")
            .count();
        let is_last = remaining_count <= 1;

        if reduce_motion.unwrap_or(false) {
            if is_last {
                app.exit(0);
            } else {
                let _ = window.destroy();
            }
            return;
        }

        if let Ok(ns_window_ptr) = window.ns_window() {
            // Convert to usize before the closure so it is Send-safe
            let ns_win_addr = ns_window_ptr as usize;
            let win_clone = window.clone();
            let app_clone = app.clone();

            window.run_on_main_thread(move || {
                use objc2::msg_send;
                use objc2_app_kit::NSAnimationContext;

                unsafe {
                    let ns_win: *mut objc2::runtime::AnyObject = ns_win_addr as _;
                    if ns_win.is_null() { return; }

                    // Begin a 0.16s animation context
                    NSAnimationContext::beginGrouping();
                    let ctx = NSAnimationContext::currentContext();
                    ctx.setDuration(0.16);

                    // Animate window alpha to 0 via the animator proxy
                    let animator: *mut objc2::runtime::AnyObject = msg_send![ns_win, animator];
                    let _: () = msg_send![animator, setAlphaValue: 0.0_f64];

                    NSAnimationContext::endGrouping();

                    // Schedule actual close after animation finishes on the main thread
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(165));
                        let app_for_exit = app_clone.clone();
                        let _ = app_clone.run_on_main_thread(move || {
                            if is_last {
                                app_for_exit.exit(0);
                            } else {
                                let _ = win_clone.destroy();
                            }
                        });
                    });
                }
            }).ok();
        } else {
            if is_last {
                app.exit(0);
            } else {
                let _ = window.destroy();
            }
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

/// Helper to extract current macOS system accent color on the main thread
#[cfg(target_os = "macos")]
fn get_current_accent_color() -> Option<String> {
    use objc2_app_kit::{NSColor, NSColorSpace};
    use objc2_foundation::{NSString, NSUserDefaults};
    use objc2::msg_send;

    unsafe {
        let accent = NSColor::controlAccentColor();
        let srgb_space = NSColorSpace::sRGBColorSpace();
        let color_srgb: *mut objc2::runtime::AnyObject = msg_send![&*accent, colorUsingColorSpace: &*srgb_space];
        if !color_srgb.is_null() {
            let r: f64 = msg_send![color_srgb, redComponent];
            let g: f64 = msg_send![color_srgb, greenComponent];
            let b: f64 = msg_send![color_srgb, blueComponent];
            return Some(format!(
                "#{:02x}{:02x}{:02x}",
                (r * 255.0).round() as u8,
                (g * 255.0).round() as u8,
                (b * 255.0).round() as u8,
            ));
        }

        // Fallback to standard AppleAccentColor system defaults
        let defaults = NSUserDefaults::standardUserDefaults();
        let key = NSString::from_str("AppleAccentColor");
        let val: isize = msg_send![&*defaults, integerForKey: &*key];
        let hex = match val {
            0 => "#ff3b30", // Red
            1 => "#ff9500", // Orange
            2 => "#ffcc00", // Yellow
            3 => "#34c759", // Green
            4 => "#007aff", // Blue
            5 => "#af52de", // Purple
            6 => "#f74f9e", // Pink
            _ => "#007aff",
        };
        Some(hex.to_string())
    }
}

/// Returns the macOS system accent color as a hex string (e.g. "#f74f9e").
#[tauri::command]
fn get_accent_color(app: tauri::AppHandle) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        let _ = app.run_on_main_thread(move || {
            let _ = tx.send(get_current_accent_color());
        });
        rx.recv().unwrap_or(None)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        None
    }
}

/// 100% Event-driven distributed + local notification observer for system color changes (zero polling, zero CPU).
#[cfg(target_os = "macos")]
mod accent_observer {
    use std::ffi::c_void;
    use std::sync::Mutex;
    use tauri::{AppHandle, Emitter, Manager};

    type CFNotificationCenterRef = *mut c_void;
    type CFStringRef = *const c_void;
    type CFDictionaryRef = *const c_void;
    type CFNotificationCallback = extern "C" fn(
        center: CFNotificationCenterRef,
        observer: *mut c_void,
        name: CFStringRef,
        object: *const c_void,
        user_info: CFDictionaryRef,
    );

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFNotificationCenterGetDistributedCenter() -> CFNotificationCenterRef;
        fn CFNotificationCenterGetLocalCenter() -> CFNotificationCenterRef;
        fn CFNotificationCenterAddObserver(
            center: CFNotificationCenterRef,
            observer: *const c_void,
            callBack: CFNotificationCallback,
            name: CFStringRef,
            object: *const c_void,
            suspensionBehavior: isize,
        );
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            c_str: *const std::ffi::c_char,
            encoding: u32,
        ) -> CFStringRef;
        fn CFRelease(cf: *const c_void);
    }

    static GLOBAL_APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);

    extern "C" fn on_system_color_changed(
        _center: CFNotificationCenterRef,
        _observer: *mut c_void,
        _name: CFStringRef,
        _object: *const c_void,
        _user_info: CFDictionaryRef,
    ) {
        if let Ok(guard) = GLOBAL_APP_HANDLE.lock() {
            if let Some(app) = guard.as_ref() {
                let app_clone = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Some(hex) = super::get_current_accent_color() {
                        let _ = app_clone.emit("accent-color-changed", hex.clone());
                        for (_, win) in app_clone.webview_windows() {
                            let _ = win.emit("accent-color-changed", hex.clone());
                        }
                    }
                });
            }
        }
    }

    fn add_obs(center: CFNotificationCenterRef, notif_name: &str, behavior: isize) {
        unsafe {
            if !center.is_null() {
                let c_name = std::ffi::CString::new(notif_name).unwrap();
                let cf_name = CFStringCreateWithCString(std::ptr::null(), c_name.as_ptr(), 0x08000100 /* kCFStringEncodingUTF8 */);
                if !cf_name.is_null() {
                    CFNotificationCenterAddObserver(
                        center,
                        std::ptr::null(),
                        on_system_color_changed,
                        cf_name,
                        std::ptr::null(),
                        behavior,
                    );
                    CFRelease(cf_name);
                }
            }
        }
    }

    pub fn start_listening(app: AppHandle) {
        if let Ok(mut guard) = GLOBAL_APP_HANDLE.lock() {
            *guard = Some(app);
        }

        // 1. Distributed notifications (sent across applications when System Settings changes)
        let dist_center = unsafe { CFNotificationCenterGetDistributedCenter() };
        add_obs(dist_center, "AppleColorPreferencesChangedNotification", 4);
        add_obs(dist_center, "AppleAquaColorVariantChanged", 4);
        add_obs(dist_center, "AppleInterfaceThemeChangedNotification", 4);

        // 2. Local notifications (AppKit internal system color change broadcasts)
        let local_center = unsafe { CFNotificationCenterGetLocalCenter() };
        add_obs(local_center, "NSSystemColorsDidChangeNotification", 0);
        add_obs(local_center, "NSControlTintDidChangeNotification", 0);
    }
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
        // Force alpha=0 immediately so traffic lights stay invisible until fade-in
        if let Ok(ns_window_ptr) = win.ns_window() {
            unsafe {
                use objc2::msg_send;
                let ns_win: *mut objc2::runtime::AnyObject = ns_window_ptr as _;
                if !ns_win.is_null() {
                    let _: () = msg_send![ns_win, setAlphaValue: 0.0_f64];
                }
            }
        }
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
                let ns_win_addr = ns_ptr as usize;
                ghost.run_on_main_thread(move || {
                    let ns_win: *mut objc2::runtime::AnyObject = ns_win_addr as _;
                    if !ns_win.is_null() {
                        unsafe {
                            let _: () = msg_send![ns_win, setIgnoresMouseEvents: true];
                            let _: () = msg_send![ns_win, setHasShadow: false];
                        }
                    }
                }).ok();
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
                    "target_window": label,
                    "tab_json": tab_json,
                    "local_x": local_x,
                });
                app.emit("import-tab", payload).ok();
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
                    "target_window": label,
                    "tab_json": tab_json,
                    "local_x": local_x,
                });
                app.emit("import-tab", payload).ok();
                app.emit("highlight-drop-target", serde_json::json!({ "target_window": null })).ok();
                fade_close_window(src_win.as_ref().window().clone(), None);
                return Ok(true);
            }
        }
    }

    app.emit("highlight-drop-target", serde_json::json!({ "target_window": null })).ok();
    Ok(false)
}

#[tauri::command]
fn merge_all_windows(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
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
        });
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
            get_accent_color,
            show_window_with_fade,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(win) = app.get_webview_window("main") {
                    // Force NSWindow alpha=0 immediately so nothing is visible
                    // (including traffic lights) until show_window_with_fade animates it in.
                    if let Ok(ns_window_ptr) = win.ns_window() {
                        unsafe {
                            use objc2::msg_send;
                            let ns_win: *mut objc2::runtime::AnyObject = ns_window_ptr as _;
                            if !ns_win.is_null() {
                                let _: () = msg_send![ns_win, setAlphaValue: 0.0_f64];
                            }
                        }
                    }
                    let w = win.as_ref().window().clone();
                    win.run_on_main_thread(move || {
                        adjust_traffic_lights(&w);
                    }).ok();
                }

                // Watch for macOS accent color changes via NSDistributedNotificationCenter (100% event-driven, 0% CPU)
                accent_observer::start_listening(app.handle().clone());
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
