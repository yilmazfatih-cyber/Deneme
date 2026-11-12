//! Uçtan uca testler: senaryolu sahte model + gerçek araçlar + geçici çalışma klasörü.

use std::fs;
use std::path::PathBuf;

use claw_mini::{
    Block, Decision, Json, Message, PermissionMode, Policy, Registry, Role, Runtime, ScriptedModel,
    ScriptedPrompter, Session, Tool, ToolContext, ToolSpec,
};

fn workspace(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("claw-mini-e2e-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("selam.txt"), "Merhaba dünya\n").unwrap();
    root
}

fn tool_results(message: &Message) -> Vec<(String, bool)> {
    message
        .blocks
        .iter()
        .filter_map(|block| match block {
            Block::ToolResult {
                output, is_error, ..
            } => Some((output.clone(), *is_error)),
            _ => None,
        })
        .collect()
}

#[test]
fn oku_duzenle_bitir() {
    let root = workspace("akis");
    let model = ScriptedModel::from_script(
        r#"
text: Önce okuyorum.
tool: c1 read_file {"path":"selam.txt"}
---
tool: c2 edit_file {"path":"selam.txt","old_string":"dünya","new_string":"Rust"}
---
text: Düzelttim.
"#,
    )
    .unwrap();
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::WorkspaceWrite),
        &root,
    );
    let summary = runtime
        .run_turn("selam.txt dosyasında dünya yerine Rust yaz", None)
        .unwrap();

    assert_eq!(summary.iterations, 3);
    assert_eq!(summary.tool_calls, 2);
    assert_eq!(summary.final_text, "Düzelttim.");
    assert_eq!(
        fs::read_to_string(root.join("selam.txt")).unwrap(),
        "Merhaba Rust\n"
    );
    let roles: Vec<Role> = runtime.session.messages.iter().map(|m| m.role).collect();
    assert_eq!(
        roles,
        [
            Role::User,
            Role::Assistant,
            Role::Tool,
            Role::Assistant,
            Role::Tool,
            Role::Assistant
        ]
    );
    // İkinci istek, ilk aracın çıktısını görmüş olmalı.
    let second = &runtime.model.requests[1];
    assert_eq!(
        tool_results(second.messages.last().unwrap())[0].0,
        "1: Merhaba dünya"
    );
    assert!(summary.input_tokens > 0);
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn salt_okunur_kip_yazmayi_reddeder_ve_model_bunu_gorur() {
    let root = workspace("salt");
    let model = ScriptedModel::from_script(
        "tool: w1 write_file {\"path\":\"yeni.txt\",\"content\":\"x\"}\n---\ntext: Yazamadım, izin gerekiyor.",
    )
    .unwrap();
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::ReadOnly),
        &root,
    );
    let summary = runtime.run_turn("yeni.txt oluştur", None).unwrap();
    assert_eq!(summary.final_text, "Yazamadım, izin gerekiyor.");
    assert!(!root.join("yeni.txt").exists());
    let results = tool_results(&runtime.session.messages[2]);
    assert!(results[0].1, "hata olarak işaretlenmeli");
    assert!(results[0].0.contains("izin yok") && results[0].0.contains("workspace-write"));
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn prompt_kipi_her_araci_sorar() {
    let root = workspace("sor");
    let model = ScriptedModel::from_script(
        "tool: b1 bash {\"command\":\"echo izinli\"}\ntool: b2 bash {\"command\":\"rm selam.txt\"}\n---\ntext: tamam",
    )
    .unwrap();
    let mut prompter = ScriptedPrompter {
        answers: vec![Decision::Allow, Decision::Deny("dosya silme".into())],
        ..Default::default()
    };
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::Prompt),
        &root,
    );
    runtime
        .run_turn("komutları çalıştır", Some(&mut prompter))
        .unwrap();
    assert_eq!(prompter.asked.len(), 2);
    assert_eq!(prompter.asked[1].subject, "rm selam.txt");
    let results = tool_results(&runtime.session.messages[2]);
    assert!(!results[0].1 && results[0].0.contains("izinli"));
    assert!(results[1].1 && results[1].0.contains("dosya silme"));
    assert!(root.join("selam.txt").exists());
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn kanca_ve_kurallar_kipten_once_gelir() {
    let root = workspace("kanca");
    let model = ScriptedModel::from_script(
        "tool: b1 bash {\"command\":\"curl http://ornek\"}\ntool: b2 bash {\"command\":\"git status\"}\n---\ntext: bitti",
    )
    .unwrap();
    let policy = Policy::new(PermissionMode::WorkspaceWrite).deny("bash(git:*)");
    let mut runtime = Runtime::new(model, Registry::with_builtins(), policy, &root).with_hook(
        Box::new(|name: &str, input: &Json| {
            let command = input.get("command").and_then(Json::as_str).unwrap_or("");
            (name == "bash" && command.contains("curl")).then(|| "ağ erişimi kapalı".to_string())
        }),
    );
    runtime.run_turn("dene", None).unwrap();
    let results = tool_results(&runtime.session.messages[2]);
    assert!(results[0].0.contains("kanca reddetti: ağ erişimi kapalı"));
    assert!(results[1].0.contains("bash(git:*)"));
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn yineleme_siniri_sonsuz_donguyu_keser() {
    let root = workspace("sinir");
    let script = "tool: l list_files {}\n---\n".repeat(5);
    let model = ScriptedModel::from_script(&script).unwrap();
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::ReadOnly),
        &root,
    )
    .with_max_iterations(3);
    let error = runtime.run_turn("listele", None).unwrap_err();
    assert!(error.contains("yineleme sınırı (3)"));
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn bilinmeyen_arac_ve_eksik_alan_hata_sonucu_olur() {
    let root = workspace("hata");
    let model =
        ScriptedModel::from_script("tool: x1 uc {}\ntool: x2 read_file {}\n---\ntext: anladım")
            .unwrap();
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::ReadOnly),
        &root,
    );
    runtime.run_turn("dene", None).unwrap();
    let results = tool_results(&runtime.session.messages[2]);
    assert!(results[0].1 && results[0].0.contains("uc adında araç yok"));
    assert!(results[1].1 && results[1].0.contains("zorunlu alan eksik: path"));
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn sikistirma_arac_ciftini_bolmez_ve_ozet_ekler() {
    let root = workspace("sikistir");
    let mut session = Session::new("uzun");
    for index in 0..6 {
        session.messages.push(Message::user(format!(
            "eski istek {index} {}",
            "x".repeat(400)
        )));
        session
            .messages
            .push(Message::assistant(vec![Block::ToolUse {
                id: format!("r{index}"),
                name: "read_file".into(),
                input: Json::object([("path", "selam.txt".into())]),
            }]));
        session
            .messages
            .push(Message::tool_results(vec![Block::ToolResult {
                id: format!("r{index}"),
                name: "read_file".into(),
                output: "1: Merhaba dünya".into(),
                is_error: false,
            }]));
    }
    let model = ScriptedModel::from_script("text: devam ediyorum").unwrap();
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::ReadOnly),
        &root,
    )
    .with_session(session)
    .with_compaction(200, 2);
    let summary = runtime.run_turn("devam et", None).unwrap();
    assert!(summary.compacted);
    let sent = &runtime.model.requests[0].messages;
    assert_eq!(sent[0].role, Role::System);
    assert!(sent[0].text().contains("Dokunulan dosyalar: selam.txt"));
    assert_ne!(
        sent[1].role,
        Role::Tool,
        "korunan kısım araç sonucuyla başlamamalı"
    );
    assert_eq!(runtime.session.compactions, 1);
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn oturum_jsonl_dosyasindan_aynen_geri_yuklenir() {
    let root = workspace("kalici");
    let path = root.join(".claw/sessions/s1.jsonl");
    let model = ScriptedModel::from_script(
        "tool: r1 read_file {\"path\":\"selam.txt\"}\n---\ntext: okudum",
    )
    .unwrap();
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::ReadOnly),
        &root,
    )
    .with_session(Session::new("s1"))
    .with_session_path(&path);
    runtime.run_turn("oku", None).unwrap();
    let loaded = Session::load(&path).unwrap();
    assert_eq!(loaded, runtime.session);
    assert_eq!(loaded.messages.len(), 4);
    fs::remove_dir_all(&root).unwrap();
}

/// Dışarıdan eklenen bir araç: eklenti araçları da aynı trait ile gelir.
struct Clock;

impl Tool for Clock {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "saat".into(),
            description: "Sabit bir saat döndürür".into(),
            required_fields: vec![],
            permission: PermissionMode::ReadOnly,
        }
    }

    fn run(&self, _input: &Json, _ctx: &ToolContext) -> Result<String, String> {
        Ok("12:00".into())
    }
}

#[test]
fn eklenti_araci_kaydedilip_cagrilabilir() {
    let root = workspace("eklenti");
    let mut registry = Registry::with_builtins();
    registry.register(Box::new(Clock)).unwrap();
    let model = ScriptedModel::from_script("tool: s1 saat {}\n---\ntext: Saat 12:00").unwrap();
    let mut runtime = Runtime::new(
        model,
        registry,
        Policy::new(PermissionMode::ReadOnly),
        &root,
    );
    runtime.run_turn("saat kaç", None).unwrap();
    assert_eq!(tool_results(&runtime.session.messages[2])[0].0, "12:00");
    assert!(runtime.model.requests[0]
        .tools
        .iter()
        .any(|spec| spec.name == "saat"));
    fs::remove_dir_all(&root).unwrap();
}
