package store

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"miniollama/api"
)

// RegistryHandler bir Store'u OCI dağıtım API'sinin küçük bir alt kümesiyle sunar:
//
//	GET /v2/{ad alanı}/{model}/manifests/{etiket}
//	GET /v2/{ad alanı}/{model}/blobs/{özet}
//
// Gerçek istemci tarafı: server/images.go (pullModelManifest, PullModel) ve server/download.go.
func RegistryHandler(s *Store) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v2/{ns}/{model}/manifests/{tag}", func(w http.ResponseWriter, r *http.Request) {
		n := Name{DefaultHost, r.PathValue("ns"), r.PathValue("model"), r.PathValue("tag")}
		_, data, err := s.ReadManifest(n)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", MediaTypeManifest)
		w.Write(data)
	})
	mux.HandleFunc("GET /v2/{ns}/{model}/blobs/{digest}", func(w http.ResponseWriter, r *http.Request) {
		p, err := s.BlobPath(r.PathValue("digest"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.ServeFile(w, r, p)
	})
	return mux
}

// Pull, modeli bir kayıt defterinden (registry) indirir: önce manifest, sonra eksik blob'lar.
// Her blob özetiyle doğrulanır; manifest en son yazılır, böylece yarım çekme "kurulu" görünmez.
func (s *Store) Pull(ctx context.Context, baseURL, name string, fn func(api.ProgressResponse)) error {
	n, err := ParseName(name)
	if err != nil {
		return err
	}
	fn(api.ProgressResponse{Status: "pulling manifest"})
	data, err := get(ctx, baseURL, "v2", n.Namespace, n.Model, "manifests", n.Tag)
	if err != nil {
		return err
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return fmt.Errorf("manifest çözülemedi: %w", err)
	}
	for _, l := range append([]Layer{m.Config}, m.Layers...) {
		status := api.ProgressResponse{Status: "pulling " + l.Digest[7:19], Digest: l.Digest, Total: l.Size}
		if s.HasBlob(l.Digest) { // içerik adresli depo: aynı blob ikinci kez inmez
			status.Completed = l.Size
			fn(status)
			continue
		}
		fn(status)
		if err := s.download(ctx, baseURL, n, l); err != nil {
			return err
		}
		status.Completed = l.Size
		fn(status)
	}
	fn(api.ProgressResponse{Status: "verifying sha256 digest"}) // PutBlob indirirken doğruladı
	fn(api.ProgressResponse{Status: "writing manifest"})
	if err := s.WriteManifestRaw(n, data); err != nil {
		return err
	}
	fn(api.ProgressResponse{Status: "success"})
	return nil
}

func (s *Store) download(ctx context.Context, baseURL string, n Name, l Layer) error {
	resp, err := request(ctx, baseURL, "v2", n.Namespace, n.Model, "blobs", l.Digest)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, err = s.PutBlob(resp.Body, l.Digest)
	return err
}

func request(ctx context.Context, baseURL string, parts ...string) (*http.Response, error) {
	u, err := url.JoinPath(baseURL, parts...)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("%w: kayıt defterinde yok (%s)", ErrNotFound, u)
		}
		return nil, fmt.Errorf("kayıt defteri %s döndü: %s", resp.Status, u)
	}
	return resp, nil
}

func get(ctx context.Context, baseURL string, parts ...string) ([]byte, error) {
	resp, err := request(ctx, baseURL, parts...)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(io.LimitReader(resp.Body, 4<<20))
}
