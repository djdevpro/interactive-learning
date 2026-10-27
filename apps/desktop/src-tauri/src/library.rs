//! The library: a folder on disk with one folder per site, one per theme inside it, and one per
//! tutorial inside a theme. A tutorial folder is a standard guide, `guide.json` and `assets/`, so
//! every Interactive Learning tool opens it. The studio reaches its files through the `library`
//! scheme, which answers the studio view only.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{
    http::{Request, Response, StatusCode},
    ipc::{InvokeBody, Request as InvokeRequest},
    AppHandle, Manager, State,
};

use crate::STUDIO;

/// Folder of the library, `Documents/Interactive Learning` unless a self-test chose another.
pub struct Root(pub Mutex<PathBuf>);

const SITE_FILE: &str = "site.json";
const THEME_FILE: &str = "theme.json";
const GUIDE_FILE: &str = "guide.json";
/// What the studio remembers about a tutorial beside the guide: when it was last published.
const STUDIO_FILE: &str = ".studio.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    id: String,
    name: String,
    address: String,
    publish_to: Option<String>,
    themes: Vec<Theme>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    id: String,
    name: String,
    color: String,
    position: i64,
    tutorials: Vec<Tutorial>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tutorial {
    /// `site/theme/tutorial`, the address of the tutorial in the library.
    path: String,
    title: String,
    steps: usize,
    duration_ms: u64,
    updated_at: String,
    published_at: Option<String>,
    /// First screenshot, relative to the tutorial folder, and the part of it the first step shows.
    cover: Option<String>,
    cover_viewport: Option<Value>,
}

pub fn root(app: &AppHandle) -> PathBuf {
    app.state::<Root>()
        .0
        .lock()
        .map(|root| root.clone())
        .unwrap_or_default()
}

pub fn default_root(app: &AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("Interactive Learning")
}

/// A path of the library from its parts, refused when it would leave the library.
fn inside(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("This place is outside the library.".to_string());
    }
    Ok(root.join(relative))
}

fn read_json(path: &Path) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(Value::Null)
}

/// Writes next to the file first, then moves it in place, so a crash never leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    write_atomic(path, format!("{text}\n").as_bytes())
}

fn folders(path: &Path) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = std::fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| {
                    path.is_dir()
                        && !path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .is_some_and(|name| name.starts_with('.'))
                })
                .collect()
        })
        .unwrap_or_default();
    found.sort();
    found
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string()
}

fn text(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_default().to_string()
}

fn tutorial(site: &str, theme: &str, folder: &Path) -> Option<Tutorial> {
    let guide = read_json(&folder.join(GUIDE_FILE));
    if guide.is_null() {
        return None;
    }
    let steps = guide["steps"].as_array().cloned().unwrap_or_default();
    let first = steps.first();
    let cover = first.and_then(|step| {
        let asset = step["assetId"].as_str()?;
        guide["assets"]
            .as_array()?
            .iter()
            .find(|candidate| candidate["id"] == asset)
            .and_then(|asset| asset["src"].as_str())
            .filter(|src| !src.starts_with("data:"))
            .map(str::to_string)
    });
    Some(Tutorial {
        path: format!("{site}/{theme}/{}", name_of(folder)),
        title: text(&guide, "title"),
        steps: steps.len(),
        duration_ms: steps
            .iter()
            .map(|step| step["durationMs"].as_u64().unwrap_or(0))
            .sum(),
        updated_at: text(&guide, "updatedAt"),
        published_at: read_json(&folder.join(STUDIO_FILE))["publishedAt"]
            .as_str()
            .map(str::to_string),
        cover,
        cover_viewport: first.and_then(|step| step.get("viewport").cloned()),
    })
}

#[tauri::command]
pub fn library_root(root: State<'_, Root>) -> Result<String, String> {
    let root = root.0.lock().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&*root).map_err(|error| error.to_string())?;
    Ok(root.to_string_lossy().to_string())
}

