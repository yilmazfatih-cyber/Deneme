//! Aşama 7 — Konuşma döngüsü: model → araçlar → model … ta ki model araç istemeyene kadar.
//!
//! claw-code'daki karşılığı `ConversationRuntime::run_turn`
//! (`rust/crates/runtime/src/conversation.rs`): her yinelemede istek kurulur, model çağrılır,
//! araç kullanımları sırayla izin kapısından ve kancalardan (hook) geçirilir, sonuçlar oturuma
//! yazılır. Bekleyen her araç kullanımına MUTLAKA bir sonuç yazılır; yoksa bir sonraki istek
//! sağlayıcı tarafından reddedilir. Sıkıştırma claw-code'daki gibi model çağırmadan, yerel bir
//! özetle yapılır.

use std::path::PathBuf;

use crate::arac::{check_required, Registry, ToolContext};
use crate::izin::{Decision, Policy, Prompter};
use crate::json::Json;
use crate::mesaj::{Block, Message, Role};
use crate::model::{ModelClient, ModelRequest};
use crate::oturum::Session;

/// Araç çalışmadan önce çağrılan kanca: devam et ya da gerekçeyle reddet.
pub type PreToolHook = Box<dyn Fn(&str, &Json) -> Option<String>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnSummary {
    pub iterations: usize,
    pub tool_calls: usize,
    pub final_text: String,
    pub compacted: bool,
    pub input_tokens: u64,
}

pub struct Runtime<M: ModelClient> {
    pub session: Session,
    pub model: M,
    registry: Registry,
    policy: Policy,
    root: PathBuf,
    system: String,
    max_iterations: usize,
    compact_threshold: usize,
    keep_recent: usize,
    session_path: Option<PathBuf>,
    hooks: Vec<PreToolHook>,
}

impl<M: ModelClient> Runtime<M> {
    pub fn new(model: M, registry: Registry, policy: Policy, root: impl Into<PathBuf>) -> Self {
        Runtime {
            session: Session::new("oturum"),
            model,
            registry,
            policy,
            root: root.into(),
            system: "Sen dikkatli bir kodlama ajanısın. Önce oku, sonra küçük değişiklikler yap."
                .into(),
            max_iterations: 16,
            compact_threshold: 100_000,
            keep_recent: 4,
            session_path: None,
            hooks: Vec::new(),
        }
    }

    pub fn with_session(mut self, session: Session) -> Self {
        self.session = session;
        self
    }

    pub fn with_max_iterations(mut self, limit: usize) -> Self {
        self.max_iterations = limit;
        self
    }

    /// Tahmini token sayısı `threshold`ı aşınca son `keep_recent` mesaj dışındakiler özetlenir.
    pub fn with_compaction(mut self, threshold: usize, keep_recent: usize) -> Self {
        self.compact_threshold = threshold;
        self.keep_recent = keep_recent;
        self
    }

