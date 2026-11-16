/**
 * API'nin kullanıcıya dönük Türkçe iletileri (tek sözlük). Hata kodlarının varsayılan iletileri
 * shared/src/errors.ts → ERROR_MESSAGES_TR içindedir; burada yalnız daha özel iletiler durur.
 * İleti kuralları: suçlamaz, kısa, ne yapılacağını söyler.
 *
 * Genişletme: yeni ileti eklerken anahtarı İngilizce, metni Türkçe yazın; kodda metni değil `MESSAGES.x` kullanın.
 */
export const MESSAGES = {
  // Gövde ve istek
  jsonRequired: 'İstek gövdesi JSON olmalı (Content-Type: application/json).',
  invalidJson: 'İstek gövdesi okunamadı: geçerli bir JSON gönderin.',
  crossSiteBlocked: 'İstek başka bir siteden geldiği için reddedildi. Uygulamayı kendi adresinden açın.',
  routeNotFound: 'Böyle bir adres yok. Uygulamayı güncelleyin ya da adresi denetleyin.',
  invalidId: 'Geçersiz kimlik.',

  // Kimlik
  commonPassword: 'Bu şifre çok yaygın ya da tahmin edilmesi kolay. Daha uzun ve size özgü bir şifre seçin.',
  passwordLikeIdentity: 'Şifre adınızı ya da e-postanızı içermesin.',
  noLetters: 'Şifrede en az bir harf olsun: yalnız rakamlı şifre (telefon, doğum tarihi) kolay tahmin edilir.',
  wrongCurrentPassword: 'Şu anki şifre hatalı.',
  sessionExpired: 'Oturumun süresi doldu. Yeniden giriş yapın.',

  // Çalışma alanları
  personalWorkspaceName: 'Kişisel',
  personalNotDeletable: 'Kişisel alan silinemez.',
  personalNotShareable: 'Kişisel alan paylaşılamaz. Paylaşmak için yeni bir ortak alan açın.',
  personalNotLeavable: 'Kişisel alandan ayrılamazsınız.',
  ownerOnly: 'Bu işlemi yalnız alanın sahibi yapabilir.',
  lastOwner: 'Alanın en az bir sahibi kalmalı. Önce başka bir üyeyi sahip yapın.',
  memberNotFound: 'Bu kişi alanın üyesi değil.',
  workspaceNotFound: 'Alan bulunamadı ya da artık üyesi değilsiniz.',
  unknownInviter: 'Bir üye',

  // Yönetim
  adminSelfLock: 'Kendi hesabınızın rolünü değiştiremez ya da onu kapatamazsınız.',
  userNotFound: 'Kullanıcı bulunamadı.',

  // Eşitleme
  mutationsOutOfOrder: 'Değişiklikler artan sıra numarasıyla gönderilmeli.',
} as const
