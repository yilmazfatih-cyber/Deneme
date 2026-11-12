//! Aşama 4 — `Tool` trait'i, kayıt defteri (registry) ve yerleşik araçlar.
//!
//! claw-code araçlarını büyük bir statik tabloda tanımlar (`rust/crates/tools/src/lib.rs`,
//! `mvp_tool_specs`); her tanımın adı, açıklaması, girdi şeması ve gerektirdiği izin kipi vardır.
//! Burada aynı bilgiyi bir trait ile taşıyoruz; böylece eklenti araçları da aynı kapıdan girer.

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::izin::PermissionMode;
use crate::json::Json;

/// Modele gösterilen araç tanımı.
#[derive(Debug, Clone, PartialEq)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    /// Zorunlu girdi alanları (gerçek sistemlerde tam JSON Schema olur).
    pub required_fields: Vec<String>,
    pub permission: PermissionMode,
}

/// Araç çalışırken bilmesi gerekenler.
#[derive(Debug, Clone)]
pub struct ToolContext {
    pub root: PathBuf,
}

pub trait Tool {
    fn spec(&self) -> ToolSpec;
    /// Başarıda modele gidecek metin, hatada modele gidecek hata metni.
    fn run(&self, input: &Json, ctx: &ToolContext) -> Result<String, String>;
}

#[derive(Default)]
pub struct Registry {
    tools: Vec<Box<dyn Tool>>,
}

impl Registry {
    pub fn new() -> Self {
        Registry::default()
    }

    /// Yerleşik araçlarla dolu kayıt defteri.
    pub fn with_builtins() -> Self {
        let mut registry = Registry::new();
        for tool in [
            Box::new(ReadFile) as Box<dyn Tool>,
            Box::new(WriteFile),
            Box::new(EditFile),
            Box::new(ListFiles),
            Box::new(Bash),
        ] {
            registry.register(tool).expect("yerleşik adlar benzersiz");
        }
        registry
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) -> Result<(), String> {
        let name = tool.spec().name;
        if self.get(&name).is_some() {
            return Err(format!("{name} adında bir araç zaten kayıtlı"));
        }
        self.tools.push(tool);
        Ok(())
    }

    pub fn get(&self, name: &str) -> Option<&dyn Tool> {
        self.tools
            .iter()
            .find(|tool| tool.spec().name == name)
            .map(|tool| tool.as_ref())
    }

    pub fn specs(&self) -> Vec<ToolSpec> {
        self.tools.iter().map(|tool| tool.spec()).collect()
    }
}

/// Girdinin zorunlu alanlarını denetler.
pub fn check_required(spec: &ToolSpec, input: &Json) -> Result<(), String> {
    for field in &spec.required_fields {
        if input.get(field).is_none() {
            return Err(format!("{}: zorunlu alan eksik: {field}", spec.name));
        }
    }
    Ok(())
}

/// Yolu çalışma alanı içinde çözer; `..` ile dışarı kaçışı ve mutlak yolları reddeder.
pub fn workspace_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(relative);
    if candidate.is_absolute() {
        return Err(format!("mutlak yol kabul edilmez: {relative}"));
    }
    let mut depth: i32 = 0;
    for component in candidate.components() {
        match component {
            Component::ParentDir => depth -= 1,
            Component::Normal(_) => depth += 1,
            _ => {}
        }
        if depth < 0 {
            return Err(format!("çalışma alanının dışına çıkılamaz: {relative}"));
        }
    }
    Ok(root.join(candidate))
}

fn spec(name: &str, description: &str, fields: &[&str], permission: PermissionMode) -> ToolSpec {
    ToolSpec {
        name: name.to_string(),
        description: description.to_string(),
        required_fields: fields.iter().map(|field| field.to_string()).collect(),
        permission,
    }
}

pub struct ReadFile;

impl Tool for ReadFile {
    fn spec(&self) -> ToolSpec {
        spec(
            "read_file",
            "Dosyayı satır numaralarıyla okur",
            &["path"],
            PermissionMode::ReadOnly,
        )
    }

    fn run(&self, input: &Json, ctx: &ToolContext) -> Result<String, String> {
        let path = workspace_path(&ctx.root, input.str_field("path")?)?;
        let text = fs::read_to_string(&path).map_err(|e| format!("okunamadı: {e}"))?;
        let offset = input
            .get("offset")
            .and_then(Json::as_f64)
            .unwrap_or(1.0)
            .max(1.0) as usize;
        let limit = input.get("limit").and_then(Json::as_f64).unwrap_or(2000.0) as usize;
        Ok(text
            .lines()
            .enumerate()
            .skip(offset - 1)
            .take(limit)
            .map(|(index, line)| format!("{}: {line}", index + 1))
            .collect::<Vec<_>>()
            .join("\n"))
    }
}