/// Every site, theme and tutorial of the library, read from the folders as they are now.
#[tauri::command]
pub fn library_scan(app: AppHandle) -> Result<Vec<Site>, String> {
    let root = root(&app);
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(folders(&root)
        .into_iter()
        .map(|site_folder| {
            let id = name_of(&site_folder);
            let site = read_json(&site_folder.join(SITE_FILE));
            let mut themes: Vec<Theme> = folders(&site_folder)
                .into_iter()
                .map(|theme_folder| {
                    let theme_id = name_of(&theme_folder);
                    let theme = read_json(&theme_folder.join(THEME_FILE));
                    let mut tutorials: Vec<Tutorial> = folders(&theme_folder)
                        .iter()
                        .filter_map(|folder| tutorial(&id, &theme_id, folder))
                        .collect();
                    tutorials.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
                    Theme {
                        name: theme["name"].as_str().unwrap_or(&theme_id).to_string(),
                        color: theme["color"].as_str().unwrap_or("slate").to_string(),
                        position: theme["position"].as_i64().unwrap_or(0),
                        id: theme_id,
                        tutorials,
                    }
                })
                .collect();
            themes.sort_by(|a, b| a.position.cmp(&b.position).then(a.name.cmp(&b.name)));
            Site {
                name: site["name"].as_str().unwrap_or(&id).to_string(),
                address: text(&site, "address"),
                publish_to: site["publishTo"].as_str().map(str::to_string),
                id,
                themes,
            }
        })
        .collect())
}

/// A folder name a person can read in the file explorer, with nothing Windows refuses.
fn folder_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| {
            if character.is_control() || r#"<>:"/\|?*"#.contains(character) {
                '-'
            } else {
                character
            }
        })
        .collect();
    let cleaned = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['.', ' '])
        .to_string();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3",
    ];
    match cleaned.as_str() {
        "" => "Untitled".to_string(),
        name if reserved.contains(&name.to_uppercase().as_str()) => format!("{name}-1"),
        _ => cleaned.chars().take(80).collect(),
    }
}

/// The name of a tutorial folder, also the last part of its address once published.
fn slug(title: &str) -> String {
    let mut out = String::new();
    for character in title.to_lowercase().chars() {
        let plain = match character {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => "a",
            'ç' => "c",
            'è' | 'é' | 'ê' | 'ë' => "e",
            'ì' | 'í' | 'î' | 'ï' => "i",
            'ñ' => "n",
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' => "o",
            'ù' | 'ú' | 'û' | 'ü' => "u",
            'ý' | 'ÿ' => "y",
            'œ' => "oe",
            'æ' => "ae",
            character if character.is_ascii_alphanumeric() => {
                out.push(character);
                continue;
            }
            _ => "-",
        };
        out.push_str(plain);
    }
    let parts: Vec<&str> = out.split('-').filter(|part| !part.is_empty()).collect();
    let joined = parts.join("-");
    if joined.is_empty() {
        "tutorial".to_string()
    } else {
        joined.chars().take(60).collect()
    }
}

/// `name`, or `name 2`, `name 3`... when a folder of that name already exists.
fn unique(parent: &Path, name: &str, separator: &str) -> String {
    let mut candidate = name.to_string();
    let mut count = 2;
    while parent.join(&candidate).exists() {
        candidate = format!("{name}{separator}{count}");
        count += 1;
    }
    candidate
}

/// Creates a site, or updates one. A new name renames its folder too.
#[tauri::command]
pub fn site_save(
    app: AppHandle,
    id: Option<String>,
    name: String,
    address: String,
    publish_to: Option<String>,
) -> Result<String, String> {
    let root = root(&app);
    let wanted = folder_name(&name);
    let folder = match &id {
        Some(id) => {
            let current = inside(&root, id)?;
            if *id == wanted {
                current
            } else {
                let renamed = root.join(unique(&root, &wanted, " "));
                std::fs::rename(&current, &renamed).map_err(|error| error.to_string())?;
                renamed
            }
        }
        None => {
            let folder = root.join(unique(&root, &wanted, " "));
            std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
            folder
        }
    };
    let mut site = read_json(&folder.join(SITE_FILE));
    if site.is_null() {
        site = json!({ "createdAt": now() });
    }
    site["name"] = json!(name.trim());
    site["address"] = json!(address.trim());
    site["publishTo"] = json!(publish_to);
    write_json(&folder.join(SITE_FILE), &site)?;
    Ok(name_of(&folder))
}

