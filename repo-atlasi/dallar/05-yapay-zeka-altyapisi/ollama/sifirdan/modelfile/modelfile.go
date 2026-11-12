// Package modelfile, Dockerfile benzeri Modelfile biçimini ayrıştırır.
//
//	FROM ./agirliklar.txt
//	PARAMETER temperature 0.7
//	PARAMETER stop "<|user|>"
//	SYSTEM """Kısa cevap ver."""
//	TEMPLATE """{{ range .Messages }}...{{ end }}"""
//
// Gerçek karşılığı: parser/parser.go (rune rune ilerleyen bir durum makinesi). Buradaki sürüm satır
// tabanlıdır; üçlü tırnaklı değerler için gerektiğinde sonraki satırları okur.
package modelfile

import (
	"bufio"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

type Message struct {
	Role    string
	Content string
}

type Modelfile struct {
	From       string
	Parameters map[string][]string // stop gibi parametreler birden çok kez yazılabilir
	Template   string
	System     string
	License    string
	Messages   []Message
}

type ParseError struct {
	Line int
	Msg  string
}

func (e *ParseError) Error() string { return fmt.Sprintf("satır %d: %s", e.Line, e.Msg) }

// ParamKinds bilinen parametreler ve tipleri. Bilinmeyen parametre hata verir (gerçekte de öyle).
var ParamKinds = map[string]string{
	"temperature": "float", "top_k": "int", "top_p": "float", "seed": "int",
	"num_predict": "int", "num_ctx": "int", "stop": "string",
}

func Parse(r io.Reader) (*Modelfile, error) {
	mf := &Modelfile{Parameters: map[string][]string{}}
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 4*1024*1024)
	line := 0
	for sc.Scan() {
		line++
		text := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "\uFEFF"))
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		start := line
		cmd, rest := splitWord(text)
		cmd = strings.ToLower(cmd)
		if cmd == "parameter" || cmd == "message" {
			var key string
			key, rest = splitWord(rest)
			if key == "" {
				return nil, &ParseError{start, cmd + " için ad eksik"}
			}
			val, err := readValue(rest, sc, &line)
			if err != nil {
				return nil, &ParseError{start, err.Error()}
			}
			if cmd == "message" {
				if key != "system" && key != "user" && key != "assistant" {
					return nil, &ParseError{start, "MESSAGE rolü system, user veya assistant olmalı"}
				}
				mf.Messages = append(mf.Messages, Message{key, val})
				continue
			}
			key = strings.ToLower(key)
			if _, ok := ParamKinds[key]; !ok {
				return nil, &ParseError{start, fmt.Sprintf("bilinmeyen parametre %q", key)}
			}
			mf.Parameters[key] = append(mf.Parameters[key], val)
			continue
		}
		val, err := readValue(rest, sc, &line)
		if err != nil {
			return nil, &ParseError{start, err.Error()}
		}
		switch cmd {
		case "from":
			mf.From = val
		case "template":
			mf.Template = val
		case "system":
			mf.System = val
		case "license":
			mf.License = val
		default:
			return nil, &ParseError{start, fmt.Sprintf("bilinmeyen komut %q (FROM, PARAMETER, TEMPLATE, SYSTEM, LICENSE, MESSAGE)", cmd)}
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if mf.From == "" {
		return nil, &ParseError{line, "FROM satırı yok"}
	}
	return mf, nil
}

func splitWord(s string) (string, string) {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, " \t"); i >= 0 {
		return s[:i], strings.TrimSpace(s[i+1:])
	}
	return s, ""
}

// readValue tek satırlık, "tırnaklı" ya da """çok satırlı""" bir değeri okur.
func readValue(rest string, sc *bufio.Scanner, line *int) (string, error) {
	if strings.HasPrefix(rest, `"""`) {
		body := rest[3:]
		for !strings.Contains(body, `"""`) {
			if !sc.Scan() {
				return "", fmt.Errorf(`kapanmamış """`)
			}
			*line++
			body += "\n" + sc.Text()
		}
		i := strings.Index(body, `"""`)
		if strings.TrimSpace(body[i+3:]) != "" {
			return "", fmt.Errorf(`kapanan """ sonrasında fazladan metin`)
		}
		return body[:i], nil
	}
	if strings.HasPrefix(rest, `"`) {
		v, err := strconv.Unquote(rest)
		if err != nil {
			return "", fmt.Errorf("tırnaklı değer bozuk: %s", rest)
		}
		return v, nil
	}
	if rest == "" {
		return "", fmt.Errorf("değer eksik")
	}
	return rest, nil
}

// Options, metin parametreleri tipli değerlere çevirir (stop her zaman liste).
func Options(params map[string][]string) (map[string]any, error) {
	out := map[string]any{}
	for k, vals := range params {
		switch ParamKinds[k] {
		case "string":
			out[k] = append([]string(nil), vals...)
		case "int":
			n, err := strconv.Atoi(vals[len(vals)-1])
			if err != nil {
				return nil, fmt.Errorf("%s tam sayı olmalı: %w", k, err)
			}
			out[k] = n
		case "float":
			f, err := strconv.ParseFloat(vals[len(vals)-1], 64)
			if err != nil {
				return nil, fmt.Errorf("%s ondalık sayı olmalı: %w", k, err)
			}
			out[k] = f
		}
	}
	return out, nil
}

func quoteIfNeeded(v string) string {
	if v == "" || strings.ContainsAny(v, " \t\n\"\\") {
		return strconv.Quote(v)
	}
	return v
}

// String, Modelfile'ı yeniden metne çevirir (/api/show "modelfile" alanı için).
func (mf *Modelfile) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "FROM %s\n", mf.From)
	if mf.Template != "" {
		fmt.Fprintf(&b, "TEMPLATE \"\"\"%s\"\"\"\n", mf.Template)
	}
	if mf.System != "" {
		fmt.Fprintf(&b, "SYSTEM \"\"\"%s\"\"\"\n", mf.System)
	}
	keys := make([]string, 0, len(mf.Parameters))
	for k := range mf.Parameters {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		for _, v := range mf.Parameters[k] {
			fmt.Fprintf(&b, "PARAMETER %s %s\n", k, quoteIfNeeded(v))
		}
	}
	for _, m := range mf.Messages {
		fmt.Fprintf(&b, "MESSAGE %s %s\n", m.Role, strconv.Quote(m.Content))
	}
	if mf.License != "" {
		fmt.Fprintf(&b, "LICENSE \"\"\"%s\"\"\"\n", mf.License)
	}
	return b.String()
}