pub struct WriteFile;

impl Tool for WriteFile {
    fn spec(&self) -> ToolSpec {
        spec(
            "write_file",
            "Dosyayı verilen içerikle yazar",
            &["path", "content"],
            PermissionMode::WorkspaceWrite,
        )
    }

    fn run(&self, input: &Json, ctx: &ToolContext) -> Result<String, String> {
        let relative = input.str_field("path")?;
        let path = workspace_path(&ctx.root, relative)?;
        let content = input.str_field("content")?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(format!("{relative} yazıldı ({} bayt)", content.len()))
    }
}

pub struct EditFile;

impl Tool for EditFile {
    fn spec(&self) -> ToolSpec {
        spec(
            "edit_file",
            "Dosyada old_string metnini new_string ile değiştirir; old_string tek olmalı",
            &["path", "old_string", "new_string"],
            PermissionMode::WorkspaceWrite,
        )
    }

    fn run(&self, input: &Json, ctx: &ToolContext) -> Result<String, String> {
        let relative = input.str_field("path")?;
        let path = workspace_path(&ctx.root, relative)?;
        let old = input.str_field("old_string")?;
        let new = input.str_field("new_string")?;
        if old.is_empty() || old == new {
            return Err("old_string boş olamaz ve new_string'den farklı olmalı".into());
        }
        let source = fs::read_to_string(&path).map_err(|e| format!("okunamadı: {e}"))?;
        let all = input
            .get("replace_all")
            .and_then(Json::as_bool)
            .unwrap_or(false);
        let count = source.matches(old).count();
        let updated = match (count, all) {
            (0, _) => return Err(format!("old_string {relative} içinde bulunamadı")),
            (1, _) | (_, true) => source.replace(old, new),
            (n, false) => {
                return Err(format!(
                    "old_string {n} yerde geçiyor; bağlam ekle ya da replace_all kullan"
                ))
            }
        };
        fs::write(&path, updated).map_err(|e| e.to_string())?;
        Ok(format!(
            "{relative} düzenlendi ({} değişiklik)",
            if all { count } else { 1 }
        ))
    }
}

pub struct ListFiles;

impl Tool for ListFiles {
    fn spec(&self) -> ToolSpec {
        spec(
            "list_files",
            "Çalışma alanındaki dosyaları listeler",
            &[],
            PermissionMode::ReadOnly,
        )
    }

    fn run(&self, input: &Json, ctx: &ToolContext) -> Result<String, String> {
        let start = workspace_path(
            &ctx.root,
            input.get("path").and_then(Json::as_str).unwrap_or("."),
        )?;
        let mut files = Vec::new();
        collect_files(&ctx.root, &start, &mut files).map_err(|e| e.to_string())?;
        files.sort();
        Ok(files.join("\n"))
    }
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name == ".git" || name == "target" || name.starts_with(".claw") {
            continue;
        }
        if path.is_dir() {
            collect_files(root, &path, out)?;
        } else if let Ok(relative) = path.strip_prefix(root) {
            out.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

pub const DEFAULT_TIMEOUT_MS: u64 = 120_000;

pub struct Bash;

impl Tool for Bash {
    fn spec(&self) -> ToolSpec {
        spec(
            "bash",
            "Kabuk komutu çalıştırır; timeout_ms ile süre sınırı verilebilir",
            &["command"],
            PermissionMode::DangerFullAccess,
        )
    }

    fn run(&self, input: &Json, ctx: &ToolContext) -> Result<String, String> {
        let command = input.str_field("command")?;
        let timeout = input
            .get("timeout_ms")
            .and_then(Json::as_f64)
            .map_or(DEFAULT_TIMEOUT_MS, |ms| ms as u64);
        let outcome = run_with_timeout(command, &ctx.root, Duration::from_millis(timeout))?;
        let mut text = outcome.output;
        if outcome.timed_out {
            text.push_str(&format!(
                "\n[{timeout} ms zaman aşımı: süreç grubu durduruldu]"
            ));
        }
        text.push_str(&format!(
            "\n[çıkış kodu: {}]",
            outcome.code.map_or("yok".into(), |code| code.to_string())
        ));
        Ok(text)
    }
}

pub struct CommandOutcome {
    pub output: String,
    pub code: Option<i32>,
    pub timed_out: bool,
}

/// Komutu ayrı bir süreç grubunda başlatır; süre dolarsa bütün grubu öldürür.
/// Yalnızca std kullanır: çıktılar ayrı iş parçacıklarında okunur ki borular dolup kilitlenmesin.
pub fn run_with_timeout(
    command: &str,
    cwd: &Path,
    timeout: Duration,
) -> Result<CommandOutcome, String> {
    let mut builder = Command::new("bash");
    builder
        .arg("-c")
        .arg(command)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        builder.process_group(0);
    }
    let mut child = builder.spawn().map_err(|e| format!("başlatılamadı: {e}"))?;
    let readers: Vec<_> = [
        child
            .stdout
            .take()
            .map(|s| Box::new(s) as Box<dyn Read + Send>),
        child
            .stderr
            .take()
            .map(|s| Box::new(s) as Box<dyn Read + Send>),
    ]
    .into_iter()
    .flatten()
    .map(|mut stream| {
        thread::spawn(move || {
            let mut buffer = String::new();
            let _ = stream.read_to_string(&mut buffer);
            buffer
        })
    })
    .collect();

    let started = Instant::now();
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break Some(status);
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            kill_group(child.id());
            let _ = child.kill();
            break child.wait().ok();
        }
        thread::sleep(Duration::from_millis(10));
    };
    let output = readers
        .into_iter()
        .map(|reader| reader.join().unwrap_or_default())
        .collect::<Vec<_>>()
        .join("");
    Ok(CommandOutcome {
        output,
        code: if timed_out {
            None
        } else {
            status.and_then(|s| s.code())
        },
        timed_out,
    })
}