/// Creates a theme in a site, or updates one. A new name renames its folder too.
#[tauri::command]
pub fn theme_save(
    app: AppHandle,
    site: String,
    id: Option<String>,
    name: String,
    color: String,
) -> Result<String, String> {
    let parent = inside(&root(&app), &site)?;
    let wanted = folder_name(&name);
    let position = folders(&parent).len() as i64;
    let folder = match &id {
        Some(id) => {
            let current = inside(&parent, id)?;
            if *id == wanted {
                current
            } else {
                let renamed = parent.join(unique(&parent, &wanted, " "));
                std::fs::rename(&current, &renamed).map_err(|error| error.to_string())?;
                renamed
            }
        }
        None => {
            let folder = parent.join(unique(&parent, &wanted, " "));
            std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
            folder
        }
    };
    let mut theme = read_json(&folder.join(THEME_FILE));
    if theme.is_null() {
        theme = json!({ "position": position });
    }
    theme["name"] = json!(name.trim());
    theme["color"] = json!(color);
    write_json(&folder.join(THEME_FILE), &theme)?;
    Ok(name_of(&folder))
}

/// A new tutorial folder in a theme, named after its title, holding the guide given.
#[tauri::command]
pub fn tutorial_create(
    app: AppHandle,
    site: String,
    theme: String,
    title: String,
    guide: String,
) -> Result<String, String> {
    let parent = inside(&root(&app), &format!("{site}/{theme}"))?;
    let name = unique(&parent, &slug(&title), "-");
    let folder = parent.join(&name);
    std::fs::create_dir_all(folder.join("assets")).map_err(|error| error.to_string())?;
    write_atomic(&folder.join(GUIDE_FILE), guide.as_bytes())?;
    Ok(format!("{site}/{theme}/{name}"))
}

#[tauri::command]
pub fn tutorial_read(app: AppHandle, path: String) -> Result<String, String> {
    let file = inside(&root(&app), &path)?.join(GUIDE_FILE);
    std::fs::read_to_string(&file).map_err(|_| "This tutorial cannot be read.".to_string())
}

#[tauri::command]
pub fn tutorial_write(app: AppHandle, path: String, guide: String) -> Result<(), String> {
    let folder = inside(&root(&app), &path)?;
    if !folder.is_dir() {
        return Err("This tutorial is no longer in the library.".to_string());
    }
    write_atomic(&folder.join(GUIDE_FILE), guide.as_bytes())
}

/// Writes one file of a tutorial, such as an imported image. The body is the file; the tutorial
/// and the name inside it come in headers, percent-encoded.
#[tauri::command]
pub fn tutorial_file(app: AppHandle, request: InvokeRequest<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The file content is missing.".to_string());
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(crate::percent_decode)
            .ok_or_else(|| format!("{name} is missing."))?
    };
    let folder = inside(&root(&app), &header("x-tutorial")?)?;
    let file = inside(&folder, &header("x-name")?)?;
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    write_atomic(&file, bytes)
}

/// Moves a tutorial to another theme, of the same site or another one.
#[tauri::command]
pub fn tutorial_move(
    app: AppHandle,
    path: String,
    site: String,
    theme: String,
) -> Result<String, String> {
    let root = root(&app);
    let current = inside(&root, &path)?;
    let parent = inside(&root, &format!("{site}/{theme}"))?;
    let name = unique(&parent, &name_of(&current), "-");
    std::fs::rename(&current, parent.join(&name)).map_err(|error| error.to_string())?;
    Ok(format!("{site}/{theme}/{name}"))
}

