//! Aşama 3 — İzin politikası: kip merdiveni + allow/deny/ask kuralları + soran taraf.
//!
//! claw-code'da her aracın gerektirdiği bir kip vardır (`read-only` < `workspace-write` <
//! `danger-full-access`); oturumun kipi bunu karşılıyorsa araç sormadan çalışır. `prompt` kipi
//! her şeyi sorar, `allow` hiç sormaz. Ayrıca `bash(git:*)` gibi kurallar vardır.
//! Karşılığı: `rust/crates/runtime/src/permissions.rs` (PermissionPolicy) ve
//! `permission_enforcer.rs`. Bu dosya aynı fikrin bağımsız, sade bir uygulamasıdır.

/// Oturumun çalışma kipi.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionMode {
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
    /// Her araç için kullanıcıya sor.
    Prompt,
    /// Hiç sorma (yalnızca tek kullanımlık, güvenilir ortamlarda).
    Allow,
}

impl PermissionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            PermissionMode::ReadOnly => "read-only",
            PermissionMode::WorkspaceWrite => "workspace-write",
            PermissionMode::DangerFullAccess => "danger-full-access",
            PermissionMode::Prompt => "prompt",
            PermissionMode::Allow => "allow",
        }
    }

    pub fn parse(text: &str) -> Option<PermissionMode> {
        [
            PermissionMode::ReadOnly,
            PermissionMode::WorkspaceWrite,
            PermissionMode::DangerFullAccess,
            PermissionMode::Prompt,
            PermissionMode::Allow,
        ]
        .into_iter()
        .find(|mode| mode.as_str() == text)
    }

    /// Yalnızca gerçek yetki basamaklarının sırası vardır; Prompt ve Allow birer davranıştır.
    fn tier(self) -> Option<u8> {
        match self {
            PermissionMode::ReadOnly => Some(0),
            PermissionMode::WorkspaceWrite => Some(1),
            PermissionMode::DangerFullAccess => Some(2),
            PermissionMode::Prompt | PermissionMode::Allow => None,
        }
    }

    /// Bu kipteki oturum, `required` isteyen aracı sormadan çalıştırabilir mi?
    pub fn covers(self, required: PermissionMode) -> bool {
        match (self, self.tier(), required.tier()) {
            (PermissionMode::Allow, _, _) => true,
            (_, Some(have), Some(need)) => have >= need,
            _ => false, // Prompt hiçbir şeyi sessizce kapsamaz
        }
    }
}

/// Kuralın girdiye nasıl uyduğu: hepsi, birebir ya da önek (`git:*`).
#[derive(Debug, Clone, PartialEq, Eq)]
enum Matcher {
    Any,
    Exact(String),
    Prefix(String),
}

/// `araç` ya da `araç(desen)` biçiminde kural.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    pub raw: String,
    tool: String,
    matcher: Matcher,
}

impl Rule {
    pub fn parse(raw: &str) -> Rule {
        let trimmed = raw.trim();
        let (tool, matcher) = match (trimmed.find('('), trimmed.strip_suffix(')')) {
            (Some(open), Some(without_close)) if open > 0 => {
                let pattern = without_close[open + 1..].trim();
                let matcher = if pattern.is_empty() || pattern == "*" {
                    Matcher::Any
                } else if let Some(prefix) = pattern.strip_suffix(":*") {
                    Matcher::Prefix(prefix.to_string())
                } else {
                    Matcher::Exact(pattern.to_string())
                };
                (trimmed[..open].trim(), matcher)
            }
            _ => (trimmed, Matcher::Any),
        };
        Rule {
            raw: trimmed.to_string(),
            tool: tool.to_lowercase(),
            matcher,
        }
    }

    /// `subject`: kuralın baktığı şey — bash için komut, dosya araçları için yol.
    pub fn matches(&self, tool: &str, subject: &str) -> bool {
        self.tool == tool.to_lowercase()
            && match &self.matcher {
                Matcher::Any => true,
                Matcher::Exact(expected) => subject == expected,
                Matcher::Prefix(prefix) => subject.starts_with(prefix.as_str()),
            }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Deny(String),
}

/// Kullanıcıya gösterilen soru.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionRequest {
    pub tool: String,
    pub subject: String,
    pub current: PermissionMode,
    pub required: PermissionMode,
    pub reason: String,
}

/// Soruyu yanıtlayan taraf: terminalde kullanıcı, testte senaryo.
pub trait Prompter {
    fn decide(&mut self, request: &PermissionRequest) -> Decision;
}

#[derive(Debug, Clone)]
pub struct Policy {
    pub mode: PermissionMode,
    allow: Vec<Rule>,
    deny: Vec<Rule>,
    ask: Vec<Rule>,
}

impl Policy {
    pub fn new(mode: PermissionMode) -> Self {
        Policy {
            mode,
            allow: Vec::new(),
            deny: Vec::new(),
            ask: Vec::new(),
        }
    }

    pub fn allow(mut self, rule: &str) -> Self {
        self.allow.push(Rule::parse(rule));
        self
    }

    pub fn deny(mut self, rule: &str) -> Self {
        self.deny.push(Rule::parse(rule));
        self
    }

    pub fn ask(mut self, rule: &str) -> Self {
        self.ask.push(Rule::parse(rule));
        self
    }