    /// Her yeni mesaj bu JSONL dosyasına eklenir.
    pub fn with_session_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.session_path = Some(path.into());
        self
    }

    pub fn with_hook(mut self, hook: PreToolHook) -> Self {
        self.hooks.push(hook);
        self
    }

    fn push(&mut self, message: Message) -> Result<(), String> {
        if let Some(path) = &self.session_path {
            self.session.append(path, &message)?;
        }
        self.session.messages.push(message);
        Ok(())
    }

    /// Bir kullanıcı girdisini sonuna kadar işler.
    pub fn run_turn(
        &mut self,
        input: &str,
        mut prompter: Option<&mut dyn Prompter>,
    ) -> Result<TurnSummary, String> {
        self.push(Message::user(input))?;
        let mut summary = TurnSummary {
            iterations: 0,
            tool_calls: 0,
            final_text: String::new(),
            compacted: false,
            input_tokens: 0,
        };
        loop {
            summary.iterations += 1;
            if summary.iterations > self.max_iterations {
                return Err(format!(
                    "yineleme sınırı ({}) aşıldı; model durmadan araç istiyor",
                    self.max_iterations
                ));
            }
            summary.compacted |= self.maybe_compact()?;

            let request = ModelRequest {
                system: self.system.clone(),
                messages: self.session.messages.clone(),
                tools: self.registry.specs(),
            };
            let response = self.model.send(&request)?;
            summary.input_tokens += u64::from(response.input_tokens);
            let assistant = Message::assistant(response.blocks);
            let calls: Vec<(String, String, Json)> = assistant
                .blocks
                .iter()
                .filter_map(|block| match block {
                    Block::ToolUse { id, name, input } => {
                        Some((id.clone(), name.clone(), input.clone()))
                    }
                    _ => None,
                })
                .collect();
            summary.final_text = assistant.text();
            self.push(assistant)?;
            if calls.is_empty() {
                return Ok(summary);
            }

            let mut results = Vec::new();
            for (id, name, input) in calls {
                summary.tool_calls += 1;
                let (output, is_error) = match self.execute(&name, &input, prompter.as_deref_mut())
                {
                    Ok(output) => (output, false),
                    Err(error) => (error, true),
                };
                results.push(Block::ToolResult {
                    id,
                    name,
                    output,
                    is_error,
                });
            }
            self.push(Message::tool_results(results))?;
        }
    }

    /// Kanca → kayıt defteri → girdi denetimi → izin → çalıştırma.
    fn execute(
        &self,
        name: &str,
        input: &Json,
        prompter: Option<&mut (dyn Prompter + '_)>,
    ) -> Result<String, String> {
        for hook in &self.hooks {
            if let Some(reason) = hook(name, input) {
                return Err(format!("kanca reddetti: {reason}"));
            }
        }
        let tool = self
            .registry
            .get(name)
            .ok_or_else(|| format!("{name} adında araç yok"))?;
        let spec = tool.spec();
        check_required(&spec, input)?;
        match self
            .policy
            .authorize(name, &permission_subject(input), spec.permission, prompter)
        {
            Decision::Allow => tool.run(
                input,
                &ToolContext {
                    root: self.root.clone(),
                },
            ),
            Decision::Deny(reason) => Err(format!("izin yok: {reason}")),
        }
    }

    /// Bağlam büyüdüyse eski mesajları yerel bir özetle değiştirir.
    fn maybe_compact(&mut self) -> Result<bool, String> {
        if self.session.estimated_tokens() < self.compact_threshold {
            return Ok(false);
        }
        let messages = &self.session.messages;
        let mut keep_from = messages.len().saturating_sub(self.keep_recent);
        // Korunan kısım araç sonucuyla başlamasın: eşleşen araç kullanımı da korunur.
        while keep_from > 0 && messages[keep_from].role == Role::Tool {
            keep_from -= 1;
        }
        if keep_from == 0 {
            return Ok(false);
        }
        let summary = Message::system(local_summary(&messages[..keep_from]));
        let mut compacted = vec![summary];
        compacted.extend_from_slice(&messages[keep_from..]);
        self.session.messages = compacted;
        self.session.compactions += 1;
        if let Some(path) = &self.session_path {
            self.session.save(path)?;
        }
        Ok(true)
    }
}

/// Kuralların eşleşeceği "konu": komut, yol ya da desen.
pub fn permission_subject(input: &Json) -> String {
    ["command", "path", "pattern"]
        .iter()
        .find_map(|key| input.get(key).and_then(Json::as_str))
        .unwrap_or("")
        .to_string()
}

/// Model çağırmadan özet: kaç mesaj, hangi istekler, hangi araçlar, hangi dosyalar.
fn local_summary(messages: &[Message]) -> String {
    let requests: Vec<String> = messages
        .iter()
        .filter(|message| message.role == Role::User)
        .map(|message| message.text().chars().take(80).collect())
        .collect();
    let mut tools = Vec::new();
    let mut files = Vec::new();
    for block in messages.iter().flat_map(|message| &message.blocks) {
        if let Block::ToolUse { name, input, .. } = block {
            tools.push(name.clone());
            if let Some(path) = input.get("path").and_then(Json::as_str) {
                files.push(path.to_string());
            }
        }
    }
    for list in [&mut tools, &mut files] {
        list.sort();
        list.dedup();
    }
    format!(
        "Önceki konuşmanın özeti ({} mesaj sıkıştırıldı).\n- İstekler: {}\n- Kullanılan araçlar: {}\n- Dokunulan dosyalar: {}\nKaldığın yerden devam et; özeti tekrar etme.",
        messages.len(),
        requests.join(" | "),
        tools.join(", "),
        files.join(", ")
    )
}
