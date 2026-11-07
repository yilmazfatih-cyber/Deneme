package core

// ValidVKN checks a Turkish tax identification number (Vergi Kimlik No):
// 10 digits with the Revenue Administration checksum.
func ValidVKN(s string) bool {
	if len(s) != 10 || !allDigits(s) {
		return false
	}
	sum := 0
	for i := 0; i < 9; i++ {
		d := int(s[i] - '0')
		tmp := (d + 9 - i) % 10
		v := (tmp << uint(9-i)) % 9
		if tmp != 0 && v == 0 {
			v = 9
		}
		sum += v
	}
	return (10-sum%10)%10 == int(s[9]-'0')
}

// ValidTCKN checks a Turkish national identity number: 11 digits, no leading
// zero, digits 10 and 11 are checksums.
func ValidTCKN(s string) bool {
	if len(s) != 11 || !allDigits(s) || s[0] == '0' {
		return false
	}
	d := func(i int) int { return int(s[i] - '0') }
	odd := d(0) + d(2) + d(4) + d(6) + d(8)
	even := d(1) + d(3) + d(5) + d(7)
	c10 := ((odd*7-even)%10 + 10) % 10
	if c10 != d(9) {
		return false
	}
	total := 0
	for i := 0; i < 10; i++ {
		total += d(i)
	}
	return total%10 == d(10)
}

// ValidMERSIS checks the format of a MERSİS number: 16 digits starting with 0.
// MERSİS has no publicly documented checksum, so only the format is checked.
func ValidMERSIS(s string) bool { return len(s) == 16 && allDigits(s) && s[0] == '0' }

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}