    /// Karar sırası: deny kuralı → ask kuralı → allow kuralı → kip merdiveni → sor ya da reddet.
    pub fn authorize(
        &self,
        tool: &str,
        subject: &str,
        required: PermissionMode,
        prompter: Option<&mut (dyn Prompter + '_)>,
    ) -> Decision {
        if let Some(rule) = self.deny.iter().find(|rule| rule.matches(tool, subject)) {
            return Decision::Deny(format!("'{}' kuralı {tool} aracını yasaklıyor", rule.raw));
        }
        let mut request = PermissionRequest {
            tool: tool.to_string(),
            subject: subject.to_string(),
            current: self.mode,
            required,
            reason: String::new(),
        };
        if let Some(rule) = self.ask.iter().find(|rule| rule.matches(tool, subject)) {
            request.reason = format!("'{}' kuralı onay istiyor", rule.raw);
            return ask_or_deny(request, prompter);
        }
        if self.allow.iter().any(|rule| rule.matches(tool, subject)) || self.mode.covers(required) {
            return Decision::Allow;
        }
        let can_escalate = self.mode == PermissionMode::Prompt
            || (self.mode == PermissionMode::WorkspaceWrite
                && required == PermissionMode::DangerFullAccess);
        if can_escalate {
            request.reason = format!(
                "{tool}, {} kipinden {} kipine yükselmek istiyor",
                self.mode.as_str(),
                required.as_str()
            );
            return ask_or_deny(request, prompter);
        }
        Decision::Deny(format!(
            "{tool} için {} gerekir; oturum kipi {}",
            required.as_str(),
            self.mode.as_str()
        ))
    }
}

fn ask_or_deny(request: PermissionRequest, prompter: Option<&mut (dyn Prompter + '_)>) -> Decision {
    match prompter {
        Some(prompter) => prompter.decide(&request),
        // Soracak kimse yoksa (CI, betik) güvenli taraf: reddet.
        None => Decision::Deny(format!("{} (onaylayacak kimse yok)", request.reason)),
    }
}

/// Sırayla verilmiş kararları döndüren senaryolu soran taraf; sorulan soruları da kaydeder.
#[derive(Debug, Default)]
pub struct ScriptedPrompter {
    pub answers: Vec<Decision>,
    pub asked: Vec<PermissionRequest>,
}

impl Prompter for ScriptedPrompter {
    fn decide(&mut self, request: &PermissionRequest) -> Decision {
        self.asked.push(request.clone());
        if self.answers.is_empty() {
            Decision::Deny("senaryoda yanıt kalmadı".into())
        } else {
            self.answers.remove(0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use PermissionMode::*;

    #[test]
    fn kip_merdiveni() {
        assert!(WorkspaceWrite.covers(ReadOnly));
        assert!(!WorkspaceWrite.covers(DangerFullAccess));
        assert!(Allow.covers(DangerFullAccess));
        assert!(
            !Prompt.covers(ReadOnly),
            "Prompt hiçbir şeyi sessizce kapsamamalı"
        );
        assert_eq!(
            PermissionMode::parse("workspace-write"),
            Some(WorkspaceWrite)
        );
        assert_eq!(PermissionMode::parse("hepsi"), None);
    }

    #[test]
    fn kural_cozumleme_ve_eslesme() {
        let prefix = Rule::parse("bash(git:*)");
        assert!(prefix.matches("bash", "git status"));
        assert!(!prefix.matches("bash", "rm -rf /"));
        let exact = Rule::parse("Write_File(notlar.md)");
        assert!(exact.matches("write_file", "notlar.md"));
        assert!(!exact.matches("write_file", "notlar.md.bak"));
        assert!(Rule::parse("read_file").matches("read_file", "her/sey"));
    }

    #[test]
    fn karar_sirasi() {
        let policy = Policy::new(WorkspaceWrite)
            .deny("bash(rm:*)")
            .ask("write_file(.env)")
            .allow("bash(git:*)");
        assert_eq!(
            policy.authorize("read_file", "a", ReadOnly, None),
            Decision::Allow
        );
        assert_eq!(
            policy.authorize("bash", "git log", DangerFullAccess, None),
            Decision::Allow
        );
        assert!(matches!(
            policy.authorize("bash", "rm -rf x", DangerFullAccess, None),
            Decision::Deny(reason) if reason.contains("bash(rm:*)")
        ));
        // ask kuralı, kip izin verse bile sorar; soracak kimse yoksa reddeder.
        assert!(matches!(
            policy.authorize("write_file", ".env", WorkspaceWrite, None),
            Decision::Deny(_)
        ));
        let mut prompter = ScriptedPrompter {
            answers: vec![Decision::Allow],
            ..Default::default()
        };
        assert_eq!(
            policy.authorize("bash", "cargo test", DangerFullAccess, Some(&mut prompter)),
            Decision::Allow
        );
        assert!(prompter.asked[0].reason.contains("yükselmek"));
    }

    #[test]
    fn salt_okunur_kip_sormadan_reddeder() {
        let policy = Policy::new(ReadOnly);
        let mut prompter = ScriptedPrompter::default();
        assert!(matches!(
            policy.authorize("write_file", "a", WorkspaceWrite, Some(&mut prompter)),
            Decision::Deny(_)
        ));
        assert!(prompter.asked.is_empty());
    }
}
