//! Aşama 1 — serde olmadan küçük bir JSON kodlayıcı/çözücü.
//!
//! claw-code oturum JSONL dosyalarını ve MCP mesajlarını kendi `JsonValue` türüyle yazar
//! (`rust/crates/runtime/src/json.rs`). Buradaki sürüm bağımsız yazıldı: sıralı nesneler için
//! `BTreeMap`, sayılar için `f64`, `\uXXXX` kaçışları için vekil çift (surrogate pair) desteği.

use std::collections::BTreeMap;
use std::fmt;

/// Bir JSON değeri. Nesne anahtarları sıralı tutulur; böylece çıktı her zaman aynıdır.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Json>),
    Object(BTreeMap<String, Json>),
}

impl Json {
    /// Anahtar-değer çiftlerinden nesne kurar.
    pub fn object<const N: usize>(pairs: [(&str, Json); N]) -> Json {
        Json::Object(
            pairs
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect(),
        )
    }

    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Object(map) => map.get(key),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::String(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Json::Number(number) => Some(*number),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Json::Bool(value) => Some(*value),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<Json>> {
        match self {
            Json::Array(items) => Some(items),
            _ => None,
        }
    }

    /// Bir alanın metin değerini okur; yoksa açıklayıcı hata döner.
    pub fn str_field(&self, key: &str) -> Result<&str, String> {
        self.get(key)
            .and_then(Json::as_str)
            .ok_or_else(|| format!("\"{key}\" metin alanı eksik"))
    }

    /// Tek satırlık JSON metni üretir.
    pub fn render(&self) -> String {
        let mut out = String::new();
        write_value(self, &mut out);
        out
    }
}

impl From<&str> for Json {
    fn from(value: &str) -> Self {
        Json::String(value.to_string())
    }
}

impl From<String> for Json {
    fn from(value: String) -> Self {
        Json::String(value)
    }
}

impl From<bool> for Json {
    fn from(value: bool) -> Self {
        Json::Bool(value)
    }
}

impl From<f64> for Json {
    fn from(value: f64) -> Self {
        Json::Number(value)
    }
}

impl From<u32> for Json {
    fn from(value: u32) -> Self {
        Json::Number(f64::from(value))
    }
}

impl fmt::Display for Json {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.render())
    }
}

fn write_value(value: &Json, out: &mut String) {
    match value {
        Json::Null => out.push_str("null"),
        Json::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
        Json::Number(number) => write_number(*number, out),
        Json::String(text) => write_string(text, out),
        Json::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_value(item, out);
            }
            out.push(']');
        }
        Json::Object(map) => {
            out.push('{');
            for (index, (key, item)) in map.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_string(key, out);
                out.push(':');
                write_value(item, out);
            }
            out.push('}');
        }
    }
}

fn write_number(number: f64, out: &mut String) {
    if !number.is_finite() {
        // JSON'da NaN/sonsuz yoktur; bilgi kaybını açıkça null ile gösteririz.
        out.push_str("null");
    } else if number.fract() == 0.0 && number.abs() < 1e15 {
        out.push_str(&format!("{}", number as i64));
    } else {
        out.push_str(&format!("{number}"));
    }
}

