// Package store, modelleri içerik adresli (content-addressed) olarak diskte tutar:
//
//	<kök>/blobs/sha256-<64 hex>                         değişmez içerik (ağırlık, şablon, sistem istemi, parametreler)
//	<kök>/manifests/<host>/<ad alanı>/<model>/<etiket>    hangi blob'ların bir modeli oluşturduğunu söyleyen JSON
//
// Gerçek karşılığı: manifest/ (manifest.go, layer.go, paths.go) ve server/images.go.
// Aynı blob'u kullanan iki model diski iki kez harcamaz; silmede referansı kalmayan blob'lar toplanır.
package store

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"miniollama/modelfile"
)

const (
	MediaTypeManifest = "application/vnd.docker.distribution.manifest.v2+json"
	MediaTypeConfig   = "application/vnd.docker.container.image.v1+json"
	MediaTypeModel    = "application/vnd.ollama.image.model"
	MediaTypeTemplate = "application/vnd.ollama.image.template"
	MediaTypeSystem   = "application/vnd.ollama.image.system"
	MediaTypeParams   = "application/vnd.ollama.image.params"
	MediaTypeLicense  = "application/vnd.ollama.image.license"

	DefaultHost      = "kayit.yerel" // gerçekte registry.ollama.ai
	DefaultNamespace = "library"
	DefaultTag       = "latest"
)