/// A copy of a tutorial beside it, not yet published. The studio then gives it its own title.
#[tauri::command]
pub fn tutorial_duplicate(app: AppHandle, path: String) -> Result<String, String> {
    let source = inside(&root(&app), &path)?;
    let parent = source.parent().ok_or("This tutorial has no theme.")?;
    let name = unique(parent, &format!("{}-copy", name_of(&source)), "-");
    copy_folder(&source, &parent.join(&name))?;
    let _ = std::fs::remove_file(parent.join(&name).join(STUDIO_FILE));
    let (site_and_theme, _) = path.rsplit_once('/').unwrap_or_default();
    Ok(format!("{site_and_theme}/{name}"))
}

fn copy_folder(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|error| error.to_string())?;
    for entry in std::fs::read_dir(from)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_folder(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

/// Removes the images that no step uses any more. `keep` names the ones still to protect, such
/// as the picture a recording holds before its next click.
#[tauri::command]
pub fn tutorial_prune(app: AppHandle, path: String, keep: Vec<String>) -> Result<usize, String> {
    let folder = inside(&root(&app), &path)?;
    let guide = read_json(&folder.join(GUIDE_FILE));
    let mut used: Vec<String> = guide["assets"]
        .as_array()
        .map(|assets| {
            assets
                .iter()
                .filter_map(|asset| asset["src"].as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    used.extend(keep);
    let mut removed = 0;
    if let Ok(entries) = std::fs::read_dir(folder.join("assets")) {
        for entry in entries.flatten() {
            let name = format!("assets/{}", entry.file_name().to_string_lossy());
            if !used.contains(&name) && std::fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

/// Copies the tutorial into the project folder its site publishes to, where the web application
/// serves it, then remembers when.
#[tauri::command]
pub fn tutorial_publish(app: AppHandle, path: String) -> Result<String, String> {
    let root = root(&app);
    let folder = inside(&root, &path)?;
    let site = path.split('/').next().unwrap_or_default();
    let target = read_json(&inside(&root, site)?.join(SITE_FILE))["publishTo"]
        .as_str()
        .map(PathBuf::from)
        .ok_or_else(|| "Choose where this site publishes first.".to_string())?;
    let guide = read_json(&folder.join(GUIDE_FILE));
    let destination = target.join(name_of(&folder));
    let staging = target.join(format!(".{}-publishing", name_of(&folder)));
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(staging.join("assets")).map_err(|error| error.to_string())?;
    std::fs::copy(folder.join(GUIDE_FILE), staging.join(GUIDE_FILE))
        .map_err(|error| error.to_string())?;
    for asset in guide["assets"].as_array().cloned().unwrap_or_default() {
        let Some(src) = asset["src"].as_str() else {
            continue;
        };
        let from = inside(&folder, src)?;
        if from.is_file() {
            std::fs::copy(&from, inside(&staging, src)?).map_err(|error| error.to_string())?;
        }
    }
    let _ = std::fs::remove_dir_all(&destination);
    std::fs::rename(&staging, &destination).map_err(|error| error.to_string())?;
    write_json(
        &folder.join(STUDIO_FILE),
        &json!({ "publishedAt": now(), "publishedTo": destination.to_string_lossy() }),
    )?;
    Ok(destination.to_string_lossy().to_string())
}

/// Writes the tutorial as one ZIP archive, `guide.json` and its images, the archive the browser
/// extension, the web studio and the command line open.
#[tauri::command]
pub fn tutorial_export(app: AppHandle, path: String, target: String) -> Result<(), String> {
    let folder = inside(&root(&app), &path)?;
    let guide = read_json(&folder.join(GUIDE_FILE));
    let mut files = vec![(
        GUIDE_FILE.to_string(),
        std::fs::read(folder.join(GUIDE_FILE)).map_err(|error| error.to_string())?,
    )];
    for asset in guide["assets"].as_array().cloned().unwrap_or_default() {
        let Some(src) = asset["src"]
            .as_str()
            .filter(|src| !src.starts_with("data:"))
        else {
            continue;
        };
        let bytes = std::fs::read(inside(&folder, src)?)
            .map_err(|_| format!("The image {src} is missing."))?;
        files.push((src.to_string(), bytes));
    }
    write_atomic(Path::new(&target), &zip(&files))
}

/// A ZIP archive whose files are stored as they are: screenshots are already compressed.
fn zip(files: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut directory = Vec::new();
    for (name, data) in files {
        let offset = out.len() as u32;
        let crc = crc32(data);
        let size = data.len() as u32;
        // Version 2.0, names in UTF-8, stored, no date.
        let fields = |signature: u32, central: bool| {
            let mut header = signature.to_le_bytes().to_vec();
            if central {
                header.extend_from_slice(&20u16.to_le_bytes());
            }
            for value in [20u16, 0x0800, 0, 0, 0x21] {
                header.extend_from_slice(&value.to_le_bytes());
            }
            header.extend_from_slice(&crc.to_le_bytes());
            header.extend_from_slice(&size.to_le_bytes());
            header.extend_from_slice(&size.to_le_bytes());
            header.extend_from_slice(&(name.len() as u16).to_le_bytes());
            header.extend_from_slice(&0u16.to_le_bytes());
            header
        };
        out.extend(fields(0x0403_4b50, false));
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(data);
        directory.extend(fields(0x0201_4b50, true));
        // No comment, disk 0, no attributes, then where the file starts.
        directory.extend_from_slice(&[0; 10]);
        directory.extend_from_slice(&offset.to_le_bytes());
        directory.extend_from_slice(name.as_bytes());
    }
    let start = out.len() as u32;
    let count = files.len() as u16;
    out.extend_from_slice(&directory);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&(directory.len() as u32).to_le_bytes());
    out.extend_from_slice(&start.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= *byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                0xedb8_8320 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

/// Sends a site, a theme or a tutorial to the recycle bin, where it can still be restored.
#[tauri::command]
pub fn library_delete(app: AppHandle, path: String) -> Result<(), String> {
    let target = inside(&root(&app), &path)?;
    if path.is_empty() || !target.exists() {
        return Err("This item is no longer in the library.".to_string());
    }
    recycle(&target)
}

#[cfg(windows)]
fn recycle(path: &Path) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
        SHFILEOPSTRUCTW,
    };
    // The shell reads a list of paths, each ended by a zero, the list ended by one more.
    let mut from: Vec<u16> = path.as_os_str().to_string_lossy().encode_utf16().collect();
    from.extend([0, 0]);
    let mut operation = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: PCWSTR(from.as_ptr()),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI).0 as u16,
        ..Default::default()
    };
    let result = unsafe { SHFileOperationW(&mut operation) };
    if result == 0 && !operation.fAnyOperationsAborted.as_bool() {
        Ok(())
    } else {
        Err("Windows could not move it to the recycle bin.".to_string())
    }
}

#[cfg(not(windows))]
fn recycle(path: &Path) -> Result<(), String> {
    trash::delete(path).map_err(|_| "The system could not move it to the trash.".to_string())
}

/// Opens the file explorer on an item of the library, or on any folder the studio shows.
#[tauri::command]
pub fn library_reveal(app: AppHandle, path: String, absolute: Option<bool>) -> Result<(), String> {
    let target = if absolute.unwrap_or(false) {
        PathBuf::from(&path)
    } else {
        inside(&root(&app), &path)?
    };
    #[cfg(windows)]
    let opened = std::process::Command::new("explorer")
        .arg(format!("/select,{}", target.to_string_lossy()))
        .spawn();
    #[cfg(not(windows))]
    let opened = std::process::Command::new("xdg-open").arg(&target).spawn();
    opened.map(|_| ()).map_err(|error| error.to_string())
}

/// Saves a full-page screenshot in a tutorial under a name drawn from its content, so the same
/// screen captured twice is one file. Returns that name and the size of the image.
pub fn save_capture(
    app: &AppHandle,
    tutorial: &str,
    bytes: &[u8],
) -> Result<(String, u32, u32), String> {
    let (width, height) = webp_size(bytes).ok_or("The screenshot is not a WebP image.")?;
    let name = format!("assets/{:016x}.webp", fnv(bytes));
    let file = inside(&inside(&root(app), tutorial)?, &name)?;
    if !file.exists() {
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        write_atomic(&file, bytes)?;
    }
    Ok((name, width, height))
}

fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ *byte as u64).wrapping_mul(0x0100_0000_01b3)
    })
}

