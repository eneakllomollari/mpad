use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

// NOTE: Window creation cannot be unit tested without a full Tauri runtime.
// The functions in this module require an AppHandle which is only available
// inside a running Tauri application. Integration tests would need a Tauri
// test harness (e.g., tauri::test::mock_builder).

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

/// Create a new editor window with a unique label.
/// If `file_path` is provided, it is passed via a URL query parameter so
/// the frontend can read it on mount (avoids the race condition of emitting
/// an event before the webview's JS listener is ready).
pub fn create_window(app: &AppHandle, file_path: Option<&str>) -> tauri::Result<()> {
    let id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("editor-{id}");

    let title = file_path
        .and_then(|p| {
            std::path::Path::new(p)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "mdview".into());

    // Encode the file path as a query parameter so the frontend can pick it up
    // synchronously on mount via window.location.search.
    let url = match file_path {
        Some(path) => {
            let encoded = urlencoding(path);
            WebviewUrl::App(format!("index.html?file={encoded}").into())
        }
        None => WebviewUrl::default(),
    };

    let _win = WebviewWindowBuilder::new(app, &label, url)
        .title(&title)
        .inner_size(900.0, 700.0)
        .min_inner_size(400.0, 300.0)
        .build()?;

    Ok(())
}

/// Percent-encode a file path for safe use in a URL query parameter.
fn urlencoding(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{b:02X}"));
            }
        }
    }
    result
}
