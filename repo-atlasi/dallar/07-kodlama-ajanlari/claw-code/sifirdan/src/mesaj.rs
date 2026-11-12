//! Aşama 2 — Mesaj ve tur (turn) türleri.
//!
//! Konuşma; rolü olan mesajlardan, mesajlar da bloklardan oluşur: metin, araç kullanımı,
//! araç sonucu. claw-code'da karşılığı `rust/crates/runtime/src/session.rs` içindeki
//! `ConversationMessage` / `ContentBlock` türleridir.

use crate::json::Json;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
            Role::Tool => "tool",
        }
    }

    pub fn parse(text: &str) -> Result<Role, String> {
        match text {
            "system" => Ok(Role::System),
            "user" => Ok(Role::User),
            "assistant" => Ok(Role::Assistant),
            "tool" => Ok(Role::Tool),
            other => Err(format!("bilinmeyen rol: {other}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Text(String),
    ToolUse {
        id: String,
        name: String,
        input: Json,
    },
    ToolResult {
        id: String,
        name: String,
        output: String,
        is_error: bool,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub role: Role,
    pub blocks: Vec<Block>,
}

impl Message {
    pub fn user(text: impl Into<String>) -> Self {
        Message {
            role: Role::User,
            blocks: vec![Block::Text(text.into())],
        }
    }

    pub fn system(text: impl Into<String>) -> Self {
        Message {
            role: Role::System,
            blocks: vec![Block::Text(text.into())],
        }
    }

    pub fn assistant(blocks: Vec<Block>) -> Self {
        Message {
            role: Role::Assistant,
            blocks,
        }
    }

    pub fn tool_results(blocks: Vec<Block>) -> Self {
        Message {
            role: Role::Tool,
            blocks,
        }
    }

    /// Mesajdaki tüm metin bloklarını birleştirir.
    pub fn text(&self) -> String {
        self.blocks
            .iter()
            .filter_map(|block| match block {
                Block::Text(text) => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Kaba token tahmini (~4 karakter = 1 token).
    pub fn estimated_tokens(&self) -> usize {
        let chars: usize = self
            .blocks
            .iter()
            .map(|block| match block {
                Block::Text(text) => text.len(),
                Block::ToolUse { name, input, .. } => name.len() + input.render().len(),
                Block::ToolResult { output, .. } => output.len(),
            })
            .sum();
        chars / 4 + 1
    }

    pub fn to_json(&self) -> Json {
        let blocks = self.blocks.iter().map(block_to_json).collect();
        Json::object([
            ("role", Json::from(self.role.as_str())),
            ("blocks", Json::Array(blocks)),
        ])
    }

    pub fn from_json(value: &Json) -> Result<Message, String> {
        let role = Role::parse(value.str_field("role")?)?;
        let blocks = value
            .get("blocks")
            .and_then(Json::as_array)
            .ok_or("blocks dizisi eksik")?
            .iter()
            .map(block_from_json)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Message { role, blocks })
    }
}

fn block_to_json(block: &Block) -> Json {
    match block {
        Block::Text(text) => {
            Json::object([("type", "text".into()), ("text", text.as_str().into())])
        }
        Block::ToolUse { id, name, input } => Json::object([
            ("type", "tool_use".into()),
            ("id", id.as_str().into()),
            ("name", name.as_str().into()),
            ("input", input.clone()),
        ]),
        Block::ToolResult {
            id,
            name,
            output,
            is_error,
        } => Json::object([
            ("type", "tool_result".into()),
            ("id", id.as_str().into()),
            ("name", name.as_str().into()),
            ("output", output.as_str().into()),
            ("is_error", (*is_error).into()),
        ]),
    }
}

fn block_from_json(value: &Json) -> Result<Block, String> {
    match value.str_field("type")? {
        "text" => Ok(Block::Text(value.str_field("text")?.to_string())),
        "tool_use" => Ok(Block::ToolUse {
            id: value.str_field("id")?.to_string(),
            name: value.str_field("name")?.to_string(),
            input: value.get("input").cloned().unwrap_or(Json::Null),
        }),
        "tool_result" => Ok(Block::ToolResult {
            id: value.str_field("id")?.to_string(),
            name: value.str_field("name")?.to_string(),
            output: value.str_field("output")?.to_string(),
            is_error: value
                .get("is_error")
                .and_then(Json::as_bool)
                .unwrap_or(false),
        }),
        other => Err(format!("bilinmeyen blok türü: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    #[test]
    fn mesaj_json_gidis_donus() {
        let message = Message::assistant(vec![
            Block::Text("Okuyorum".into()),
            Block::ToolUse {
                id: "c1".into(),
                name: "read_file".into(),
                input: parse(r#"{"path":"a.txt"}"#).unwrap(),
            },
        ]);
        let back = Message::from_json(&parse(&message.to_json().render()).unwrap()).unwrap();
        assert_eq!(message, back);
        assert_eq!(back.text(), "Okuyorum");
        assert!(Message::from_json(&parse(r#"{"role":"x","blocks":[]}"#).unwrap()).is_err());
    }
}
