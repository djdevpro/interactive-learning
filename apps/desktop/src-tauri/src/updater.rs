//! New versions of the studio, published as `desktop-v<version>` releases on GitHub: find the
//! newest, download its installer, check it, install it, start again. Settings › Updates shows it.
//!
//! - The releases of the repository are the source of truth. Other releases of the repository,
//!   such as those of the npm packages, are left aside by their tag. The list is asked with its
//!   ETag, so checking at each start costs nothing of the API quota when nothing changed.
//! - The notes of a release are its bullet points, shown before installing.
//! - Every file has its SHA-256, the `digest` GitHub gives each asset, or else `SHA256SUMS.txt`.
//!   A download that does not match it is thrown away.
//! - On Windows, the installer runs passively in update mode (`/P /R /UPDATE`): it closes the
//!   studio, replaces it and opens it again. An AppImage replaces itself. A `.deb` or `.rpm`
//!   opens in the software installer of the system, which asks for the password it needs.

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub const REPO: &str = "djdevpro/interactive-learning";
const TAG: &str = "desktop-v";
const USER_AGENT: &str = concat!("interactive-learning-studio/", env!("IL_STUDIO_VERSION"));

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub name: String,
    pub url: String,
    pub size: u64,
    pub sha256: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub name: String,
    /// The bullet points of its notes.
    pub notes: Vec<String>,
    pub published_at: String,
    pub page: String,
    /// The file this copy installs.
    pub asset: Option<Asset>,
    /// `SHA256SUMS.txt`, when the release has one.
    #[serde(skip)]
    pub sums: Option<String>,
}

/// How this copy of the studio installs a new version.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Install {
    /// Installed on Windows by its installer, which updates it.
    Installer,
    AppImage,
    /// A `.deb` or `.rpm` package, opened in the software installer of the system.
    Package,
    /// Built from the source code: it never replaces itself.
    Source,
    /// A copy put somewhere by hand: the creator downloads the new version.
    Manual,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub current: String,
    pub latest: Option<Release>,
    pub available: bool,
    pub install: Install,
    pub releases: String,
}

#[derive(Default)]
struct Cache {
    etag: Option<String>,
    releases: Vec<Value>,
    latest: Option<Release>,
    downloaded: Option<PathBuf>,
}

#[derive(Default)]
pub struct Updater(Mutex<Cache>);

// ---- versions ----------------------------------------------------------------------------------

/// `1.2.3`, `v1.2.3` or `1.2.3-beta.1`: the numbers and the pre-release, if any.
fn parse_version(text: &str) -> Option<([u64; 3], Option<String>)> {
    let text = text.trim().trim_start_matches('v');
    let (core, pre) = match text.split_once('-') {
        Some((core, pre)) => (core, Some(pre.to_string())),
        None => (text, None),
    };
    let mut numbers = core.split('.').map(|part| part.parse::<u64>().ok());
    Some((
        [
            numbers.next()??,
            numbers.next().flatten().unwrap_or(0),
            numbers.next().flatten().unwrap_or(0),
        ],
        pre,
    ))
}

/// Whether `remote` comes after `local`. A final version comes after its pre-releases.
pub fn newer(remote: &str, local: &str) -> bool {
    let (Some((a, pre_a)), Some((b, pre_b))) = (parse_version(remote), parse_version(local)) else {
        return false;
    };
    match a.cmp(&b) {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        std::cmp::Ordering::Equal => match (pre_a, pre_b) {
            (None, Some(_)) => true,
            (Some(x), Some(y)) => x > y,
            _ => false,
        },
    }
}

// ---- reading a release -------------------------------------------------------------------------

/// The bullet points of release notes, without links or authors.
pub fn notes_points(body: &str) -> Vec<String> {
    let clean = |line: &str| {
        let mut out = line.to_string();
        // [text](url) becomes text.
        while let (Some(open), Some(middle)) = (out.find('['), out.find("](")) {
            let Some(close) = out[middle..].find(')').map(|end| middle + end) else {
                break;
            };
            if open >= middle {
                break;
            }
            out = format!(
                "{}{}{}",
                &out[..open],
                &out[open + 1..middle],
                &out[close + 1..]
            );
        }
        if let Some(index) = out.find(" by @") {
            out.truncate(index);
        }
        out.trim().trim_end_matches('.').trim().to_string()
    };
    body.lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")))
        .map(clean)
        .filter(|line| !line.is_empty() && !line.contains("Full Changelog"))
        .collect()
}

