package agent

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"github.com/trqsh-uz/trqsh/pkg/tunnel"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAuditTCPVerifiedTLS(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer srv.Close()
	ln, err := tunnel.Listen("", "127.0.0.1:0", &tls.Config{Certificates: srv.TLS.Certificates, MinVersion: tls.VersionTLS12})
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	roots := x509.NewCertPool()
	roots.AddCert(srv.Certificate())
	d := &tunnel.Dialer{ForceKind: tunnel.KindTCP, DialTimeout: time.Second, TLSConfig: &tls.Config{RootCAs: roots, NextProtos: []string{tunnel.ALPNProto}}}
	sess, err := d.Dial(context.Background(), ln.Addr().String())
	if err != nil {
		t.Errorf("verified TCP dial with trusted certificate failed: %v", err)
	} else {
		sess.CloseWithError(0, "done")
	}
}