/// Width and height written in the header of a WebP file.
fn webp_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 30 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    match &bytes[12..16] {
        b"VP8 " if bytes[23..26] == [0x9d, 0x01, 0x2a] => Some((
            (u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3fff) as u32,
            (u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3fff) as u32,
        )),
        b"VP8L" if bytes[20] == 0x2f => {
            let bits = u32::from_le_bytes([bytes[21], bytes[22], bytes[23], bytes[24]]);
            Some(((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1))
        }
        b"VP8X" => Some((
            u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]) + 1,
            u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]) + 1,
        )),
        _ => None,
    }
}

fn now() -> String {
    // Seconds are enough to order publications; the studio formats the date itself.
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    iso_date(seconds)
}

/// An ISO 8601 date in UTC, from seconds since 1970.
fn iso_date(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let (hour, minute, second) = (seconds / 3600 % 24, seconds / 60 % 60, seconds % 60);
    // Civil date from days, after Howard Hinnant's algorithm.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// Serves the files of the library to the studio view, and to nothing else.
pub fn serve(app: &AppHandle, label: &str, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let refuse = |status: StatusCode| {
        Response::builder()
            .status(status)
            .body(Vec::new())
            .unwrap_or_default()
    };
    if label != STUDIO {
        return refuse(StatusCode::FORBIDDEN);
    }
    let path = crate::percent_decode(request.uri().path().trim_start_matches('/'));
    let Ok(file) = path.and_then(|path| inside(&root(app), &path)) else {
        return refuse(StatusCode::BAD_REQUEST);
    };
    let Ok(bytes) = std::fs::read(&file) else {
        return refuse(StatusCode::NOT_FOUND);
    };
    let kind = match file.extension().and_then(|extension| extension.to_str()) {
        Some("webp") => "image/webp",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    };
    Response::builder()
        .header("Content-Type", kind)
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-cache")
        .body(bytes)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_folders_and_slugs() {
        assert_eq!(
            folder_name("Billing: invoices / cards?"),
            "Billing- invoices - cards-"
        );
        assert_eq!(folder_name("  "), "Untitled");
        assert_eq!(folder_name("con"), "con-1");
        assert_eq!(
            slug("Créer une facture d'avoir"),
            "creer-une-facture-d-avoir"
        );
        assert_eq!(slug("!!!"), "tutorial");
    }

    #[test]
    fn refuses_paths_outside_the_library() {
        let root = Path::new("library");
        assert!(inside(root, "Site/Theme/tutorial").is_ok());
        assert!(inside(root, "../secrets").is_err());
        assert!(inside(root, "C:/Windows").is_err());
    }

    #[test]
    fn stores_files_in_a_zip() {
        let archive = zip(&[
            ("guide.json".to_string(), b"{}".to_vec()),
            ("assets/a.webp".to_string(), vec![1, 2, 3]),
        ]);
        assert_eq!(&archive[0..4], &0x0403_4b50u32.to_le_bytes());
        let end = archive.len() - 22;
        assert_eq!(&archive[end..end + 4], &0x0605_4b50u32.to_le_bytes());
        let start = u32::from_le_bytes(archive[end + 16..end + 20].try_into().unwrap()) as usize;
        assert_eq!(&archive[start..start + 4], &0x0201_4b50u32.to_le_bytes());
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
    }

    #[test]
    fn writes_utc_dates() {
        assert_eq!(iso_date(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_date(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(iso_date(1_793_129_244), "2026-10-27T19:27:24Z");
    }
}
