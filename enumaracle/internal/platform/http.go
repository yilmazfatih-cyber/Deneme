package platform

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// SessionCookie is the name of the portal session cookie set by auth.
const SessionCookie = "enm_session"

// CSRFHeader must echo the session's CSRF token on unsafe methods when the caller is a portal user.
const CSRFHeader = "X-CSRF-Token"

// HandlerFunc is an HTTP handler that returns an error instead of writing one.
type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

// RouteInfo describes a registered route (used by the docs/OpenAPI conformance test).
type RouteInfo struct {
	Method, Path string
	Scope        core.Scope // "" = public
}

// Router wraps http.ServeMux (Go 1.22+ patterns) and applies request id,
// recovery, logging, metrics, authentication, CSRF and scope checks.
type Router struct {
	mux     *http.ServeMux
	auth    core.Authenticator
	log     *slog.Logger
	routes  []RouteInfo
	latency *prometheus.HistogramVec
}

func NewRouter(log *slog.Logger, reg *prometheus.Registry) *Router {
	r := &Router{mux: http.NewServeMux(), log: log}
	r.latency = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "enumaracle_http_request_duration_seconds",
		Help:    "HTTP request latency by route and status.",
		Buckets: []float64{.0005, .001, .0025, .005, .01, .025, .05, .1, .25, 1, 5},
	}, []string{"route", "status"})
	if reg != nil {
		reg.MustRegister(r.latency)
	}
	return r
}

// SetAuthenticator installs the authenticator (auth is constructed after the router).
func (r *Router) SetAuthenticator(a core.Authenticator) { r.auth = a }

// Routes returns every API route registered through Handle.
func (r *Router) Routes() []RouteInfo { return append([]RouteInfo(nil), r.routes...) }

// Handle registers an API route. scope "" makes it public; otherwise the
// caller must hold the scope. path uses ServeMux syntax, e.g. "/v1/admin/entities/{id}".
func (r *Router) Handle(method, path string, scope core.Scope, h HandlerFunc) {
	r.routes = append(r.routes, RouteInfo{method, path, scope})
	route := method + " " + path
	r.mux.Handle(route, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		p := core.PrincipalFrom(req.Context())
		if scope != "" {
			if p.Kind == "anonymous" {
				WriteError(w, req, core.Errorf(core.ErrUnauthorized, "kimlik doğrulaması gerekli"))
				return
			}
			if !p.Has(scope) {
				WriteError(w, req, core.Errorf(core.ErrForbidden, "bu işlem için %s yetkisi gerekli", scope))
				return
			}
		}
		if err := h(w, req); err != nil {
			WriteError(w, req, err)
		}
	}))
}

// HandleRaw registers a plain http.Handler (static files, /metrics, /certs).
func (r *Router) HandleRaw(pattern string, h http.Handler) { r.mux.Handle(pattern, h) }

type ctxKey int

const (
	keyRequestID ctxKey = iota
	keyIP
)

// RequestID returns the request id of the current request ("" outside requests).
func RequestID(ctx context.Context) string { s, _ := ctx.Value(keyRequestID).(string); return s }