/// The end of the name of the file this copy installs, as the release workflow names them.
fn asset_suffix(install: Install) -> &'static str {
    if cfg!(windows) {
        "-windows-x64-setup.exe"
    } else if install == Install::Package {
        if Path::new("/usr/bin/dpkg").exists() {
            ".deb"
        } else {
            ".rpm"
        }
    } else {
        ".AppImage"
    }
}

/// A release of the studio from the GitHub API; nothing for a draft, a pre-release or a release of
/// something else in the repository.
pub fn parse_release(value: &Value, install: Install) -> Option<Release> {
    if value["draft"].as_bool().unwrap_or(false) || value["prerelease"].as_bool().unwrap_or(false) {
        return None;
    }
    let tag = value["tag_name"].as_str()?;
    let version = tag.strip_prefix(TAG)?.to_string();
    parse_version(&version)?;
    let assets = value["assets"].as_array().cloned().unwrap_or_default();
    let suffix = asset_suffix(install);
    let asset = assets
        .iter()
        .find(|asset| {
            asset["name"]
                .as_str()
                .is_some_and(|name| name.ends_with(suffix))
        })
        .map(|asset| Asset {
            name: asset["name"].as_str().unwrap_or_default().to_string(),
            url: asset["browser_download_url"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            size: asset["size"].as_u64().unwrap_or(0),
            sha256: asset["digest"]
                .as_str()
                .and_then(|digest| digest.strip_prefix("sha256:"))
                .map(str::to_lowercase),
        });
    let sums = assets
        .iter()
        .find(|asset| asset["name"] == "SHA256SUMS.txt")
        .and_then(|asset| asset["browser_download_url"].as_str())
        .map(str::to_string);
    Some(Release {
        name: value["name"]
            .as_str()
            .filter(|name| !name.is_empty())
            .unwrap_or(tag)
            .to_string(),
        notes: notes_points(value["body"].as_str().unwrap_or_default()),
        published_at: value["published_at"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        page: value["html_url"].as_str().unwrap_or_default().to_string(),
        version,
        asset,
        sums,
    })
}

/// The newest release of the studio in a list from the API.
pub fn newest(releases: &[Value], install: Install) -> Option<Release> {
    releases
        .iter()
        .filter_map(|release| parse_release(release, install))
        .reduce(|best, release| {
            if newer(&release.version, &best.version) {
                release
            } else {
                best
            }
        })
}

/// The SHA-256 of a file in a `SHA256SUMS.txt` (`hash  name` lines).
fn sum_for(sums: &str, name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let (hash, file) = (parts.next()?, parts.next()?);
        (file.trim_start_matches('*') == name).then(|| hash.to_lowercase())
    })
}

// ---- this copy ---------------------------------------------------------------------------------

/// How this copy was installed, from where it runs.
pub fn install_kind() -> Install {
    let Ok(exe) = std::env::current_exe() else {
        return Install::Manual;
    };
    let key = exe.to_string_lossy().replace('\\', "/").to_lowercase();
    if key.contains("/target/debug/") || key.contains("/target/release/") {
        return Install::Source;
    }
    if cfg!(windows) {
        let installed = exe
            .parent()
            .is_some_and(|folder| folder.join("uninstall.exe").exists());
        return if installed {
            Install::Installer
        } else {
            Install::Manual
        };
    }
    if std::env::var_os("APPIMAGE").is_some() {
        Install::AppImage
    } else if key.starts_with("/usr/") {
        Install::Package
    } else {
        Install::Manual
    }
}

fn updates_folder() -> PathBuf {
    crate::home::file("updates")
}

