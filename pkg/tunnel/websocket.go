package tunnel

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/hashicorp/yamux"
)

// WebSocketPath is forwarded unchanged by an HTTPS reverse proxy. Authentication
// still happens in the existing Hello/AuthResp exchange inside the yamux session.
const WebSocketPath = "/_trqsh/agent"
const webSocketProtocol = "trqsh.v1"

func webSocketNetConn(ctx context.Context, conn *websocket.Conn) net.Conn {
	raw := websocket.NetConn(ctx, conn, websocket.MessageBinary)
	// NetConn disables the library's default message limit. Yamux writes bounded
	// frames; retain a generous upper bound against oversized peer messages.
	conn.SetReadLimit(1 << 20)
	return raw
}

func (d *Dialer) dialWebSocket(ctx context.Context, addr string) (Session, error) {
	dctx, cancel := context.WithTimeout(ctx, d.dialTimeout())
	defer cancel()
	tlsConfig := d.tlsClone()
	// The outer connection is ordinary HTTPS, rather than the direct trqsh ALPN.
	tlsConfig.NextProtos = []string{"http/1.1"}
	transport := &http.Transport{Proxy: http.ProxyFromEnvironment, TLSClientConfig: tlsConfig}
	defer transport.CloseIdleConnections()
	conn, response, err := websocket.Dial(dctx, addr, &websocket.DialOptions{
		HTTPClient:   &http.Client{Transport: transport},
		Subprotocols: []string{webSocketProtocol},
	})
	if err != nil {
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		return nil, fmt.Errorf("tunnel: WebSocket dial %s: %w", addr, err)
	}
	if conn.Subprotocol() != webSocketProtocol {
		_ = conn.CloseNow()
		return nil, fmt.Errorf("tunnel: WebSocket server did not negotiate %s", webSocketProtocol)
	}
	raw := webSocketNetConn(context.Background(), conn)
	sess, err := yamux.Client(raw, yamuxConfig(d.keepAlive()))
	if err != nil {
		_ = conn.CloseNow()
		return nil, err
	}
	return newYamuxSessionKind(sess, KindWebSocket), nil
}

// startWebSocket exposes plaintext HTTP only on the operator-selected internal
// address. Public deployments terminate TLS at their trusted HTTPS proxy.
func (m *multiListener) startWebSocket(addr string) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	m.wsLn = ln
	mux := http.NewServeMux()
	mux.HandleFunc("GET "+WebSocketPath, func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{webSocketProtocol}})
		if err != nil {
			return
		}
		if conn.Subprotocol() != webSocketProtocol {
			_ = conn.CloseNow()
			return
		}
		raw := webSocketNetConn(m.ctx, conn)
		sess, err := yamux.Server(raw, yamuxConfig(defaultKeepAlive))
		if err != nil {
			_ = conn.CloseNow()
			return
		}
		m.push(acceptResult{sess: newYamuxSessionKind(sess, KindWebSocket)})
	})
	m.wsServer = &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, MaxHeaderBytes: 16 << 10}
	go func() {
		if err := m.wsServer.Serve(ln); err != nil && m.ctx.Err() == nil {
			m.push(acceptResult{err: err})
		}
	}()
	return nil
}