fn write_string(text: &str, out: &mut String) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// JSON metnini çözer. Hata mesajı bayt konumunu içerir.
pub fn parse(text: &str) -> Result<Json, String> {
    let mut parser = Parser {
        bytes: text.as_bytes(),
        pos: 0,
    };
    let value = parser.value()?;
    parser.skip_whitespace();
    if parser.pos != parser.bytes.len() {
        return Err(parser.error("fazladan karakter"));
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Parser<'_> {
    fn error(&self, message: &str) -> String {
        format!("JSON hatası ({}. bayt): {message}", self.pos)
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.pos += 1;
        }
    }

    fn expect(&mut self, byte: u8) -> Result<(), String> {
        if self.peek() == Some(byte) {
            self.pos += 1;
            Ok(())
        } else {
            Err(self.error(&format!("'{}' bekleniyordu", byte as char)))
        }
    }

    fn literal(&mut self, word: &str, value: Json) -> Result<Json, String> {
        if self.bytes[self.pos..].starts_with(word.as_bytes()) {
            self.pos += word.len();
            Ok(value)
        } else {
            Err(self.error("bilinmeyen sözcük"))
        }
    }

    fn value(&mut self) -> Result<Json, String> {
        self.skip_whitespace();
        match self.peek() {
            None => Err(self.error("beklenmeyen son")),
            Some(b'n') => self.literal("null", Json::Null),
            Some(b't') => self.literal("true", Json::Bool(true)),
            Some(b'f') => self.literal("false", Json::Bool(false)),
            Some(b'"') => self.string().map(Json::String),
            Some(b'[') => self.array(),
            Some(b'{') => self.object(),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(_) => Err(self.error("beklenmeyen karakter")),
        }
    }

    fn number(&mut self) -> Result<Json, String> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        let digits = |parser: &mut Self| {
            let begin = parser.pos;
            while matches!(parser.peek(), Some(b'0'..=b'9')) {
                parser.pos += 1;
            }
            parser.pos > begin
        };
        if !digits(self) {
            return Err(self.error("rakam bekleniyordu"));
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            if !digits(self) {
                return Err(self.error("ondalık kısımda rakam yok"));
            }
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            if !digits(self) {
                return Err(self.error("üs kısmında rakam yok"));
            }
        }
        let raw = std::str::from_utf8(&self.bytes[start..self.pos]).map_err(|e| e.to_string())?;
        raw.parse::<f64>()
            .map(Json::Number)
            .map_err(|_| self.error("geçersiz sayı"))
    }

    fn hex4(&mut self) -> Result<u32, String> {
        let slice = self
            .bytes
            .get(self.pos..self.pos + 4)
            .ok_or_else(|| self.error("eksik \\u kaçışı"))?;
        let text = std::str::from_utf8(slice).map_err(|e| e.to_string())?;
        let code = u32::from_str_radix(text, 16).map_err(|_| self.error("geçersiz \\u kaçışı"))?;
        self.pos += 4;
        Ok(code)
    }

    fn string(&mut self) -> Result<String, String> {
        self.expect(b'"')?;
        let mut out: Vec<u8> = Vec::new();
        loop {
            let byte = self.peek().ok_or_else(|| self.error("kapanmamış metin"))?;
            self.pos += 1;
            match byte {
                b'"' => break,
                b'\\' => {
                    let escape = self.peek().ok_or_else(|| self.error("yarım kaçış"))?;
                    self.pos += 1;
                    let ch = match escape {
                        b'"' => '"',
                        b'\\' => '\\',
                        b'/' => '/',
                        b'b' => '\u{8}',
                        b'f' => '\u{c}',
                        b'n' => '\n',
                        b'r' => '\r',
                        b't' => '\t',
                        b'u' => self.unicode_escape()?,
                        _ => return Err(self.error("bilinmeyen kaçış")),
                    };
                    let mut buffer = [0u8; 4];
                    out.extend_from_slice(ch.encode_utf8(&mut buffer).as_bytes());
                }
                byte if byte < 0x20 => return Err(self.error("metinde kontrol karakteri")),
                byte => out.push(byte), // UTF-8 baytları olduğu gibi kopyalanır
            }
        }
        String::from_utf8(out).map_err(|_| self.error("geçersiz UTF-8"))
    }

    fn unicode_escape(&mut self) -> Result<char, String> {
        let high = self.hex4()?;
        if (0xD800..0xDC00).contains(&high) {
            // Vekil çift: \uD83D\uDE00 gibi iki parçadan tek karakter.
            if !self.bytes[self.pos..].starts_with(b"\\u") {
                return Err(self.error("vekil çiftin ikinci yarısı yok"));
            }
            self.pos += 2;
            let low = self.hex4()?;
            if !(0xDC00..0xE000).contains(&low) {
                return Err(self.error("geçersiz vekil çift"));
            }
            let code = 0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00);
            return char::from_u32(code).ok_or_else(|| self.error("geçersiz kod noktası"));
        }
        char::from_u32(high).ok_or_else(|| self.error("tek başına vekil karakter"))
    }

    fn array(&mut self) -> Result<Json, String> {
        self.expect(b'[')?;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(Json::Array(items));
        }
        loop {
            items.push(self.value()?);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(Json::Array(items));
                }
                _ => return Err(self.error("',' ya da ']' bekleniyordu")),
            }
        }
    }

    fn object(&mut self) -> Result<Json, String> {
        self.expect(b'{')?;
        let mut map = BTreeMap::new();
        self.skip_whitespace();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(Json::Object(map));
        }
        loop {
            self.skip_whitespace();
            let key = self.string()?;
            self.skip_whitespace();
            self.expect(b':')?;
            let value = self.value()?;
            map.insert(key, value);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(Json::Object(map));
                }
                _ => return Err(self.error("',' ya da '}' bekleniyordu")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gidis_donus_kacislar_ve_unicode() {
        let text = r#"{"ad":"Çağrı \"ş\"\n","dizi":[1,2.5,-3e2,true,null],"emoji":"\ud83d\ude00","ic":{}}"#;
        let value = parse(text).unwrap();
        assert_eq!(value.get("ad").unwrap().as_str(), Some("Çağrı \"ş\"\n"));
        assert_eq!(value.get("emoji").unwrap().as_str(), Some("😀"));
        let again = parse(&value.render()).unwrap();
        assert_eq!(value, again);
        assert_eq!(
            value.get("dizi").unwrap().render(),
            "[1,2.5,-300,true,null]"
        );
    }

    #[test]
    fn anahtarlar_sirali_yazilir() {
        let value = Json::object([("b", Json::from(1u32)), ("a", Json::from("x"))]);
        assert_eq!(value.render(), r#"{"a":"x","b":1}"#);
        assert_eq!(Json::from("a\u{1}").render(), "\"a\\u0001\"");
    }

    #[test]
    fn hatali_girdiler_konumla_reddedilir() {
        for bad in [
            "[1,]",
            "{\"a\" 1}",
            "\"kapanmadı",
            "01x",
            "tru",
            "{\"a\":1} fazla",
            "\"\\ud83d\"",
        ] {
            let error = parse(bad).unwrap_err();
            assert!(error.contains("JSON hatası"), "{bad}: {error}");
        }
    }
}