var (
	ErrNotFound       = errors.New("model bulunamadı")
	ErrDigestMismatch = errors.New("sha256 özeti uyuşmuyor")
	digestRe          = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	partRe            = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$`)
)

type Layer struct {
	MediaType string `json:"mediaType"`
	Digest    string `json:"digest"`
	Size      int64  `json:"size"`
}

type Manifest struct {
	SchemaVersion int     `json:"schemaVersion"`
	MediaType     string  `json:"mediaType"`
	Config        Layer   `json:"config"`
	Layers        []Layer `json:"layers"`
}

// Name: [host/][ad alanı/]model[:etiket]
type Name struct{ Host, Namespace, Model, Tag string }

func ParseName(s string) (Name, error) {
	n := Name{Host: DefaultHost, Namespace: DefaultNamespace, Tag: DefaultTag}
	if i := strings.LastIndex(s, ":"); i > strings.LastIndex(s, "/") {
		s, n.Tag = s[:i], s[i+1:]
	}
	parts := strings.Split(s, "/")
	switch len(parts) {
	case 1:
		n.Model = parts[0]
	case 2:
		n.Namespace, n.Model = parts[0], parts[1]
	case 3:
		n.Host, n.Namespace, n.Model = parts[0], parts[1], parts[2]
	default:
		return Name{}, fmt.Errorf("geçersiz model adı %q", s)
	}
	for _, p := range []string{n.Host, n.Namespace, n.Model, n.Tag} {
		if !partRe.MatchString(p) {
			return Name{}, fmt.Errorf("geçersiz model adı parçası %q", p)
		}
	}
	return n, nil
}

func (n Name) String() string { return fmt.Sprintf("%s/%s/%s:%s", n.Host, n.Namespace, n.Model, n.Tag) }

// Short varsayılan parçaları atar: "kayit.yerel/library/turkce:latest" -> "turkce:latest"
func (n Name) Short() string {
	s := n.Model + ":" + n.Tag
	if n.Namespace != DefaultNamespace || n.Host != DefaultHost {
		s = n.Namespace + "/" + s
	}
	if n.Host != DefaultHost {
		s = n.Host + "/" + s
	}
	return s
}

type Store struct{ Root string }

func New(root string) (*Store, error) {
	for _, d := range []string{"blobs", "manifests"} {
		if err := os.MkdirAll(filepath.Join(root, d), 0o755); err != nil {
			return nil, err
		}
	}
	return &Store{Root: root}, nil
}

func (s *Store) BlobPath(digest string) (string, error) {
	if !digestRe.MatchString(digest) {
		return "", fmt.Errorf("geçersiz özet %q", digest)
	}
	return filepath.Join(s.Root, "blobs", strings.Replace(digest, ":", "-", 1)), nil
}

func (s *Store) HasBlob(digest string) bool {
	p, err := s.BlobPath(digest)
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

// PutBlob içeriği geçici dosyaya yazarken özetini hesaplar; want boş değilse karşılaştırır.
// Dosya ancak özet doğruysa nihai adına taşınır: yarım ya da bozuk indirme asla "var" görünmez.
func (s *Store) PutBlob(r io.Reader, want string) (Layer, error) {
	tmp, err := os.CreateTemp(filepath.Join(s.Root, "blobs"), "yukleniyor-*")
	if err != nil {
		return Layer{}, err
	}
	defer os.Remove(tmp.Name())
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, h), r)
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return Layer{}, err
	}
	digest := "sha256:" + hex.EncodeToString(h.Sum(nil))
	if want != "" && digest != want {
		return Layer{}, fmt.Errorf("%w: beklenen %s, gelen %s", ErrDigestMismatch, want, digest)
	}
	p, _ := s.BlobPath(digest)
	if err := os.Rename(tmp.Name(), p); err != nil {
		return Layer{}, err
	}
	return Layer{Digest: digest, Size: n}, nil
}

func (s *Store) ReadBlob(digest string) ([]byte, error) {
	p, err := s.BlobPath(digest)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p)
}

func (s *Store) manifestPath(n Name) string {
	return filepath.Join(s.Root, "manifests", n.Host, n.Namespace, n.Model, n.Tag)
}

func (s *Store) WriteManifest(n Name, m Manifest) error {
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return s.WriteManifestRaw(n, data)
}

func (s *Store) WriteManifestRaw(n Name, data []byte) error {
	p := s.manifestPath(n)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

// ReadManifest manifesti ve ham baytlarını döndürür (modelin özeti = ham baytların sha256'sı).
func (s *Store) ReadManifest(n Name) (*Manifest, []byte, error) {
	data, err := os.ReadFile(s.manifestPath(n))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil, fmt.Errorf("%w: %s", ErrNotFound, n.Short())
	} else if err != nil {
		return nil, nil, err
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, nil, err
	}
	return &m, data, nil
}

type Entry struct {
	Name     Name
	Manifest *Manifest
	Digest   string
	ModTime  time.Time
}

func (s *Store) List() ([]Entry, error) {
	root := filepath.Join(s.Root, "manifests")
	var out []Entry
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(root, p)
		parts := strings.Split(filepath.ToSlash(rel), "/")
		if len(parts) != 4 {
			return nil
		}
		n := Name{parts[0], parts[1], parts[2], parts[3]}
		m, data, err := s.ReadManifest(n)
		if err != nil {
			return err
		}
		info, _ := d.Info()
		sum := sha256.Sum256(data)
		out = append(out, Entry{n, m, hex.EncodeToString(sum[:]), info.ModTime()})
		return nil
	})
	return out, err
}

// Delete manifesti siler, sonra hiçbir manifestin göstermediği blob'ları toplar (çöp toplama).
func (s *Store) Delete(n Name) error {
	if _, _, err := s.ReadManifest(n); err != nil {
		return err
	}
	if err := os.Remove(s.manifestPath(n)); err != nil {
		return err
	}
	entries, err := s.List()
	if err != nil {
		return err
	}
	used := map[string]bool{}
	for _, e := range entries {
		used[e.Manifest.Config.Digest] = true
		for _, l := range e.Manifest.Layers {
			used[l.Digest] = true
		}
	}
	files, err := os.ReadDir(filepath.Join(s.Root, "blobs"))
	if err != nil {
		return err
	}
	for _, f := range files {
		digest := strings.Replace(f.Name(), "-", ":", 1)
		if digestRe.MatchString(digest) && !used[digest] {
			os.Remove(filepath.Join(s.Root, "blobs", f.Name()))
		}
	}
	return nil
}

// Model, sunucunun ihtiyaç duyduğu çözülmüş görünümdür.
type Model struct {
	Name      Name
	Digest    string
	Size      int64
	ModelPath string
	Template  string
	System    string
	License   string
	Params    map[string]any
	RawParams map[string][]string
	ModTime   time.Time
}

func (s *Store) GetModel(name string) (*Model, error) {
	n, err := ParseName(name)
	if err != nil {
		return nil, err
	}
	m, data, err := s.ReadManifest(n)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(data)
	out := &Model{Name: n, Digest: hex.EncodeToString(sum[:]), Params: map[string]any{}, RawParams: map[string][]string{}}
	if fi, err := os.Stat(s.manifestPath(n)); err == nil {
		out.ModTime = fi.ModTime()
	}
	for _, l := range m.Layers {
		out.Size += l.Size
		switch l.MediaType {
		case MediaTypeModel:
			out.ModelPath, _ = s.BlobPath(l.Digest)
			continue
		}
		data, err := s.ReadBlob(l.Digest)
		if err != nil {
			return nil, err
		}
		switch l.MediaType {
		case MediaTypeTemplate:
			out.Template = string(data)
		case MediaTypeSystem:
			out.System = string(data)
		case MediaTypeLicense:
			out.License = string(data)
		case MediaTypeParams:
			if err := json.Unmarshal(data, &out.RawParams); err != nil {
				return nil, err
			}
			if out.Params, err = modelfile.Options(out.RawParams); err != nil {
				return nil, err
			}
		}
	}
	if out.ModelPath == "" {
		return nil, fmt.Errorf("%s: model katmanı yok", n.Short())
	}
	return out, nil
}

// Create, ayrıştırılmış bir Modelfile'dan model oluşturur. FROM ya yerel bir model adıdır (katmanları
// miras alınır) ya da baseDir'e göre bir dosya yoludur (ağırlık blob'u olur).
// Gerçekte CLI Modelfile'ı ayrıştırıp dosyaları /api/blobs/:digest ile yükler, sonra /api/create çağırır.
func (s *Store) Create(name string, mf *modelfile.Modelfile, baseDir string) (Name, error) {
	n, err := ParseName(name)
	if err != nil {
		return Name{}, err
	}
	kept := map[string]Layer{}
	params := map[string][]string{}
	if base, err := ParseName(mf.From); err == nil {
		if bm, _, err := s.ReadManifest(base); err == nil {
			for _, l := range bm.Layers {
				kept[l.MediaType] = l
			}
			if pl, ok := kept[MediaTypeParams]; ok {
				data, err := s.ReadBlob(pl.Digest)
				if err != nil {
					return Name{}, err
				}
				if err := json.Unmarshal(data, &params); err != nil {
					return Name{}, err
				}
			}
		}
	}
	if _, ok := kept[MediaTypeModel]; !ok {
		path := mf.From
		if !filepath.IsAbs(path) {
			path = filepath.Join(baseDir, path)
		}
		f, err := os.Open(path)
		if err != nil {
			return Name{}, fmt.Errorf("FROM ne yerel bir model ne de okunabilir bir dosya: %w", err)
		}
		l, err := s.PutBlob(f, "")
		f.Close()
		if err != nil {
			return Name{}, err
		}
		l.MediaType = MediaTypeModel
		kept[MediaTypeModel] = l
	}
	putText := func(mediaType, text string) error {
		if text == "" {
			return nil
		}
		l, err := s.PutBlob(strings.NewReader(text), "")
		l.MediaType = mediaType
		kept[mediaType] = l
		return err
	}
	for k, v := range mf.Parameters { // yeni parametreler miras alınanların üstüne yazılır
		params[k] = v
	}
	if _, err := modelfile.Options(params); err != nil {
		return Name{}, err
	}
	paramsJSON, _ := json.Marshal(params)
	for _, err := range []error{
		putText(MediaTypeTemplate, mf.Template), putText(MediaTypeSystem, mf.System),
		putText(MediaTypeLicense, mf.License), putText(MediaTypeParams, string(paramsJSON)),
	} {
		if err != nil {
			return Name{}, err
		}
	}
	cfg, _ := json.Marshal(map[string]string{"model_format": "markov-metin", "model_family": "markov"})
	cl, err := s.PutBlob(strings.NewReader(string(cfg)), "")
	if err != nil {
		return Name{}, err
	}
	cl.MediaType = MediaTypeConfig
	m := Manifest{SchemaVersion: 2, MediaType: MediaTypeManifest, Config: cl}
	for _, mt := range []string{MediaTypeModel, MediaTypeTemplate, MediaTypeSystem, MediaTypeLicense, MediaTypeParams} {
		if l, ok := kept[mt]; ok {
			m.Layers = append(m.Layers, l)
		}
	}
	return n, s.WriteManifest(n, m)
}
