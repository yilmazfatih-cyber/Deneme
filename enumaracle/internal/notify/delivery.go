package notify

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Delivery headers.
const (
	HeaderEvent     = "X-Enumaracle-Event"
	HeaderDelivery  = "X-Enumaracle-Delivery"
	HeaderSignature = "X-Enumaracle-Signature"
)

// DeliveryTimeout bounds one webhook POST.
const DeliveryTimeout = 5 * time.Second

// claimLease keeps a claimed delivery from being picked up again while it is in flight.
const claimLease = 2 * time.Minute

const batchSize = 50

// Sign returns the X-Enumaracle-Signature value for body at unix time t:
// "t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>".
func Sign(secret []byte, t int64, body []byte) string {
	ts := strconv.FormatInt(t, 10)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts))
	mac.Write([]byte("."))
	mac.Write(body)
	return "t=" + ts + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

// Start runs the delivery worker (every second, and right after Notify queues
// work). It blocks until ctx is done and then returns nil.
func (s *Service) Start(ctx context.Context) error {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
		case <-s.wake:
		}
		for {
			n, err := s.DeliverDue(ctx)
			if err != nil {
				if ctx.Err() == nil {
					s.log.Warn("notify: deliver", "err", err)
				}
				break
			}
			if n < batchSize {
				break
			}
		}
	}
}

type due struct {
	id, webhookID, eventType, payload, nextAt string
	attempt                                   int
}

