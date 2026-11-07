package platform

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
)

// Sealer encrypts secrets at rest (private keys, webhook secrets) with
// AES-256-GCM under the master key. Output is nonce||ciphertext. The aad binds
// a ciphertext to its row (e.g. the key id) so it cannot be swapped.
type Sealer struct{ aead cipher.AEAD }

func NewSealer(key []byte) (*Sealer, error) {
	if len(key) != 32 {
		return nil, errors.New("master key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Sealer{aead: aead}, nil
}

func (s *Sealer) Seal(plaintext []byte, aad string) ([]byte, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return s.aead.Seal(nonce, nonce, plaintext, []byte(aad)), nil
}

func (s *Sealer) Open(sealed []byte, aad string) ([]byte, error) {
	n := s.aead.NonceSize()
	if len(sealed) < n {
		return nil, errors.New("sealed value too short")
	}
	return s.aead.Open(nil, sealed[:n], sealed[n:], []byte(aad))
}
