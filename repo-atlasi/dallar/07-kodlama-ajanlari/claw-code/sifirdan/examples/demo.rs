//! `cargo run --example demo` — senaryolu modelle tek bir turu uçtan uca gösterir.
//! İsteğe bağlı: `cargo run --example demo -- senaryo.txt` kendi satır protokolü dosyanı çalıştırır.

use std::fs;

use claw_mini::{
    Block, Decision, PermissionMode, Policy, Registry, Runtime, ScriptedModel, ScriptedPrompter,
};

const SCENARIO: &str = r#"
text: Önce dosyaları listeliyorum.
tool: c1 list_files {}
---
tool: c2 read_file {"path":"notlar.md"}
---
tool: c3 bash {"command":"wc -l notlar.md"}
tool: c4 edit_file {"path":"notlar.md","old_string":"- [ ] test yaz","new_string":"- [x] test yaz"}
---
text: Testi yapıldı olarak işaretledim; dosya 2 satır.
"#;

fn main() -> Result<(), String> {
    let root = std::env::temp_dir().join(format!("claw-mini-demo-{}", std::process::id()));
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    fs::write(root.join("notlar.md"), "# Notlar\n- [ ] test yaz\n").map_err(|e| e.to_string())?;

    let script = match std::env::args().nth(1) {
        Some(path) => fs::read_to_string(path).map_err(|e| e.to_string())?,
        None => SCENARIO.to_string(),
    };
    let model = ScriptedModel::from_script(&script)?;
    // workspace-write kipinde bash bir üst basamak ister; senaryolu soran taraf onaylar.
    let mut prompter = ScriptedPrompter {
        answers: vec![Decision::Allow],
        ..Default::default()
    };
    let mut runtime = Runtime::new(
        model,
        Registry::with_builtins(),
        Policy::new(PermissionMode::WorkspaceWrite),
        &root,
    )
    .with_session_path(root.join(".claw/sessions/demo.jsonl"));
    let summary = runtime.run_turn("Notlardaki test maddesini tamamla", Some(&mut prompter))?;

    for message in &runtime.session.messages {
        for block in &message.blocks {
            match block {
                Block::Text(text) => println!("[{}] {text}", message.role.as_str()),
                Block::ToolUse { name, input, .. } => println!("[araç →] {name} {input}"),
                Block::ToolResult {
                    output, is_error, ..
                } => {
                    let first = output.lines().next().unwrap_or("");
                    println!("[araç ←]{} {first}", if *is_error { " HATA" } else { "" });
                }
            }
        }
    }
    for request in &prompter.asked {
        println!("[izin soruldu] {}: {}", request.tool, request.reason);
    }
    println!(
        "\n{} yineleme, {} araç çağrısı. Klasör: {}",
        summary.iterations,
        summary.tool_calls,
        root.display()
    );
    Ok(())
}
