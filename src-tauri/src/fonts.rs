/// Font families installed on this machine, for the Settings font picker.
///
/// Skips the dot-prefixed families (".SF NS", ".LastResort" and friends) that
/// CoreText reports but which are private to the system and not usable here.
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_core_foundation::{CFArray, CFRetained, CFString};
        use objc2_core_text::CTFontManagerCopyAvailableFontFamilyNames;

        let names: CFRetained<CFArray> = unsafe { CTFontManagerCopyAvailableFontFamilyNames() };
        let count = names.count();
        let mut families = Vec::with_capacity(count as usize);

        for i in 0..count {
            let value = unsafe { names.value_at_index(i) };
            if value.is_null() {
                continue;
            }
            let name = unsafe { &*(value as *const CFString) };
            let name = name.to_string();
            if !name.starts_with('.') {
                families.push(name);
            }
        }

        families.sort_by_key(|f| f.to_lowercase());
        families.dedup();
        families
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn lists_real_font_families() {
        let families = super::list_system_fonts();
        assert!(!families.is_empty(), "expected some installed fonts");
        assert!(
            families.iter().any(|f| f == "Helvetica"),
            "expected a system font family, got: {:?}",
            &families[..families.len().min(10)]
        );
        assert!(
            families.iter().all(|f| !f.starts_with('.')),
            "private dot-prefixed families should be filtered out"
        );
        eprintln!("found {} families, e.g. {:?}", families.len(), &families[..5]);
    }
}