/// Süreç grubunu öldürür. std'de killpg olmadığı için `kill` komutunu kullanırız (unsafe yok).
fn kill_group(pid: u32) {
    if cfg!(unix) {
        let _ = Command::new("kill")
            .args(["-KILL", "--", &format!("-{pid}")])
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("claw-mini-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn dosya_araclari() {
        let root = temp_root("arac");
        let ctx = ToolContext { root: root.clone() };
        let registry = Registry::with_builtins();
        let write = registry.get("write_file").unwrap();
        write
            .run(
                &parse(r#"{"path":"a/b.txt","content":"x = 1\ny = 1\n"}"#).unwrap(),
                &ctx,
            )
            .unwrap();
        let read = registry
            .get("read_file")
            .unwrap()
            .run(&parse(r#"{"path":"a/b.txt","offset":2}"#).unwrap(), &ctx);
        assert_eq!(read.unwrap(), "2: y = 1");
        let edit = registry.get("edit_file").unwrap();
        let input = parse(r#"{"path":"a/b.txt","old_string":"= 1","new_string":"= 2"}"#).unwrap();
        assert!(edit.run(&input, &ctx).unwrap_err().contains("2 yerde"));
        let all =
            parse(r#"{"path":"a/b.txt","old_string":"= 1","new_string":"= 2","replace_all":true}"#)
                .unwrap();
        assert!(edit.run(&all, &ctx).unwrap().contains("2 değişiklik"));
        assert_eq!(
            fs::read_to_string(root.join("a/b.txt")).unwrap(),
            "x = 2\ny = 2\n"
        );
        let list = registry
            .get("list_files")
            .unwrap()
            .run(&Json::object([]), &ctx)
            .unwrap();
        assert_eq!(list, "a/b.txt");
        let escape = parse(r#"{"path":"../dis.txt","content":"x"}"#).unwrap();
        assert!(write.run(&escape, &ctx).unwrap_err().contains("dışına"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn bash_cikti_ve_zaman_asimi() {
        let root = temp_root("bash");
        let ctx = ToolContext { root: root.clone() };
        let ok = Bash
            .run(
                &parse(r#"{"command":"echo merhaba; echo hata >&2; exit 3"}"#).unwrap(),
                &ctx,
            )
            .unwrap();
        assert!(ok.contains("merhaba") && ok.contains("hata") && ok.contains("[çıkış kodu: 3]"));
        let started = Instant::now();
        let slow = Bash
            .run(
                &parse(r#"{"command":"sleep 5; echo bitmedi","timeout_ms":200}"#).unwrap(),
                &ctx,
            )
            .unwrap();
        assert!(
            started.elapsed() < Duration::from_secs(4),
            "grup öldürülmeli"
        );
        assert!(slow.contains("zaman aşımı") && !slow.contains("bitmedi"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn ayni_adla_iki_arac_kaydedilemez() {
        let mut registry = Registry::with_builtins();
        assert!(registry.register(Box::new(Bash)).is_err());
        assert_eq!(registry.specs().len(), 5);
    }
}