/// At start, the files of an update already installed, or of a download that never ended, go.
/// So does the AppImage an update replaced. The installer that just opened the studio may still
/// hold its own file for a moment, so a locked file is tried again.
pub fn clean_up() {
    std::thread::spawn(|| {
        if let Some(image) = std::env::var_os("APPIMAGE") {
            let _ = std::fs::remove_file(format!("{}.old", PathBuf::from(image).display()));
        }
        let folder = updates_folder();
        for _ in 0..12 {
            if !folder.exists() || std::fs::remove_dir_all(&folder).is_ok() {
                return;
            }
            std::thread::sleep(Duration::from_secs(10));
        }
    });
}

// ---- network -----------------------------------------------------------------------------------

fn agent(timeout: Duration) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .http_status_as_error(false)
        .build()
        .into()
}

/// The releases of the repository as the API gives them, with the ETag of the answer.
type Releases = (Vec<Value>, Option<String>);

/// The releases of the repository, or `None` when they did not change since `etag`.
fn fetch(etag: Option<&str>) -> Result<Option<Releases>, String> {
    let mut request = agent(Duration::from_secs(20))
        .get(format!(
            "https://api.github.com/repos/{REPO}/releases?per_page=30"
        ))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json");
    if let Some(etag) = etag {
        request = request.header("If-None-Match", etag);
    }
    let mut response = request
        .call()
        .map_err(|error| format!("GitHub could not be reached: {error}"))?;
    let etag = response
        .headers()
        .get("etag")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    match response.status().as_u16() {
        304 => return Ok(None),
        200 => {}
        403 | 429 => return Err("GitHub limits checks for now. Try again in an hour.".to_string()),
        status => return Err(format!("GitHub answered {status}.")),
    }
    let text = response
        .body_mut()
        .with_config()
        .limit(16 * 1024 * 1024)
        .read_to_string()
        .map_err(|error| error.to_string())?;
    let releases: Vec<Value> =
        serde_json::from_str(&text).map_err(|error| format!("Unreadable answer: {error}"))?;
    Ok(Some((releases, etag)))
}

/// Downloads the file of a release into `folder`, checking its SHA-256 on the way.
fn download(
    release: &Release,
    folder: &Path,
    mut progress: impl FnMut(u64, u64),
) -> Result<PathBuf, String> {
    let asset = release
        .asset
        .as_ref()
        .ok_or("This version has no file for this system.")?;
    let expected = match (&asset.sha256, &release.sums) {
        (Some(hash), _) => Some(hash.clone()),
        (None, Some(url)) => {
            let mut response = agent(Duration::from_secs(30))
                .get(url)
                .header("User-Agent", USER_AGENT)
                .call()
                .map_err(|error| error.to_string())?;
            let sums = response
                .body_mut()
                .read_to_string()
                .map_err(|error| error.to_string())?;
            sum_for(&sums, &asset.name)
        }
        _ => None,
    }
    .ok_or("This version gives no SHA-256 for its file, so it is not installed.")?;
    std::fs::create_dir_all(folder).map_err(|error| error.to_string())?;
    let destination = folder.join(&asset.name);
    let part = folder.join(format!("{}.part", asset.name));
    let mut response = agent(Duration::from_secs(1800))
        .get(&asset.url)
        .header("User-Agent", USER_AGENT)
        .call()
        .map_err(|error| format!("The download failed: {error}"))?;
    if response.status().as_u16() != 200 {
        return Err(format!(
            "The download failed: GitHub answered {}.",
            response.status().as_u16()
        ));
    }
    let total = asset.size.max(1);
    let mut reader = response
        .body_mut()
        .with_config()
        .limit(2 * 1024 * 1024 * 1024)
        .reader();
    let mut file = std::fs::File::create(&part).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut done = 0u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("The download stopped: {error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| error.to_string())?;
        hasher.update(&buffer[..read]);
        done += read as u64;
        progress(done, total);
    }
    drop(file);
    if format!("{:x}", hasher.finalize()) != expected {
        let _ = std::fs::remove_file(&part);
        return Err(
            "The downloaded file does not match its SHA-256, so it is not installed.".to_string(),
        );
    }
    std::fs::rename(&part, &destination).map_err(|error| error.to_string())?;
    Ok(destination)
}

// ---- commands ----------------------------------------------------------------------------------

