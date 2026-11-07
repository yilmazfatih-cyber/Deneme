package registry

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// DemoPassword is the password of the enterprise_owner demo users created by
// SeedDemo when an Accounts service is configured. Demo data only.
const DemoPassword = "Enumaracle-Demo-2026"

// VKNWithCheck appends the Revenue Administration check digit to a 9-digit prefix.
func VKNWithCheck(prefix9 string) string {
	for d := 0; d <= 9; d++ {
		v := prefix9 + strconv.Itoa(d)
		if core.ValidVKN(v) {
			return v
		}
	}
	return ""
}

type demoNumber struct {
	tn, start, end string
	useCase        core.UseCase
	reason         string
	brand          int // index into brands, -1 = none (entity default applies)
	status         core.NumberStatus
	confirmed      bool
}

type demoBrand struct {
	name, logo, reason string
	isDefault          bool
	status             core.BrandingStatus
	note               string
}

type demoEntity struct {
	in       EntityInput
	risk     string
	final    core.EntityStatus // pending, in_review, verified, rejected
	note     string
	docs     []core.DocumentKind
	brands   []demoBrand
	numbers  []demoNumber
	userMail string
}

func demoEntities() []demoEntity {
	return []demoEntity{
		{
			in: EntityInput{LegalName: "Anadolu Katılım Bankası A.Ş.", TradeName: "Anadolu Katılım", VKN: VKNWithCheck("068012345"),
				MERSIS: "0068012345600017", Sector: "Bankacılık ve finans", Website: "https://www.anadolukatilim.example",
				City: "İstanbul", ContactName: "Elif Yıldırım", ContactEmail: "uyum@anadolukatilim.example",
				ContactPhone: "0212 335 00 00", IYSRegistered: true},
			risk: "low", final: core.EntityVerified, note: "Vergi levhası, ticaret sicil gazetesi ve imza sirküleri doğrulandı.",
			docs: []core.DocumentKind{core.DocTaxCertificate, core.DocTradeRegistry, core.DocSignatureCircular, core.DocNumberAllocation},
			brands: []demoBrand{
				{name: "Anadolu Katılım", logo: "https://cdn.anadolukatilim.example/logo.png", reason: "Müşteri hizmetleri",
					isDefault: true, status: core.BrandingApproved, note: "Ticari unvanla uyumlu."},
				{name: "Anadolu Katılım Güvenlik", logo: "https://cdn.anadolukatilim.example/guvenlik.png",
					reason: "Kart güvenlik bildirimi", status: core.BrandingApproved, note: "Güvenlik hattı için uygun."},
			},
			numbers: []demoNumber{
				{tn: "+90 850 222 04 44", useCase: core.UseCustomerService, reason: "Müşteri hizmetleri", brand: -1, status: core.NumberActive, confirmed: true},
				{tn: "444 0 724", useCase: core.UseCustomerService, reason: "Müşteri hizmetleri", brand: -1, status: core.NumberActive, confirmed: true},
				{start: "0212 335 00 00", end: "0212 335 00 99", useCase: core.UseOTPCallback, reason: "Kart güvenlik bildirimi",
					brand: 1, status: core.NumberActive},
				{tn: "0532 100 00 01", useCase: core.UseCollections, reason: "Ödeme hatırlatma", brand: -1, status: core.NumberPending},
			},
			userMail: "uyum@anadolukatilim.example",
		},
		{
			in: EntityInput{LegalName: "Hızlıyol Kargo ve Lojistik A.Ş.", TradeName: "Hızlıyol Kargo", VKN: VKNWithCheck("461023456"),
				MERSIS: "0461023456700019", Sector: "Kargo ve lojistik", Website: "https://www.hizliyolkargo.example",
				City: "Ankara", ContactName: "Mehmet Kaya", ContactEmail: "operasyon@hizliyolkargo.example",
				ContactPhone: "0312 444 12 12", IYSRegistered: true},
			risk: "low", final: core.EntityVerified, note: "Kuruluş belgeleri ve numara tahsis yazısı doğrulandı.",
			docs: []core.DocumentKind{core.DocTaxCertificate, core.DocTradeRegistry, core.DocAuthorizationLetter},
			brands: []demoBrand{
				{name: "Hızlıyol Kargo", logo: "https://cdn.hizliyolkargo.example/logo.png", reason: "Kargonuz yola çıktı",
					isDefault: true, status: core.BrandingApproved, note: "Uygun."},
				{name: "Hızlıyol Kurye", logo: "https://cdn.hizliyolkargo.example/kurye.png", reason: "Teslimat randevusu",
					status: core.BrandingPending},
			},
			numbers: []demoNumber{
				{tn: "+90 850 333 00 00", useCase: core.UseDelivery, reason: "Kargonuz yola çıktı", brand: -1, status: core.NumberActive, confirmed: true},
				{tn: "444 5 678", useCase: core.UseCustomerService, reason: "Müşteri hizmetleri", brand: -1, status: core.NumberActive, confirmed: true},
				{tn: "0530 111 22 33", useCase: core.UseDelivery, reason: "Teslimat randevusu", brand: 1, status: core.NumberActive},
				{start: "0312 444 12 00", end: "0312 444 12 49", useCase: core.UseAppointment, reason: "Teslimat randevusu",
					brand: -1, status: core.NumberPending},
			},
			userMail: "operasyon@hizliyolkargo.example",
		},
		{
			in: EntityInput{LegalName: "Pazarsepeti Elektronik Ticaret A.Ş.", TradeName: "Pazarsepeti", VKN: VKNWithCheck("722034567"),
				MERSIS: "0722034567800012", Sector: "E-ticaret", Website: "https://www.pazarsepeti.example",
				City: "İzmir", ContactName: "Zeynep Demir", ContactEmail: "kurumsal@pazarsepeti.example",
				ContactPhone: "0532 444 55 66"},
			risk: "medium", final: core.EntityInReview,
			docs: []core.DocumentKind{core.DocTaxCertificate, core.DocTradeRegistry},
			brands: []demoBrand{
				{name: "Pazarsepeti", logo: "https://cdn.pazarsepeti.example/logo.png", reason: "Sipariş onayı",
					isDefault: true, status: core.BrandingPending},
			},
			numbers: []demoNumber{
				{tn: "+90 850 444 00 00", useCase: core.UseCustomerService, reason: "Sipariş onayı", brand: -1, status: core.NumberPending},
				{tn: "0232 444 00 00", useCase: core.UseSurvey, reason: "Memnuniyet anketi", brand: -1, status: core.NumberPending},
			},
			userMail: "kurumsal@pazarsepeti.example",
		},
		{
			in: EntityInput{LegalName: "Fırsat Çağrı Merkezi Hizmetleri Ltd. Şti.", TradeName: "Fırsat Çağrı", VKN: VKNWithCheck("389045678"),
				Sector: "Çağrı merkezi", City: "Bursa", ContactName: "Can Öztürk", ContactEmail: "info@firsatcagri.example",
				ContactPhone: "0224 999 00 00"},
			risk: "high", final: core.EntityRejected,
			note: "İmza sirküleri ve numara tahsis belgesi eksik; beyan edilen unvan ticaret sicil kaydıyla uyuşmuyor.",
			docs: []core.DocumentKind{core.DocTaxCertificate},
			brands: []demoBrand{
				{name: "Kampanya Hattı", reason: "Size özel fırsat", isDefault: true, status: core.BrandingRejected,
					note: "Görünen ad kuruluşu tanımlamıyor; ticari unvan veya marka adı kullanılmalı."},
			},
			numbers: []demoNumber{
				{tn: "+90 850 999 00 00", useCase: core.UseMarketing, reason: "Kampanya bilgilendirme", brand: -1, status: core.NumberPending},
			},
		},
	}
}

