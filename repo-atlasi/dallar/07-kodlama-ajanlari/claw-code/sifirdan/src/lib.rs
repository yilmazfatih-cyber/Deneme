//! claw-mini — claw-code'un ajan harness çekirdeğini öğretmek için küçük, bağımlılıksız bir sürüm.
//!
//! Aşamalar (her biri ayrı modül):
//! 1. [`json`]  — serde'siz JSON kodlayıcı/çözücü
//! 2. [`mesaj`] — rol, blok ve mesaj türleri
//! 3. [`izin`]  — izin kipleri, kurallar ve soran taraf
//! 4. [`arac`]  — `Tool` trait'i, kayıt defteri ve yerleşik araçlar
//! 5. [`oturum`] — oturumun JSONL olarak saklanması
//! 6. [`model`] — model istemcisi trait'i ve senaryolu sahte model
//! 7. [`dongu`] — konuşma döngüsü (`Runtime::run_turn`)
//!
//! Gerçek depo: <https://github.com/ultraworkers/claw-code> (`rust/crates/runtime`, `tools`, `api`).

pub mod arac;
pub mod dongu;
pub mod izin;
pub mod json;
pub mod mesaj;
pub mod model;
pub mod oturum;

pub use arac::{Registry, Tool, ToolContext, ToolSpec};
pub use dongu::{Runtime, TurnSummary};
pub use izin::{Decision, PermissionMode, Policy, Prompter, ScriptedPrompter};
pub use json::{parse, Json};
pub use mesaj::{Block, Message, Role};
pub use model::{ModelClient, ModelRequest, ModelResponse, ScriptedModel};
pub use oturum::Session;
