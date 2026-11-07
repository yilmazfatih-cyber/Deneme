package notify

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// Turkey observes UTC+3 all year (TRT); a fixed zone avoids depending on tzdata.
var trt = time.FixedZone("TRT", 3*60*60)

var emailTexts = map[string][2]string{
	core.EventEntityStatusChanged: {"Firma başvurunuzun durumu değişti", "Firma kaydınızın doğrulama durumu güncellendi."},
	core.EventNumberStatusChanged: {"Numaranızın durumu değişti", "Kayıtlı numaralarınızdan birinin durumu güncellendi."},
	core.EventBrandingReviewed:    {"Marka görünümü incelemesi tamamlandı", "Arayan ekranında gösterilecek marka bilginiz incelendi."},
	core.EventReputationLabel:     {"Numaranızın itibar etiketi değişti", "Numaranızın arama itibarı etiketi güncellendi."},
	core.EventDisputeCreated:      {"İtiraz kaydınız alındı", "İtiraz talebiniz kayda alındı ve incelemeye alınacak."},
	core.EventDisputeUpdated:      {"İtiraz kaydınız güncellendi", "İtiraz talebinizin durumu güncellendi."},
	core.EventCertificateIssued:   {"Yeni sertifikanız düzenlendi", "Firmanız için yeni bir STIR/SHAKEN yetki sertifikası düzenlendi."},
}

// renderEmail returns the Turkish subject and plain-text body for e.
func renderEmail(e core.Event, operator string) (subject, body string) {
	t, ok := emailTexts[e.Type]
	if !ok {
		t = [2]string{"Enumaracle bildirimi", "Hesabınızla ilgili yeni bir bildirim var."}
	}
	if operator == "" {
		operator = "Enumaracle"
	}
	var b strings.Builder
	b.WriteString("Merhaba,\n\n")
	b.WriteString(t[1])
	b.WriteString("\n\n")
	fmt.Fprintf(&b, "Olay: %s\n", e.Type)
	fmt.Fprintf(&b, "Zaman: %s (TSİ)\n", e.At.In(trt).Format("02.01.2006 15:04"))
	if details := eventDetails(e.Data); len(details) > 0 {
		b.WriteString("\nAyrıntılar:\n")
		for _, d := range details {
			b.WriteString("  - ")
			b.WriteString(d)
			b.WriteString("\n")
		}
	}
	b.WriteString("\nAyrıntıları Enumaracle portalında görebilirsiniz.\n\n")
	b.WriteString("Saygılarımızla,\n")
	b.WriteString(operator)
	b.WriteString("\n")
	return "[Enumaracle] " + t[0], b.String()
}

// eventDetails lists the scalar top-level fields of the event data, sorted.
func eventDetails(data any) []string {
	if data == nil {
		return nil
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return nil
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return nil
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var out []string
	for _, k := range keys {
		var v string
		switch x := m[k].(type) {
		case string:
			if x == "" {
				continue
			}
			v = x
		case float64:
			v = fmt.Sprint(x)
		case bool:
			v = map[bool]string{true: "evet", false: "hayır"}[x]
		default:
			continue
		}
		if r := []rune(v); len(r) > 200 {
			v = string(r[:200]) + "…"
		}
		out = append(out, k+": "+v)
		if len(out) == 20 {
			break
		}
	}
	return out
}