// SeedDemo creates realistic Turkish demo entities, documents, numbers and
// branding. It is idempotent: nothing happens if any entity already exists.
// Events are not published for seeded data.
func (s *Service) SeedDemo(ctx context.Context) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM entities`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	ctx = quiet(core.WithPrincipal(ctx, core.SystemPrincipal))
	for _, d := range demoEntities() {
		if err := s.seedEntity(ctx, d); err != nil {
			return fmt.Errorf("registry: seed %s: %w", d.in.LegalName, err)
		}
	}
	s.log.Info("registry: demo data seeded", "entities", len(demoEntities()))
	return nil
}

func (s *Service) seedEntity(ctx context.Context, d demoEntity) error {
	e, err := s.CreateEntity(ctx, d.in)
	if err != nil {
		return err
	}
	for _, k := range d.docs {
		sum := sha256.Sum256([]byte(e.ID + string(k)))
		if _, err := s.AddDocument(ctx, e.ID, DocumentInput{Kind: k, FileName: string(k) + ".pdf",
			MimeType: "application/pdf", SHA256: hex.EncodeToString(sum[:]), SizeBytes: 180_000 + int64(len(k))*1000}); err != nil {
			return err
		}
	}
	if d.final != core.EntityPending {
		if _, err := s.Submit(ctx, e.ID); err != nil {
			return err
		}
	}
	if d.final == core.EntityVerified || d.final == core.EntityRejected {
		if _, err := s.Transition(ctx, e.ID, DecisionInput{ToStatus: d.final, Note: d.note, RiskTier: d.risk}); err != nil {
			return err
		}
	}
	brandIDs := make([]string, len(d.brands))
	for i, b := range d.brands {
		br, err := s.CreateBranding(ctx, e.ID, BrandingInput{DisplayName: b.name, LogoURL: b.logo, CallReason: b.reason, IsDefault: b.isDefault})
		if err != nil {
			return err
		}
		brandIDs[i] = br.ID
		if b.status == core.BrandingApproved || b.status == core.BrandingRejected {
			if _, err := s.ReviewBranding(ctx, br.ID, ReviewInput{Status: b.status, Note: b.note}); err != nil {
				return err
			}
		}
	}
	for _, dn := range d.numbers {
		in := NumberInput{TN: dn.tn, RangeStart: dn.start, RangeEnd: dn.end, UseCase: dn.useCase, CallReason: dn.reason}
		if dn.brand >= 0 {
			in.BrandingID = brandIDs[dn.brand]
		}
		num, err := s.RegisterNumber(ctx, e.ID, in)
		if err != nil {
			return err
		}
		if dn.status == core.NumberActive {
			c := dn.confirmed
			if _, err := s.SetNumberStatus(ctx, num.ID, NumberStatusInput{Status: core.NumberActive, CarrierConfirmed: &c}); err != nil {
				return err
			}
		}
	}
	if s.accounts != nil && d.userMail != "" {
		if _, err := s.accounts.CreateUser(ctx, core.NewUser{Email: d.userMail, Name: d.in.ContactName,
			Password: DemoPassword, Role: core.RoleEnterpriseOwner, EntityID: e.ID}); err != nil {
			s.log.Warn("registry: demo user not created", "email", d.userMail, "err", err)
		} else {
			s.log.Info("registry: demo enterprise user created", "email", d.userMail, "entity", e.TradeName)
		}
	}
	return nil
}
