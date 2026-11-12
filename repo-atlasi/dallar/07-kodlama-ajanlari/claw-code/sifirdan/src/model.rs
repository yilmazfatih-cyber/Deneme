//! Aşama 6 — Model istemcisi soyutlaması ve senaryolu sahte model.
//!
//! Döngü modeli yalnızca bir trait üzerinden tanır; gerçek sağlayıcı (Anthropic, OpenAI uyumlu)
//! ile test modeli aynı arayüzü uygular. claw-code'da trait `ApiClient`
//! (`rust/crates/runtime/src/conversation.rs`), gerçek istemciler `rust/crates/api/src/providers/`,
//! testlerdeki sahte sunucu ise `rust/crates/mock-anthropic-service/`. Buradaki sahte model bir
//! satır protokolünden yüklenebilir; böylece senaryolar kod yazmadan dosyaya yazılır.

use std::collections::VecDeque;

use crate::arac::ToolSpec;
use crate::json::parse;
use crate::mesaj::{Block, Message};

#[derive(Debug, Clone, PartialEq)]
pub struct ModelRequest {
    pub system: String,
    pub messages: Vec<Message>,
    pub tools: Vec<ToolSpec>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModelResponse {
    pub blocks: Vec<Block>,
    pub input_tokens: u32,
    pub output_tokens: u32,
}

impl ModelResponse {
    pub fn text(text: &str) -> Self {
        ModelResponse {
            blocks: vec![Block::Text(text.to_string())],
            input_tokens: 0,
            output_tokens: 0,
        }
    }
}

pub trait ModelClient {
    fn send(&mut self, request: &ModelRequest) -> Result<ModelResponse, String>;
}

/// Önceden yazılmış yanıtları sırayla döndürür ve gelen istekleri saklar.
#[derive(Debug, Default)]
pub struct ScriptedModel {
    responses: VecDeque<ModelResponse>,
    pub requests: Vec<ModelRequest>,
}

impl ScriptedModel {
    pub fn new(responses: Vec<ModelResponse>) -> Self {
        ScriptedModel {
            responses: responses.into(),
            requests: Vec::new(),
        }
    }

    /// Satır protokolü:
    /// ```text
    /// # yorum satırı
    /// text: Dosyayı okuyorum.
    /// tool: c1 read_file {"path":"a.txt"}
    /// ---
    /// text: Bitti.
    /// ```
    /// `---` yanıtları ayırır; `text:` metin bloğu, `tool: <kimlik> <ad> <json>` araç çağrısı ekler.
    pub fn from_script(script: &str) -> Result<Self, String> {
        let mut responses = Vec::new();
        let mut blocks = Vec::new();
        for (number, raw) in script.lines().enumerate() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if line == "---" {
                responses.push(take_response(&mut blocks));
            } else if let Some(text) = line.strip_prefix("text:") {
                blocks.push(Block::Text(text.trim().to_string()));
            } else if let Some(rest) = line.strip_prefix("tool:") {
                let mut parts = rest.trim().splitn(3, ' ');
                let (id, name, json) = (parts.next(), parts.next(), parts.next());
                let (Some(id), Some(name), Some(json)) = (id, name, json) else {
                    return Err(format!(
                        "{}. satır: 'tool: <kimlik> <ad> <json>' bekleniyordu",
                        number + 1
                    ));
                };
                let input = parse(json).map_err(|e| format!("{}. satır: {e}", number + 1))?;
                blocks.push(Block::ToolUse {
                    id: id.to_string(),
                    name: name.to_string(),
                    input,
                });
            } else {
                return Err(format!("{}. satır anlaşılmadı: {line}", number + 1));
            }
        }
        if !blocks.is_empty() {
            responses.push(take_response(&mut blocks));
        }
        Ok(ScriptedModel::new(responses))
    }
}

fn take_response(blocks: &mut Vec<Block>) -> ModelResponse {
    ModelResponse {
        blocks: std::mem::take(blocks),
        input_tokens: 0,
        output_tokens: 0,
    }
}

impl ModelClient for ScriptedModel {
    fn send(&mut self, request: &ModelRequest) -> Result<ModelResponse, String> {
        self.requests.push(request.clone());
        let mut response = self
            .responses
            .pop_front()
            .ok_or_else(|| format!("senaryoda {}. yanıt yok", self.requests.len()))?;
        // Kullanım bilgisini kabaca biz dolduralım ki sayaç testleri anlamlı olsun.
        if response.input_tokens == 0 {
            response.input_tokens = request
                .messages
                .iter()
                .map(Message::estimated_tokens)
                .sum::<usize>() as u32;
        }
        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn satir_protokolu() {
        let model = ScriptedModel::from_script(
            "# senaryo\ntext: Okuyorum\ntool: c1 read_file {\"path\": \"a b.txt\"}\n---\ntext: Bitti\n",
        )
        .unwrap();
        assert_eq!(model.responses.len(), 2);
        let Block::ToolUse { input, .. } = &model.responses[0].blocks[1] else {
            panic!("araç çağrısı bekleniyordu");
        };
        assert_eq!(input.get("path").unwrap().as_str(), Some("a b.txt"));
        assert!(ScriptedModel::from_script("tool: eksik").is_err());
        assert!(ScriptedModel::from_script("ne bu").is_err());
    }
}