/// Looks for a newer version on GitHub.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Check, String> {
    let etag = app
        .state::<Updater>()
        .0
        .lock()
        .ok()
        .and_then(|cache| cache.etag.clone());
    let fetched = tauri::async_runtime::spawn_blocking(move || fetch(etag.as_deref()))
        .await
        .map_err(|error| error.to_string())??;
    let install = install_kind();
    let updater = app.state::<Updater>();
    let mut cache = updater.0.lock().map_err(|error| error.to_string())?;
    if let Some((releases, etag)) = fetched {
        cache.releases = releases;
        cache.etag = etag;
    }
    let latest = newest(&cache.releases, install);
    let current = app.package_info().version.to_string();
    let available = latest
        .as_ref()
        .is_some_and(|release| newer(&release.version, &current));
    cache.latest = latest.clone();
    Ok(Check {
        current,
        latest,
        available,
        install,
        releases: format!("https://github.com/{REPO}/releases"),
    })
}

#[derive(Clone, Serialize)]
struct Progress {
    done: u64,
    total: u64,
}

/// Downloads the newest version found by the last check, reporting `update-progress`.
#[tauri::command]
pub async fn update_download(app: AppHandle) -> Result<String, String> {
    let release = app
        .state::<Updater>()
        .0
        .lock()
        .ok()
        .and_then(|cache| cache.latest.clone())
        .ok_or("Check for updates first.")?;
    let reporter = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        let mut last = 0u64;
        download(&release, &updates_folder(), |done, total| {
            // One event every 256 KB at most: the bar follows without flooding the interface.
            if done - last >= 256 * 1024 || done == total {
                last = done;
                let _ =
                    reporter.emit_to(crate::STUDIO, "update-progress", Progress { done, total });
            }
        })
    })
    .await
    .map_err(|error| error.to_string())??;
    if let Ok(mut cache) = app.state::<Updater>().0.lock() {
        cache.downloaded = Some(path.clone());
    }
    Ok(path.to_string_lossy().to_string())
}

/// Installs the downloaded version. The studio closes to let it in, except for a package, which
/// opens in the software installer of the system.
#[tauri::command]
pub fn update_install(app: AppHandle, updater: State<'_, Updater>) -> Result<String, String> {
    let file = updater
        .0
        .lock()
        .ok()
        .and_then(|cache| cache.downloaded.clone())
        .filter(|file| file.is_file())
        .ok_or("Download the new version first.")?;
    match install_kind() {
        Install::Installer => {
            run_detached(&file, &["/P", "/R", "/UPDATE"])?;
            quit_soon(app);
            Ok("installer".to_string())
        }
        Install::AppImage => {
            let image = PathBuf::from(std::env::var_os("APPIMAGE").ok_or("No AppImage runs.")?);
            replace_appimage(&image, &file)?;
            run_detached(&image, &[])?;
            quit_soon(app);
            Ok("appimage".to_string())
        }
        Install::Package => {
            std::process::Command::new("xdg-open")
                .arg(&file)
                .spawn()
                .map_err(|error| error.to_string())?;
            Ok("package".to_string())
        }
        Install::Source | Install::Manual => Err(
            "This copy did not come from an installer. Download the new version from the releases page."
                .to_string(),
        ),
    }
}

fn run_detached(program: &Path, args: &[&str]) -> Result<(), String> {
    let mut command = std::process::Command::new(program);
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("The new version could not start: {error}"))
}

/// The studio closes once the answer reached the interface, so it can say what happens.
fn quit_soon(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        app.exit(0);
    });
}