// ClientIP returns the remote address of the current request.
func ClientIP(ctx context.Context) string { s, _ := ctx.Value(keyIP).(string); return s }

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(c int) { s.status = c; s.ResponseWriter.WriteHeader(c) }
func (s *statusWriter) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = 200
	}
	return s.ResponseWriter.Write(b)
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	start := time.Now()
	rid := req.Header.Get("X-Request-Id")
	if rid == "" || len(rid) > 64 {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		rid = hex.EncodeToString(b)
	}
	ip, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil {
		ip = req.RemoteAddr
	}
	ctx := context.WithValue(req.Context(), keyRequestID, rid)
	ctx = context.WithValue(ctx, keyIP, ip)
	w.Header().Set("X-Request-Id", rid)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	sw := &statusWriter{ResponseWriter: w}
	defer func() {
		if rec := recover(); rec != nil {
			r.log.Error("panic", "err", fmt.Sprint(rec), "path", req.URL.Path, "request_id", rid)
			WriteError(sw, req, fmt.Errorf("internal error"))
		}
		_, pattern := r.mux.Handler(req)
		if pattern == "" {
			pattern = "unmatched"
		}
		r.latency.WithLabelValues(pattern, strconv.Itoa(sw.status)).Observe(time.Since(start).Seconds())
		if strings.HasPrefix(req.URL.Path, "/v1/") || strings.HasPrefix(req.URL.Path, "/auth/") {
			r.log.Info("http", "method", req.Method, "path", req.URL.Path, "status", sw.status,
				"ms", time.Since(start).Milliseconds(), "request_id", rid)
		}
	}()

	p := core.Principal{Kind: "anonymous"}
	if r.auth != nil {
		cookie := ""
		if c, err := req.Cookie(SessionCookie); err == nil {
			cookie = c.Value
		}
		bearer := ""
		if h := req.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			bearer = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		}
		if cookie != "" || bearer != "" {
			var err error
			p, err = r.auth.Authenticate(ctx, cookie, bearer)
			if err != nil {
				WriteError(sw, req.WithContext(ctx), err)
				return
			}
		}
	}
	if p.Kind == "user" && !safeMethod(req.Method) && req.Header.Get(CSRFHeader) != p.CSRF {
		WriteError(sw, req.WithContext(ctx), core.Errorf(core.ErrForbidden, "CSRF doğrulaması başarısız"))
		return
	}
	ctx = core.WithPrincipal(ctx, p)
	req.Body = http.MaxBytesReader(sw, req.Body, 16<<20)
	r.mux.ServeHTTP(sw, req.WithContext(ctx))
}

func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

// WriteJSON writes v as JSON with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}

// DecodeJSON decodes the request body into v, rejecting unknown fields and trailing data.
func DecodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		if errors.Is(err, io.EOF) {
			return core.Invalid("body", "istek gövdesi boş")
		}
		return core.Invalid("body", "geçersiz JSON: "+err.Error())
	}
	if dec.More() {
		return core.Invalid("body", "JSON sonrasında fazladan veri")
	}
	return nil
}

// Problem is an RFC 9457 problem details body.
type Problem struct {
	Type      string            `json:"type"`
	Title     string            `json:"title"`
	Status    int               `json:"status"`
	Detail    string            `json:"detail,omitempty"`
	Instance  string            `json:"instance,omitempty"`
	RequestID string            `json:"request_id,omitempty"`
	Errors    []core.FieldError `json:"errors,omitempty"`
}

// StatusOf maps an error to its HTTP status.
func StatusOf(err error) int {
	switch {
	case errors.Is(err, core.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, core.ErrInvalid):
		return http.StatusUnprocessableEntity
	case errors.Is(err, core.ErrConflict), errors.Is(err, core.ErrState):
		return http.StatusConflict
	case errors.Is(err, core.ErrForbidden):
		return http.StatusForbidden
	case errors.Is(err, core.ErrUnauthorized):
		return http.StatusUnauthorized
	case errors.Is(err, core.ErrRateLimited):
		return http.StatusTooManyRequests
	}
	var mbe *http.MaxBytesError
	if errors.As(err, &mbe) {
		return http.StatusRequestEntityTooLarge
	}
	return http.StatusInternalServerError
}

// WriteError writes err as application/problem+json. 5xx details are not leaked.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	status := StatusOf(err)
	p := Problem{Type: "about:blank", Title: http.StatusText(status), Status: status,
		Instance: r.URL.Path, RequestID: RequestID(r.Context())}
	if status < 500 {
		p.Detail = err.Error()
		var ve *core.ValidationError
		if errors.As(err, &ve) {
			p.Errors = ve.Fields
		}
	}
	if status == http.StatusTooManyRequests {
		w.Header().Set("Retry-After", "1")
	}
	w.Header().Set("Content-Type", "application/problem+json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(p)
}

// QueryInt reads an integer query parameter clamped to [1, max].
func QueryInt(r *http.Request, name string, def, max int) int {
	v, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || v < 1 {
		return def
	}
	if v > max {
		return max
	}
	return v
}

// StaticAuth is a test Authenticator mapping bearer tokens to principals.
type StaticAuth map[string]core.Principal

func (s StaticAuth) Authenticate(_ context.Context, _ string, bearer string) (core.Principal, error) {
	if p, ok := s[bearer]; ok {
		return p, nil
	}
	return core.Principal{}, core.Errorf(core.ErrUnauthorized, "geçersiz anahtar")
}
