// `node --test tarayici/` bu dosyayı çalıştırır (package.json "main"); bütün testler buradan yüklenir.
// Genişletme: Yeni bir *.test.js dosyası eklediğinizde aşağıya bir import satırı ekleyin
// (tests/test_rules.py eksik satırı yakalar).
import './model.test.js'
import './sampler.test.js'
import './tokenizer.test.js'
