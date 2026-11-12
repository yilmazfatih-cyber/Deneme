package main

import (
	"strconv"
	"strings"
	"unicode"
)

// Slugify, GitHub'ın başlıklardan ürettiği bağlantı kimliğini taklit eder.
//
// GitHub başlığı küçültürken Unicode "tam" eşlemesini kullanır (onu taklit eden github-slugger
// paketi JavaScript'in toLowerCase'iyle): 'İ' harfi "i" + U+0307 (birleşen nokta) olur. Kodda bu
// dizi görünür olsun diye "\u0307" kaçışıyla yazıldı. Go'nun strings.ToLower'ı "basit" eşleme
// kullanır ve 'İ'yi düz "i" yapar; bu yüzden GitHub ile aynı sonucu almak için 'İ'yi
// elle çeviriyoruz. Sonra harf, işaret, rakam, '-' ve '_' dışındaki her şey atılır,
// boşluklar '-' olur: "C++" -> "c", "Data Ingestion / ETL" -> "data-ingestion--etl".
func Slugify(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r == 'İ' {
			b.WriteString("i\u0307")
			continue
		}
		r = unicode.ToLower(r)
		switch {
		case r == ' ':
			b.WriteRune('-')
		case r == '-' || r == '_' || unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsNumber(r):
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Slugger aynı başlık tekrar geldiğinde GitHub gibi -1, -2 soneki ekler.
type Slugger struct{ seen map[string]int }

// Slug benzersiz bir kimlik döndürür.
func (s *Slugger) Slug(text string) string {
	if s.seen == nil {
		s.seen = map[string]int{}
	}
	base := Slugify(text)
	id := base
	for {
		if _, ok := s.seen[id]; !ok {
			break
		}
		s.seen[base]++
		id = base + "-" + strconv.Itoa(s.seen[base])
	}
	s.seen[id] = 0
	return id
}
