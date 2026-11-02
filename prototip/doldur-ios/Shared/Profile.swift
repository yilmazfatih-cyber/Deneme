import Foundation

/// Kullanıcının kendi bilgilerinden bir alan (ör. "E-posta").
/// `synonyms` ekrandaki etiketle eşleşmek için, `contentTypes` iOS `UITextContentType` ham değerleriyle,
/// `autocomplete` web formlarındaki HTML `autocomplete` değerleriyle eşleşmek içindir.
struct ProfileField: Codable, Identifiable, Hashable {
    var id: String { key }
    var key: String
    var label: String
    var value: String
    var synonyms: [String]
    var contentTypes: [String] = []
    var autocomplete: [String] = []
    /// Hassas alanlar klavyede maskeli görünür ve hiçbir koşulda buluta gönderilmez.
    var isSensitive: Bool = false

    /// Klavyede gösterilecek önizleme (hassas alanlarda yalnızca son 4 karakter).
    var preview: String {
        guard isSensitive, value.count > 4 else { return value }
        return "•••• " + String(value.suffix(4))
    }
}

struct Profile: Codable, Hashable {
    var fields: [ProfileField]

    func field(_ key: String) -> ProfileField? { fields.first { $0.key == key } }

    /// İlk açılışta gelen boş şablon. Kullanıcı yalnızca değerleri doldurur.
    static let template = Profile(fields: [
        ProfileField(key: "adSoyad", label: "Ad Soyad", value: "",
                     synonyms: ["ad soyad", "adi soyadi", "adiniz soyadiniz", "isim soyisim", "ad ve soyad", "full name", "name"],
                     contentTypes: ["name"], autocomplete: ["name"]),
        ProfileField(key: "ad", label: "Ad", value: "",
                     synonyms: ["ad", "adi", "adiniz", "isim", "isminiz", "first name"],
                     contentTypes: ["givenName"], autocomplete: ["given-name"]),
        ProfileField(key: "soyad", label: "Soyad", value: "",
                     synonyms: ["soyad", "soyadi", "soyadiniz", "soyisim", "last name", "surname"],
                     contentTypes: ["familyName"], autocomplete: ["family-name"]),
        ProfileField(key: "tckn", label: "T.C. Kimlik No", value: "",
                     synonyms: ["tc kimlik no", "tc kimlik", "t c kimlik no", "tckn", "kimlik no", "kimlik numarasi", "tc no"],
                     isSensitive: true),
        ProfileField(key: "dogumTarihi", label: "Doğum tarihi", value: "",
                     synonyms: ["dogum tarihi", "dogum tarihiniz", "birth date", "date of birth"],
                     contentTypes: ["birthdate"], autocomplete: ["bday"]),
        ProfileField(key: "telefon", label: "Telefon", value: "",
                     synonyms: ["telefon", "telefon no", "telefon numarasi", "cep telefonu", "gsm", "cep", "phone", "mobile"],
                     contentTypes: ["telephoneNumber"], autocomplete: ["tel", "tel-national"]),
        ProfileField(key: "eposta", label: "E-posta", value: "",
                     synonyms: ["e posta", "eposta", "e posta adresi", "email", "e mail", "mail", "mail adresi"],
                     contentTypes: ["emailAddress"], autocomplete: ["email"]),
        ProfileField(key: "adres", label: "Adres", value: "",
                     synonyms: ["adres", "acik adres", "teslimat adresi", "fatura adresi", "address"],
                     contentTypes: ["fullStreetAddress", "streetAddressLine1"],
                     autocomplete: ["street-address", "address-line1"]),
        ProfileField(key: "il", label: "İl", value: "",
                     synonyms: ["il", "sehir", "city", "province"],
                     contentTypes: ["addressState"], autocomplete: ["address-level1"]),
        ProfileField(key: "ilce", label: "İlçe", value: "",
                     synonyms: ["ilce", "semt", "district"],
                     contentTypes: ["addressCity"], autocomplete: ["address-level2"]),
        ProfileField(key: "postaKodu", label: "Posta kodu", value: "",
                     synonyms: ["posta kodu", "postakodu", "zip", "zip code", "postal code"],
                     contentTypes: ["postalCode"], autocomplete: ["postal-code"]),
        ProfileField(key: "sirket", label: "Şirket", value: "",
                     synonyms: ["sirket", "sirket adi", "firma", "firma adi", "kurum", "company"],
                     contentTypes: ["organizationName"], autocomplete: ["organization"]),
        ProfileField(key: "unvan", label: "Unvan", value: "",
                     synonyms: ["unvan", "gorev", "pozisyon", "job title"],
                     contentTypes: ["jobTitle"], autocomplete: ["organization-title"]),
        ProfileField(key: "vergiNo", label: "Vergi no", value: "",
                     synonyms: ["vergi no", "vergi numarasi", "vkn"], isSensitive: true),
        ProfileField(key: "iban", label: "IBAN", value: "",
                     synonyms: ["iban", "iban no", "hesap no"], isSensitive: true),
        ProfileField(key: "plaka", label: "Araç plakası", value: "",
                     synonyms: ["plaka", "arac plakasi", "plaka no"]),
    ])
}
