package tunnel

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"testing"
	"time"
)

func TestWebSocketThroughTLSProxy(t *testing.T) {
	ln, err := ListenWithWebSocket("", "", "127.0.0.1:0", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	echoServer(t, ln)
	upstream, _ := url.Parse("http://" + ln.Addr().String())
	proxy := httptest.NewTLSServer(httputil.NewSingleHostReverseProxy(upstream))
	defer proxy.Close()
	dialer := &Dialer{TLSConfig: proxy.Client().Transport.(*http.Transport).TLSClientConfig}
	sess, err := dialer.Dial(context.Background(), "wss"+proxy.URL[len("https"):]+WebSocketPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = sess.CloseWithError(0, "test finished") }()
	if sess.Kind() != KindWebSocket {
		t.Fatalf("kind = %s", sess.Kind())
	}
	exerciseStreams(t, sess, 12)
	// Exercise frames beyond the WebSocket library's default 32 KiB message limit.
	stream, err := sess.OpenStream(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = stream.Close() }()
	_ = stream.SetDeadline(time.Now().Add(5 * time.Second))
	payload := bytes.Repeat([]byte("forwarded-through-https"), 32000)
	written := make(chan error, 1)
	go func() { _, err := stream.Write(payload); written <- err }()
	got := make([]byte, len(payload))
	if _, err := io.ReadFull(stream, got); err != nil {
		t.Fatal(err)
	}
	if err := <-written; err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatal("large payload differs")
	}
}

func TestWebSocketCancellationAndListenerClose(t *testing.T) {
	ln, err := ListenWithWebSocket("", "", "127.0.0.1:0", nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (&Dialer{}).Dial(ctx, "ws://"+ln.Addr().String()+WebSocketPath); err == nil {
		t.Fatal("canceled dial succeeded")
	}
	if err := ln.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := ln.Accept(context.Background()); err != net.ErrClosed {
		t.Fatalf("closed accept: %v", err)
	}
}

func TestWebSocketRejectsCrossOriginAndWrongPath(t *testing.T) {
	ln, err := ListenWithWebSocket("", "", "127.0.0.1:0", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	base := "http://" + ln.Addr().String()
	response, err := http.Get(base + "/other")
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("wrong path: %d", response.StatusCode)
	}
	request, _ := http.NewRequest(http.MethodGet, base+WebSocketPath, nil)
	request.Header.Set("Origin", "https://untrusted.example")
	request.Header.Set("Connection", "Upgrade")
	request.Header.Set("Upgrade", "websocket")
	request.Header.Set("Sec-WebSocket-Version", "13")
	request.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("cross origin: %d", response.StatusCode)
	}
}