/// Puts the new AppImage in place of the running one, which keeps running from memory.
fn replace_appimage(image: &Path, new: &Path) -> Result<(), String> {
    let old = PathBuf::from(format!("{}.old", image.display()));
    let _ = std::fs::remove_file(&old);
    std::fs::rename(image, &old).map_err(|error| format!("{}: {error}", image.display()))?;
    if let Err(error) = std::fs::copy(new, image) {
        let _ = std::fs::rename(&old, image);
        return Err(format!("The new version could not be installed: {error}"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(image, std::fs::Permissions::from_mode(0o755));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn release(tag: &str) -> Value {
        json!({
            "tag_name": tag, "name": format!("Interactive Learning Studio {}", tag.trim_start_matches(TAG)),
            "draft": false, "prerelease": false, "published_at": "2026-11-19T10:00:00Z",
            "html_url": format!("https://github.com/{REPO}/releases/tag/{tag}"),
            "body": "## What's new\n\n- Settings with updates and MCP\n- Agents drive the studio\n\n## Install\n\nOn Windows, run the installer.",
            "assets": [
                { "name": format!("interactive-learning-studio-{}-windows-x64-setup.exe", tag.trim_start_matches(TAG)), "size": 2_200_000,
                  "browser_download_url": "https://example.invalid/setup.exe", "digest": "sha256:ABCDEF" },
                { "name": format!("interactive-learning-studio-{}-linux-amd64.AppImage", tag.trim_start_matches(TAG)), "size": 82_000_000,
                  "browser_download_url": "https://example.invalid/studio.AppImage", "digest": "sha256:123456" }
            ]
        })
    }

    #[test]
    fn compares_versions() {
        assert!(newer("0.3.0", "0.2.9") && newer("v1.0.0", "0.9.9") && newer("0.2.10", "0.2.9"));
        assert!(!newer("0.3.0", "0.3.0") && !newer("0.2.1", "0.3.0"));
        assert!(newer("0.3.0", "0.3.0-beta.1") && !newer("0.3.0-beta.1", "0.3.0"));
        assert!(!newer("not-a-version", "0.1.0"));
    }

    #[test]
    fn reads_the_releases_of_the_studio_only() {
        let releases = vec![
            release("desktop-v0.2.1"),
            json!({ "tag_name": "@interactive-learning/player@9.0.0", "draft": false, "prerelease": false, "assets": [] }),
            release("desktop-v0.3.0"),
            json!({ "tag_name": "desktop-v9.9.9", "draft": true, "prerelease": false, "assets": [] }),
        ];
        let latest = newest(&releases, Install::Installer).unwrap();
        assert_eq!(latest.version, "0.3.0");
        assert_eq!(
            latest.notes,
            ["Settings with updates and MCP", "Agents drive the studio"]
        );
        let asset = latest.asset.unwrap();
        if cfg!(windows) {
            assert!(asset.name.ends_with("-windows-x64-setup.exe"));
            assert_eq!(asset.sha256.as_deref(), Some("abcdef"));
        } else {
            assert!(asset.name.ends_with(".AppImage"));
        }
    }

    #[test]
    fn cleans_notes_and_reads_sums() {
        let body = "## What's Changed\n* Real updater by @djdevpro in https://github.com/x/y/pull/3\n* [Docs](https://x.y) refreshed\n\n**Full Changelog**: https://x";
        assert_eq!(notes_points(body), ["Real updater", "Docs refreshed"]);
        let sums = "abc123  studio-0.3.0-windows-x64-setup.exe\nfff  other.zip\n";
        assert_eq!(
            sum_for(sums, "studio-0.3.0-windows-x64-setup.exe").as_deref(),
            Some("abc123")
        );
        assert_eq!(sum_for(sums, "missing.exe"), None);
    }

    /// A fake GitHub serves a file; its SHA-256 is checked before it is kept.
    #[test]
    fn downloads_and_checks_a_file() {
        use std::net::TcpListener;
        let payload = b"MZ not really an installer".to_vec();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let served = payload.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(2).flatten() {
                let mut stream = stream;
                let mut request = [0u8; 4096];
                let _ = stream.read(&mut request);
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    served.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&served);
            }
        });
        let folder = std::env::temp_dir().join(format!("il-update-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        let mut release = Release {
            version: "9.0.0".to_string(),
            name: String::new(),
            notes: vec![],
            published_at: String::new(),
            page: String::new(),
            asset: Some(Asset {
                name: "studio-setup.exe".to_string(),
                url: format!("{base}/file"),
                size: payload.len() as u64,
                sha256: Some(format!("{:x}", Sha256::digest(&payload))),
            }),
            sums: None,
        };
        let path = download(&release, &folder, |_, _| {}).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), payload);
        release.asset.as_mut().unwrap().sha256 = Some("00".repeat(32));
        assert!(download(&release, &folder, |_, _| {}).is_err());
        let _ = std::fs::remove_dir_all(&folder);
    }
}