// DeliverDue attempts every delivery whose next_at has passed (at most one
// batch of 50) and returns the number of attempts made.
func (s *Service) DeliverDue(ctx context.Context) (int, error) {
	s.deliverMu.Lock()
	defer s.deliverMu.Unlock()
	now := s.now()
	rows, err := s.base.DB.QueryContext(ctx, `SELECT id, webhook_id, event_type, payload, next_at, attempt
		FROM notify_deliveries WHERE status IN (?, ?) AND next_at <> '' AND next_at <= ?
		ORDER BY next_at, id LIMIT ?`, StatusPending, StatusFailed, platform.TS(now), batchSize)
	if err != nil {
		return 0, err
	}
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.id, &d.webhookID, &d.eventType, &d.payload, &d.nextAt, &d.attempt); err != nil {
			rows.Close()
			return 0, err
		}
		list = append(list, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	n := 0
	for _, d := range list {
		if ctx.Err() != nil {
			return n, ctx.Err()
		}
		ok, err := s.claim(ctx, d)
		if err != nil {
			return n, err
		}
		if !ok {
			continue
		}
		if err := s.deliverOne(ctx, d); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// claim leases a delivery (optimistic lock on attempt and next_at) so that
// several workers sharing a PostgreSQL database never send it twice.
func (s *Service) claim(ctx context.Context, d due) (bool, error) {
	now := s.now()
	res, err := s.base.DB.ExecContext(ctx, `UPDATE notify_deliveries SET next_at = ?, updated_at = ?
		WHERE id = ? AND attempt = ? AND next_at = ? AND status IN (?, ?)`,
		platform.TS(now.Add(claimLease)), platform.TS(now), d.id, d.attempt, d.nextAt, StatusPending, StatusFailed)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

func (s *Service) deliverOne(ctx context.Context, d due) error {
	target, secret, ok, err := s.webhookSecret(ctx, d.webhookID)
	if err != nil {
		return err
	}
	if !ok {
		return s.finish(ctx, d.id, d.attempt, StatusDead, 0, "webhook silindi veya devre dışı", time.Time{})
	}
	attempt := d.attempt + 1
	code, sendErr := s.send(ctx, target, d, secret)
	now := s.now()
	if sendErr == nil && code >= 200 && code < 300 {
		s.results.WithLabelValues(StatusDelivered).Inc()
		return s.finish(ctx, d.id, attempt, StatusDelivered, code, "", time.Time{})
	}
	msg := ""
	if sendErr != nil {
		msg = sendErr.Error()
	} else {
		msg = fmt.Sprintf("HTTP %d", code)
	}
	if attempt >= MaxAttempts {
		s.results.WithLabelValues(StatusDead).Inc()
		return s.finish(ctx, d.id, attempt, StatusDead, code, msg, time.Time{})
	}
	s.results.WithLabelValues(StatusFailed).Inc()
	return s.finish(ctx, d.id, attempt, StatusFailed, code, msg, now.Add(Backoff[attempt-1]))
}

func (s *Service) finish(ctx context.Context, id string, attempt int, status string, code int, msg string, next time.Time) error {
	now := s.now()
	nextAt, deliveredAt := "", ""
	if !next.IsZero() {
		nextAt = platform.TS(next)
	}
	if status == StatusDelivered {
		deliveredAt = platform.TS(now)
	}
	if len(msg) > 500 {
		msg = msg[:500]
	}
	_, err := s.base.DB.ExecContext(ctx, `UPDATE notify_deliveries SET status = ?, attempt = ?, next_at = ?,
		last_code = ?, last_error = ?, delivered_at = ?, updated_at = ? WHERE id = ?`,
		status, attempt, nextAt, code, msg, deliveredAt, platform.TS(now), id)
	return err
}

func (s *Service) send(ctx context.Context, target string, d due, secret []byte) (int, error) {
	if _, msg := validateURL(target); msg != "" {
		return 0, errors.New("geçersiz adres: " + msg)
	}
	ctx, cancel := context.WithTimeout(ctx, DeliveryTimeout)
	defer cancel()
	body := []byte(d.payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Enumaracle-Webhook/1")
	req.Header.Set(HeaderEvent, d.eventType)
	req.Header.Set(HeaderDelivery, d.id)
	req.Header.Set(HeaderSignature, Sign(secret, s.now().Unix(), body))
	resp, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	return resp.StatusCode, nil
}

// ---------------------------------------------------------------- URL and network policy

func isLoopbackHost(h string) bool {
	h = strings.ToLower(strings.TrimSuffix(h, "."))
	return h == "localhost" || h == "127.0.0.1" || h == "::1"
}

// validateURL accepts https URLs whose host is not a literal non-public IP,
// and http only for localhost/127.0.0.1/::1 (local tests). It returns the
// cleaned URL or a Turkish error message.
func validateURL(raw string) (string, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "adres boş"
	}
	if len(raw) > 2048 {
		return "", "adres en fazla 2048 karakter olmalı"
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.Opaque != "" {
		return "", "geçersiz adres"
	}
	if u.User != nil {
		return "", "adres kullanıcı bilgisi içermemeli"
	}
	if u.Fragment != "" {
		return "", "adres # parçası içermemeli"
	}
	host := u.Hostname()
	switch strings.ToLower(u.Scheme) {
	case "https":
		if ip, err := netip.ParseAddr(host); err == nil && !isPublicAddr(ip) && !isLoopbackHost(host) {
			return "", "adres özel veya ayrılmış bir IP olamaz"
		}
	case "http":
		if !isLoopbackHost(host) {
			return "", "adres https ile başlamalı (http yalnızca localhost testleri için)"
		}
	default:
		return "", "adres https ile başlamalı"
	}
	return u.String(), ""
}

// lookupNetIP resolves webhook hosts; replaceable in tests.
var lookupNetIP = net.DefaultResolver.LookupNetIP

var cgnat = netip.MustParsePrefix("100.64.0.0/10")

func isPublicAddr(ip netip.Addr) bool {
	ip = ip.Unmap()
	return ip.IsValid() && ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback() &&
		!ip.IsLinkLocalUnicast() && !cgnat.Contains(ip) && !(ip.Is4() && ip.As4()[0] == 0)
}

// newSafeClient returns a client that never follows redirects, ignores proxy
// environment variables and only connects to public IP addresses, except for
// the literal loopback hosts accepted by validateURL.
func newSafeClient() *http.Client {
	dialer := &net.Dialer{Timeout: DeliveryTimeout}
	tr := &http.Transport{
		Proxy:                 nil,
		DialContext:           guardedDial(dialer),
		TLSHandshakeTimeout:   DeliveryTimeout,
		ResponseHeaderTimeout: DeliveryTimeout,
		MaxIdleConns:          20,
		IdleConnTimeout:       30 * time.Second,
	}
	return &http.Client{
		Transport:     tr,
		Timeout:       DeliveryTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func guardedDial(d *net.Dialer) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		if isLoopbackHost(host) {
			targets := []string{host}
			if strings.EqualFold(host, "localhost") {
				targets = []string{"127.0.0.1", "::1"}
			}
			var lastErr error
			for _, h := range targets {
				c, err := d.DialContext(ctx, network, net.JoinHostPort(h, port))
				if err == nil {
					return c, nil
				}
				lastErr = err
			}
			return nil, lastErr
		}
		ips, err := lookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, ip := range ips {
			if !isPublicAddr(ip) {
				return nil, fmt.Errorf("adres %s özel bir IP'ye çözülüyor (%s); bağlanılmadı", host, ip)
			}
		}
		var lastErr error = errors.New("adres çözülemedi")
		for _, ip := range ips {
			c, err := d.DialContext(ctx, network, net.JoinHostPort(ip.Unmap().String(), port))
			if err == nil {
				return c, nil
			}
			lastErr = err
		}
		return nil, lastErr
	}
}
