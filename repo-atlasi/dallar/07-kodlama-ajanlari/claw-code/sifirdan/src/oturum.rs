//! Aşama 5 — Oturumun JSONL dosyası olarak saklanması.
//!
//! Her satır bir JSON kaydıdır: ilk satır başlık, sonrakiler mesajlar. Böylece yeni mesaj
//! eklemek dosyanın sonuna tek satır yazmaktır. claw-code da oturumları JSONL tutar ve dosya
//! büyüyünce döndürür (`rust/crates/runtime/src/session.rs`, 256 KiB eşiği). Burada döndürme yok;
//! tam yazımlar "geçici dosya + yeniden adlandırma" ile atomiktir.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use crate::json::{parse, Json};
use crate::mesaj::Message;

pub const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    pub id: String,
    pub messages: Vec<Message>,
    pub compactions: u32,
}

impl Session {
    pub fn new(id: impl Into<String>) -> Self {
        Session {
            id: id.into(),
            messages: Vec::new(),
            compactions: 0,
        }
    }

    pub fn estimated_tokens(&self) -> usize {
        self.messages.iter().map(Message::estimated_tokens).sum()
    }

    fn header(&self) -> Json {
        Json::object([
            ("type", "session".into()),
            ("id", self.id.as_str().into()),
            ("version", FORMAT_VERSION.into()),
            ("compactions", self.compactions.into()),
        ])
    }

    /// Bütün oturumu atomik olarak yazar.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let mut text = self.header().render();
        text.push('\n');
        for message in &self.messages {
            text.push_str(&message_record(message).render());
            text.push('\n');
        }
        let temporary = path.with_extension("jsonl.tmp");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&temporary, text).map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    }

    /// Tek mesajı dosyanın sonuna ekler (dosya yoksa önce başlığı yazar).
    pub fn append(&self, path: &Path, message: &Message) -> Result<(), String> {
        if !path.exists() {
            let mut header_only = self.clone();
            header_only.messages.clear();
            header_only.save(path)?;
        }
        let mut file = OpenOptions::new()
            .append(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        writeln!(file, "{}", message_record(message).render()).map_err(|e| e.to_string())
    }

    pub fn load(path: &Path) -> Result<Session, String> {
        let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let mut lines = text.lines().filter(|line| !line.trim().is_empty());
        let header = parse(lines.next().ok_or("boş oturum dosyası")?)?;
        if header.str_field("type")? != "session" {
            return Err("ilk satır oturum başlığı değil".into());
        }
        let version = header.get("version").and_then(Json::as_f64).unwrap_or(0.0);
        if version as u32 != FORMAT_VERSION {
            return Err(format!("desteklenmeyen sürüm: {version}"));
        }
        let mut session = Session::new(header.str_field("id")?);
        session.compactions = header
            .get("compactions")
            .and_then(Json::as_f64)
            .unwrap_or(0.0) as u32;
        for (index, line) in lines.enumerate() {
            let record = parse(line).map_err(|e| format!("{}. kayıt: {e}", index + 2))?;
            let message = record
                .get("message")
                .ok_or_else(|| format!("{}. kayıtta message yok", index + 2))?;
            session.messages.push(Message::from_json(message)?);
        }
        Ok(session)
    }
}

fn message_record(message: &Message) -> Json {
    Json::object([("type", "message".into()), ("message", message.to_json())])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesaj::Block;

    #[test]
    fn kaydet_ekle_yukle() {
        let dir = std::env::temp_dir().join(format!("claw-mini-oturum-{}", std::process::id()));
        let path = dir.join("s1.jsonl");
        let _ = fs::remove_dir_all(&dir);
        let mut session = Session::new("s1");
        session.messages.push(Message::user("merhaba"));
        session.save(&path).unwrap();
        let extra = Message::tool_results(vec![Block::ToolResult {
            id: "c1".into(),
            name: "read_file".into(),
            output: "1: satır\n2: \"tırnak\"".into(),
            is_error: false,
        }]);
        session.append(&path, &extra).unwrap();
        session.messages.push(extra);
        let loaded = Session::load(&path).unwrap();
        assert_eq!(loaded, session);
        assert!(!path.with_extension("jsonl.tmp").exists());
        fs::write(&path, "{\"type\":\"session\",\"id\":\"x\",\"version\":9}\n").unwrap();
        assert!(Session::load(&path).unwrap_err().contains("desteklenmeyen"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
