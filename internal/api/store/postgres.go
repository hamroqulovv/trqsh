package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib" // pgx database/sql driver
)

// PostgresStore is the production Store backed by Postgres. Its queries match
// the goose migrations in internal/api/db/migrations. It is validated by
// compilation + schema review here; run the migrations and point TRQSH_DATABASE_URL
// at a live database to exercise it.
type PostgresStore struct {
	db sqlExecutor
}

type sqlExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (p *PostgresStore) BillingTransaction(ctx context.Context, fn func(Store) error) error {
	db, ok := p.db.(*sql.DB)
	if !ok {
		return errors.New("nested billing transaction")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	// All billing writers share this transaction lock, including across API
	// replicas. No network/Stripe calls are made inside the callback.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('trqsh:billing:transaction'))`); err != nil {
		return err
	}
	if err := fn(&PostgresStore{db: tx}); err != nil {
		return err
	}
	return tx.Commit()
}

// PoolConfig tunes the database/sql connection pool. Zero fields fall back to
// sensible defaults in NewPostgresStore.
type PoolConfig struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// NewPostgresStore opens a Postgres connection pool from a postgres:// DSN.
func NewPostgresStore(dsn string, pc PoolConfig) (*PostgresStore, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open postgres: %w", err)
	}
	// MaxIdleConns tracks MaxOpenConns: this is a small number of long-lived server
	// processes, so keeping idle connections warm avoids churn (the database/sql
	// default of 2 would repeatedly close/reopen against a much larger open pool).
	if pc.MaxOpenConns <= 0 {
		pc.MaxOpenConns = 20
	}
	if pc.MaxIdleConns <= 0 {
		pc.MaxIdleConns = pc.MaxOpenConns
	}
	if pc.ConnMaxLifetime <= 0 {
		pc.ConnMaxLifetime = 45 * time.Minute // let LB/DNS changes eventually rotate connections
	}
	if pc.ConnMaxIdleTime <= 0 {
		pc.ConnMaxIdleTime = 5 * time.Minute
	}
	db.SetMaxOpenConns(pc.MaxOpenConns)
	db.SetMaxIdleConns(pc.MaxIdleConns)
	db.SetConnMaxLifetime(pc.ConnMaxLifetime)
	db.SetConnMaxIdleTime(pc.ConnMaxIdleTime)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("store: ping postgres: %w", err)
	}
	return &PostgresStore{db: db}, nil
}

func mapErr(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && pgerr.Code == "23505" {
		return ErrConflict
	}
	return err
}

func (p *PostgresStore) CreateUser(ctx context.Context, u User) (User, error) {
	if u.ID == "" {
		u.ID = NewID("user")
	}
	if u.CreatedAt.IsZero() {
		u.CreatedAt = time.Now()
	}
	// One statement so a user and its first linked identity are created together.
	_, err := p.db.ExecContext(ctx,
		`WITH new_user AS (
		   INSERT INTO users (id, email, name, avatar_url, oauth_provider, oauth_subject, created_at)
		   VALUES ($1,$2,$3,$4,$5::text,$6::text,$7) RETURNING id
		 )
		 INSERT INTO user_identities (provider, subject, user_id)
		 SELECT $5::text, $6::text, id FROM new_user WHERE $5::text <> '' AND $6::text <> ''`,
		u.ID, strings.ToLower(strings.TrimSpace(u.Email)), u.Name, u.AvatarURL, u.OAuthProvider, u.OAuthSubject, u.CreatedAt)
	return u, mapErr(err)
}

func (p *PostgresStore) GetUser(ctx context.Context, id string) (User, error) {
	return p.scanUser(p.db.QueryRowContext(ctx,
		`SELECT `+userCols+` FROM users WHERE id=$1`, id))
}

func (p *PostgresStore) GetUserByEmail(ctx context.Context, email string) (User, error) {
	return p.scanUser(p.db.QueryRowContext(ctx,
		`SELECT `+userCols+` FROM users WHERE lower(email)=lower($1)`, email))
}

func (p *PostgresStore) GetUserByOAuth(ctx context.Context, provider, subject string) (User, error) {
	if subject == "" {
		return User{}, ErrNotFound
	}
	return p.scanUser(p.db.QueryRowContext(ctx,
		`SELECT u.id,u.email,u.name,u.avatar_url,u.oauth_provider,u.oauth_subject,u.created_at,u.disabled_at,u.disabled_reason
		 FROM user_identities i JOIN users u ON u.id=i.user_id
		 WHERE i.provider=$1 AND i.subject=$2`, provider, subject))
}

func (p *PostgresStore) LinkOAuthIdentity(ctx context.Context, userID, provider, subject string) error {
	if provider == "" || subject == "" {
		return ErrConflict
	}
	// Re-linking the same account is a no-op (the WHERE keeps the row touched, so
	// it still counts as affected); a provider account owned by another user
	// updates nothing, and a second account from the same provider trips the
	// (user_id, provider) unique index.
	result, err := p.db.ExecContext(ctx,
		`INSERT INTO user_identities (provider, subject, user_id) VALUES ($1,$2,$3)
		 ON CONFLICT (provider, subject) DO UPDATE SET user_id = user_identities.user_id
		 WHERE user_identities.user_id = EXCLUDED.user_id`, provider, subject, userID)
	if err != nil {
		return mapErr(err)
	}
	if n, err := result.RowsAffected(); err != nil {
		return err
	} else if n != 1 {
		return ErrConflict
	}
	// Keep the first-sign-in columns complete for accounts that predate subjects.
	_, err = p.db.ExecContext(ctx,
		`UPDATE users SET oauth_subject=$3 WHERE id=$1 AND oauth_provider=$2 AND oauth_subject=''`, userID, provider, subject)
	return err
}

func (p *PostgresStore) ListOAuthProviders(ctx context.Context, userID string) ([]string, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT provider FROM user_identities WHERE user_id=$1 ORDER BY created_at, provider`, userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

func (p *PostgresStore) scanUser(row *sql.Row) (User, error) {
	var u User
	var disabled sql.NullTime
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.OAuthProvider, &u.OAuthSubject, &u.CreatedAt, &disabled, &u.DisabledReason)
	u.DisabledAt = nullTimePtr(disabled)
	return u, mapErr(err)
}

func (p *PostgresStore) CreateOrg(ctx context.Context, o Org) (Org, error) {
	if o.ID == "" {
		o.ID = NewID("org")
	}
	if o.Plan == "" {
		o.Plan = "free"
	}
	if o.CreatedAt.IsZero() {
		o.CreatedAt = time.Now()
	}
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO orgs (id, name, plan, stripe_customer_id, created_at) VALUES ($1,$2,$3,$4,$5)`,
		o.ID, o.Name, o.Plan, nullStr(o.StripeCustomerID), o.CreatedAt)
	return o, err
}

func (p *PostgresStore) GetOrg(ctx context.Context, id string) (Org, error) {
	o, err := scanOrg(p.db.QueryRowContext(ctx, `SELECT `+orgCols+` FROM orgs WHERE id=$1`, id))
	return o, mapErr(err)
}

func (p *PostgresStore) OrgsByPlan(ctx context.Context, plan string) ([]Org, error) {
	rows, err := p.db.QueryContext(ctx, `SELECT `+orgCols+` FROM orgs WHERE plan=$1`, plan)
	if err != nil {
		return nil, err
	}
	return collectOrgs(rows)
}

func (p *PostgresStore) UpdateOrgPlan(ctx context.Context, orgID, plan string) error {
	// The Stripe/webhook path: a subscription-backed plan never time-expires, so
	// clear any manual expiry that was set previously.
	return execOne(p.db.ExecContext(ctx, `UPDATE orgs SET plan=$2, plan_expires_at=NULL WHERE id=$1`, orgID, plan))
}

func (p *PostgresStore) SetOrgPlan(ctx context.Context, orgID, plan string, expiresAt *time.Time) error {
	var exp any
	if expiresAt != nil {
		exp = nullTime(*expiresAt)
	}
	return execOne(p.db.ExecContext(ctx,
		`UPDATE orgs SET plan=$2, plan_expires_at=$3 WHERE id=$1`, orgID, plan, exp))
}

func (p *PostgresStore) UpdateUserProfile(ctx context.Context, id, name, avatarURL string) error {
	return execOne(p.db.ExecContext(ctx,
		`UPDATE users SET name = COALESCE(NULLIF($2,''), name), avatar_url = COALESCE(NULLIF($3,''), avatar_url) WHERE id = $1`,
		id, name, avatarURL))
}

func (p *PostgresStore) SetOrgStripeCustomer(ctx context.Context, orgID, customerID string) error {
	return execOne(p.db.ExecContext(ctx, `UPDATE orgs SET stripe_customer_id=$2 WHERE id=$1`, orgID, customerID))
}

func (p *PostgresStore) AddOrgMember(ctx context.Context, m OrgMember) error {
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO org_members (org_id,user_id,role) VALUES ($1,$2,$3)`, m.OrgID, m.UserID, m.Role)
	return err
}

func (p *PostgresStore) ListOrgMembers(ctx context.Context, orgID string) ([]OrgMember, error) {
	rows, err := p.db.QueryContext(ctx, `SELECT org_id,user_id,role FROM org_members WHERE org_id=$1`, orgID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []OrgMember
	for rows.Next() {
		var m OrgMember
		if err := rows.Scan(&m.OrgID, &m.UserID, &m.Role); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (p *PostgresStore) OrgsForUser(ctx context.Context, userID string) ([]Org, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT `+orgColsAs("o")+` FROM orgs o JOIN org_members m ON m.org_id=o.id WHERE m.user_id=$1`, userID) // #nosec G202 -- orgColsAs only joins constant column names with a fixed alias
	if err != nil {
		return nil, err
	}
	return collectOrgs(rows)
}

func (p *PostgresStore) CreateAPIKey(ctx context.Context, k APIKey) (APIKey, error) {
	if k.ID == "" {
		k.ID = NewID("key")
	}
	if k.CreatedAt.IsZero() {
		k.CreatedAt = time.Now()
	}
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO api_keys (id,org_id,name,prefix,hash,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
		k.ID, k.OrgID, k.Name, k.Prefix, k.Hash, k.CreatedAt)
	return k, err
}

func (p *PostgresStore) GetAPIKeyByPrefix(ctx context.Context, prefix string) (APIKey, error) {
	var k APIKey
	var last, revoked sql.NullTime
	err := p.db.QueryRowContext(ctx,
		`SELECT id,org_id,name,prefix,hash,last_used_at,revoked_at,created_at FROM api_keys WHERE prefix=$1`, prefix).
		Scan(&k.ID, &k.OrgID, &k.Name, &k.Prefix, &k.Hash, &last, &revoked, &k.CreatedAt)
	k.LastUsedAt = nullTimePtr(last)
	k.RevokedAt = nullTimePtr(revoked)
	return k, mapErr(err)
}

func (p *PostgresStore) ListAPIKeys(ctx context.Context, orgID string) ([]APIKey, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id,org_id,name,prefix,hash,last_used_at,revoked_at,created_at FROM api_keys WHERE org_id=$1`, orgID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []APIKey
	for rows.Next() {
		var k APIKey
		var last, revoked sql.NullTime
		if err := rows.Scan(&k.ID, &k.OrgID, &k.Name, &k.Prefix, &k.Hash, &last, &revoked, &k.CreatedAt); err != nil {
			return nil, err
		}
		k.LastUsedAt = nullTimePtr(last)
		k.RevokedAt = nullTimePtr(revoked)
		out = append(out, k)
	}
	return out, rows.Err()
}

func (p *PostgresStore) TouchAPIKey(ctx context.Context, id string, at time.Time) error {
	return execOne(p.db.ExecContext(ctx, `UPDATE api_keys SET last_used_at=$2 WHERE id=$1`, id, at))
}

func (p *PostgresStore) RevokeAPIKey(ctx context.Context, id, orgID string, at time.Time) error {
	return execOne(p.db.ExecContext(ctx, `UPDATE api_keys SET revoked_at=$3 WHERE id=$1 AND org_id=$2`, id, orgID, at))
}

func (p *PostgresStore) ReserveSubdomain(ctx context.Context, s ReservedSubdomain) (ReservedSubdomain, error) {
	if s.ID == "" {
		s.ID = NewID("sub")
	}
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now()
	}
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO reserved_subdomains (id,org_id,subdomain,created_at) VALUES ($1,$2,lower($3),$4)`,
		s.ID, s.OrgID, s.Subdomain, s.CreatedAt)
	if isUniqueViolation(err) {
		return ReservedSubdomain{}, ErrConflict
	}
	return s, err
}

func (p *PostgresStore) ListSubdomains(ctx context.Context, orgID string) ([]ReservedSubdomain, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id,org_id,subdomain,created_at FROM reserved_subdomains WHERE org_id=$1`, orgID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []ReservedSubdomain
	for rows.Next() {
		var s ReservedSubdomain
		if err := rows.Scan(&s.ID, &s.OrgID, &s.Subdomain, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (p *PostgresStore) ReleaseSubdomain(ctx context.Context, id, orgID string) error {
	return execOne(p.db.ExecContext(ctx, `DELETE FROM reserved_subdomains WHERE id=$1 AND org_id=$2`, id, orgID))
}

func (p *PostgresStore) IsSubdomainReserved(ctx context.Context, orgID, subdomain string) (bool, error) {
	var owner string
	err := p.db.QueryRowContext(ctx,
		`SELECT org_id FROM reserved_subdomains WHERE subdomain=lower($1)`, subdomain).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return owner == orgID, nil
}

func (p *PostgresStore) CountSubdomains(ctx context.Context, orgID string) (int, error) {
	var n int
	err := p.db.QueryRowContext(ctx, `SELECT count(*) FROM reserved_subdomains WHERE org_id=$1`, orgID).Scan(&n)
	return n, err
}

func (p *PostgresStore) AddCustomDomain(ctx context.Context, d CustomDomain) (CustomDomain, error) {
	if d.ID == "" {
		d.ID = NewID("dom")
	}
	if d.CreatedAt.IsZero() {
		d.CreatedAt = time.Now()
	}
	if d.CertStatus == "" {
		d.CertStatus = "pending"
	}
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO custom_domains (id,org_id,domain,verify_token,cert_status,created_at)
		 VALUES ($1,$2,lower($3),$4,$5,$6)`,
		d.ID, d.OrgID, d.Domain, d.VerifyToken, d.CertStatus, d.CreatedAt)
	if isUniqueViolation(err) {
		return CustomDomain{}, ErrConflict
	}
	return d, err
}

func (p *PostgresStore) GetCustomDomain(ctx context.Context, id, orgID string) (CustomDomain, error) {
	return p.scanDomain(p.db.QueryRowContext(ctx,
		`SELECT id,org_id,domain,verify_token,verified_at,cert_status,created_at
		 FROM custom_domains WHERE id=$1 AND org_id=$2`, id, orgID))
}

func (p *PostgresStore) GetCustomDomainByName(ctx context.Context, domain string) (CustomDomain, error) {
	return p.scanDomain(p.db.QueryRowContext(ctx,
		`SELECT id,org_id,domain,verify_token,verified_at,cert_status,created_at
		 FROM custom_domains WHERE domain=lower($1)`, domain))
}

func (p *PostgresStore) scanDomain(row *sql.Row) (CustomDomain, error) {
	var d CustomDomain
	var verified sql.NullTime
	err := row.Scan(&d.ID, &d.OrgID, &d.Domain, &d.VerifyToken, &verified, &d.CertStatus, &d.CreatedAt)
	d.VerifiedAt = nullTimePtr(verified)
	return d, mapErr(err)
}

func (p *PostgresStore) ListCustomDomains(ctx context.Context, orgID string) ([]CustomDomain, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id,org_id,domain,verify_token,verified_at,cert_status,created_at
		 FROM custom_domains WHERE org_id=$1`, orgID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []CustomDomain
	for rows.Next() {
		var d CustomDomain
		var verified sql.NullTime
		if err := rows.Scan(&d.ID, &d.OrgID, &d.Domain, &d.VerifyToken, &verified, &d.CertStatus, &d.CreatedAt); err != nil {
			return nil, err
		}
		d.VerifiedAt = nullTimePtr(verified)
		out = append(out, d)
	}
	return out, rows.Err()
}

func (p *PostgresStore) VerifyCustomDomain(ctx context.Context, id, orgID string, at time.Time) error {
	return execOne(p.db.ExecContext(ctx,
		`UPDATE custom_domains SET verified_at=$3, cert_status='verified' WHERE id=$1 AND org_id=$2`, id, orgID, at))
}

func (p *PostgresStore) CountCustomDomains(ctx context.Context, orgID string) (int, error) {
	var n int
	err := p.db.QueryRowContext(ctx, `SELECT count(*) FROM custom_domains WHERE org_id=$1`, orgID).Scan(&n)
	return n, err
}

func (p *PostgresStore) UpsertUsage(ctx context.Context, u UsageRecord) error {
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO usage_records (org_id,tunnel_id,bytes_in,bytes_out,requests,window_start,window_end,event_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (event_id) DO NOTHING`,
		u.OrgID, u.TunnelID, u.BytesIn, u.BytesOut, u.Requests, u.WindowStart, u.WindowEnd, nullStr(u.EventID))
	return err
}

func (p *PostgresStore) UsageForOrg(ctx context.Context, orgID string, since time.Time) (UsageRecord, error) {
	agg := UsageRecord{OrgID: orgID, WindowStart: since, WindowEnd: time.Now()}
	err := p.db.QueryRowContext(ctx,
		`SELECT COALESCE(sum(bytes_in),0),COALESCE(sum(bytes_out),0),COALESCE(sum(requests),0)
		 FROM usage_records WHERE org_id=$1 AND window_end>=$2`, orgID, since).
		Scan(&agg.BytesIn, &agg.BytesOut, &agg.Requests)
	return agg, err
}

func (p *PostgresStore) UsageSeriesForOrg(ctx context.Context, orgID string, since time.Time, bucket string) ([]UsageBucket, error) {
	if bucket != "hour" {
		bucket = "day" // whitelist: only hour/day (also passed as a bound param below)
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT date_trunc($3, window_end) AS b,
		        COALESCE(sum(bytes_in),0), COALESCE(sum(bytes_out),0), COALESCE(sum(requests),0)
		 FROM usage_records WHERE org_id=$1 AND window_end>=$2
		 GROUP BY b ORDER BY b`, orgID, since, bucket)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []UsageBucket
	for rows.Next() {
		var b UsageBucket
		if err := rows.Scan(&b.Start, &b.BytesIn, &b.BytesOut, &b.Requests); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (p *PostgresStore) UsageForOrgWindow(ctx context.Context, orgID string, start, end time.Time) (UsageRecord, error) {
	agg := UsageRecord{OrgID: orgID, WindowStart: start, WindowEnd: end}
	err := p.db.QueryRowContext(ctx, `SELECT COALESCE(sum(bytes_in),0),COALESCE(sum(bytes_out),0),COALESCE(sum(requests),0)
FROM usage_records WHERE org_id=$1 AND window_end>$2 AND window_end<=$3`, orgID, start, end).
		Scan(&agg.BytesIn, &agg.BytesOut, &agg.Requests)
	return agg, err
}

// --- Tunnel history ---

func (p *PostgresStore) RecordTunnelOpen(ctx context.Context, s TunnelSession) (TunnelSession, error) {
	if s.ID == "" {
		s.ID = NewID("tun")
	}
	if s.StartedAt.IsZero() {
		s.StartedAt = time.Now()
	}
	// Idempotent open keyed by the live-instance partial unique index: a duplicate
	// bind refreshes metadata instead of erroring, and RETURNING id yields the
	// surviving row's id.
	err := p.db.QueryRowContext(ctx,
		`INSERT INTO tunnel_sessions
		   (id, org_id, edge_id, session_id, tunnel_id, type, public_url, host, port,
		    region, client_ip, country, city, status, started_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',$14)
		 ON CONFLICT (edge_id, session_id, tunnel_id) WHERE status = 'active'
		 DO UPDATE SET org_id=EXCLUDED.org_id, type=EXCLUDED.type, public_url=EXCLUDED.public_url,
		    host=EXCLUDED.host, port=EXCLUDED.port, region=EXCLUDED.region,
		    client_ip=EXCLUDED.client_ip, country=EXCLUDED.country, city=EXCLUDED.city,
		    started_at=EXCLUDED.started_at
		 RETURNING id`,
		s.ID, s.OrgID, s.EdgeID, s.SessionID, s.TunnelID, s.Type, s.PublicURL, s.Host, s.Port,
		s.Region, s.ClientIP, s.Country, s.City, s.StartedAt).Scan(&s.ID)
	s.Status = "active"
	return s, err
}

func (p *PostgresStore) CloseTunnelSession(ctx context.Context, edgeID, sessionID, tunnelID string, endedAt time.Time, bytesIn, bytesOut, requests int64) error {
	return execOne(p.db.ExecContext(ctx,
		`UPDATE tunnel_sessions SET ended_at=$4, status='closed', bytes_in=$5, bytes_out=$6, requests=$7
		 WHERE edge_id=$1 AND session_id=$2 AND tunnel_id=$3 AND status='active'`,
		edgeID, sessionID, tunnelID, endedAt, bytesIn, bytesOut, requests))
}

func (p *PostgresStore) ListTunnelSessions(ctx context.Context, f TunnelSessionFilter) ([]TunnelSession, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 100
	}
	where, args := tunnelWhere(f)
	args = append(args, limit, f.Offset)
	q := `SELECT id,org_id,edge_id,session_id,tunnel_id,type,public_url,host,port,region,
	             client_ip,country,city,bytes_in,bytes_out,requests,status,started_at,ended_at
	      FROM tunnel_sessions ` + where +
		` ORDER BY started_at DESC LIMIT $` + strconv.Itoa(len(args)-1) + ` OFFSET $` + strconv.Itoa(len(args)) // #nosec G202 -- `where` is built only from constant SQL fragments and $N placeholder markers; every user value is passed as a bound arg (args...), so nothing user-controlled is concatenated into the SQL
	rows, err := p.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []TunnelSession
	for rows.Next() {
		s, err := scanTunnelSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// tunnelWhere builds the WHERE clause (and its bound args) shared by the list and
// count queries. Only constant fragments and $N markers are concatenated.
func tunnelWhere(f TunnelSessionFilter) (string, []any) {
	where := "WHERE 1=1"
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		where += " AND " + strings.ReplaceAll(cond, "$?", "$"+strconv.Itoa(len(args)))
	}
	if f.OrgID != "" {
		add("org_id=$?", f.OrgID)
	}
	if f.ActiveOnly {
		where += " AND status='active'"
	}
	if f.Type != "" {
		add("type=$?", f.Type)
	}
	if f.Region != "" {
		add("region=$?", f.Region)
	}
	if f.Country != "" {
		add("upper(country)=upper($?)", f.Country)
	}
	if q := strings.TrimSpace(f.Search); q != "" {
		add("(public_url ILIKE '%'||$?||'%' OR host ILIKE '%'||$?||'%' OR client_ip ILIKE '%'||$?||'%' OR org_id ILIKE '%'||$?||'%')", escapeLike(q))
	}
	return where, args
}

func scanTunnelSession(rows *sql.Rows) (TunnelSession, error) {
	var s TunnelSession
	var ended sql.NullTime
	err := rows.Scan(&s.ID, &s.OrgID, &s.EdgeID, &s.SessionID, &s.TunnelID, &s.Type, &s.PublicURL,
		&s.Host, &s.Port, &s.Region, &s.ClientIP, &s.Country, &s.City,
		&s.BytesIn, &s.BytesOut, &s.Requests, &s.Status, &s.StartedAt, &ended)
	s.EndedAt = nullTimePtr(ended)
	return s, err
}

func (p *PostgresStore) CountTunnelSessions(ctx context.Context, orgID string, activeOnly bool) (int, error) {
	where := "WHERE 1=1"
	args := []any{}
	if orgID != "" {
		args = append(args, orgID)
		where += " AND org_id=$1"
	}
	if activeOnly {
		where += " AND status='active'"
	}
	var n int
	err := p.db.QueryRowContext(ctx, `SELECT count(*) FROM tunnel_sessions `+where, args...).Scan(&n)
	return n, err
}

// --- Admin dashboard ---

func (p *PostgresStore) AdminOverview(ctx context.Context) (AdminStats, error) {
	now := time.Now()
	d7, d30 := now.AddDate(0, 0, -7), now.AddDate(0, 0, -30)
	st := AdminStats{OrgsByPlan: map[string]int{}}
	// One round-trip for the headline counts via scalar subqueries.
	err := p.db.QueryRowContext(ctx, `SELECT
		(SELECT count(*) FROM users),
		(SELECT count(*) FROM users WHERE created_at > $1),
		(SELECT count(*) FROM users WHERE created_at > $2),
		(SELECT count(*) FROM orgs),
		(SELECT count(*) FROM api_keys),
		(SELECT count(*) FROM reserved_subdomains),
		(SELECT count(*) FROM custom_domains),
		(SELECT count(*) FROM tunnel_sessions WHERE status='active'),
		(SELECT count(*) FROM tunnel_sessions),
		(SELECT COALESCE(sum(bytes_in),0) FROM usage_records WHERE window_end>=$2),
		(SELECT COALESCE(sum(bytes_out),0) FROM usage_records WHERE window_end>=$2),
		(SELECT COALESCE(sum(requests),0) FROM usage_records WHERE window_end>=$2)`,
		d7, d30).Scan(&st.Users, &st.NewUsers7d, &st.NewUsers30d, &st.Orgs, &st.APIKeys,
		&st.ReservedSubdomains, &st.CustomDomains, &st.ActiveTunnels, &st.TotalTunnels,
		&st.BytesIn30d, &st.BytesOut30d, &st.Requests30d)
	if err != nil {
		return st, err
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT COALESCE(NULLIF(plan,''),'free'), count(*) FROM orgs GROUP BY 1`)
	if err != nil {
		return st, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var plan string
		var n int
		if err := rows.Scan(&plan, &n); err != nil {
			return st, err
		}
		st.OrgsByPlan[plan] = n
	}
	return st, rows.Err()
}

func (p *PostgresStore) ListUsers(ctx context.Context, limit, offset int, search string) ([]User, error) {
	limit, offset = clampPage(limit, offset)
	rows, err := p.db.QueryContext(ctx,
		`SELECT id,email,name,avatar_url,oauth_provider,created_at,disabled_at,disabled_reason FROM users
		 WHERE ($3='' OR email ILIKE '%'||$3||'%' OR name ILIKE '%'||$3||'%')
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset, escapeLike(search))
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []User
	for rows.Next() {
		var u User
		var disabled sql.NullTime
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.OAuthProvider, &u.CreatedAt, &disabled, &u.DisabledReason); err != nil {
			return nil, err
		}
		u.DisabledAt = nullTimePtr(disabled)
		out = append(out, u)
	}
	return out, rows.Err()
}

func (p *PostgresStore) ListOrgs(ctx context.Context, limit, offset int, plan, search string) ([]Org, error) {
	limit, offset = clampPage(limit, offset)
	rows, err := p.db.QueryContext(ctx,
		`SELECT `+orgCols+` FROM orgs
		 WHERE ($3='' OR plan=$3) AND ($4='' OR name ILIKE '%'||$4||'%' OR id ILIKE '%'||$4||'%')
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset, strings.ToLower(strings.TrimSpace(plan)), escapeLike(search))
	if err != nil {
		return nil, err
	}
	return collectOrgs(rows)
}

func (p *PostgresStore) TunnelCountryBreakdown(ctx context.Context, orgID string, activeOnly bool) (map[string]int, error) {
	where := "WHERE 1=1"
	args := []any{}
	if orgID != "" {
		args = append(args, orgID)
		where += " AND org_id=$1"
	}
	if activeOnly {
		where += " AND status='active'"
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT COALESCE(NULLIF(country,''),'??') AS cc, count(*) FROM tunnel_sessions `+where+` GROUP BY cc`, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := map[string]int{}
	for rows.Next() {
		var cc string
		var n int
		if err := rows.Scan(&cc, &n); err != nil {
			return nil, err
		}
		out[cc] = n
	}
	return out, rows.Err()
}

// --- Billing ---

func (p *PostgresStore) UpsertSubscription(ctx context.Context, s Subscription) (Subscription, error) {
	if s.ID == "" {
		s.ID = NewID("sub")
	}
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now()
	}
	s.UpdatedAt = time.Now()
	// Upsert keyed by org_id (one active subscription per org).
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO subscriptions
		   (id, org_id, stripe_subscription_id, stripe_customer_id, plan, status,
		    current_period_end, cancel_at_period_end, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (org_id) DO UPDATE SET
		    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
		    stripe_customer_id     = EXCLUDED.stripe_customer_id,
		    plan                   = EXCLUDED.plan,
		    status                 = EXCLUDED.status,
		    current_period_end     = EXCLUDED.current_period_end,
		    cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
		    updated_at             = EXCLUDED.updated_at`,
		s.ID, s.OrgID, s.StripeSubID, s.StripeCustomerID, s.Plan, s.Status,
		nullTime(s.CurrentPeriodEnd), s.CancelAtPeriodEnd, s.CreatedAt, s.UpdatedAt)
	return s, err
}

func (p *PostgresStore) GetSubscriptionForOrg(ctx context.Context, orgID string) (Subscription, error) {
	var s Subscription
	var end sql.NullTime
	err := p.db.QueryRowContext(ctx,
		`SELECT id,org_id,stripe_subscription_id,stripe_customer_id,plan,status,
		        current_period_end,cancel_at_period_end,created_at,updated_at
		 FROM subscriptions WHERE org_id=$1`, orgID).
		Scan(&s.ID, &s.OrgID, &s.StripeSubID, &s.StripeCustomerID, &s.Plan, &s.Status,
			&end, &s.CancelAtPeriodEnd, &s.CreatedAt, &s.UpdatedAt)
	if end.Valid {
		s.CurrentPeriodEnd = end.Time
	}
	return s, mapErr(err)
}

func (p *PostgresStore) DeleteSubscription(ctx context.Context, stripeSubID string) error {
	return execOne(p.db.ExecContext(ctx,
		`DELETE FROM subscriptions WHERE stripe_subscription_id=$1`, stripeSubID))
}

func (p *PostgresStore) GetOrgByStripeCustomer(ctx context.Context, customerID string) (Org, error) {
	if customerID == "" {
		return Org{}, ErrNotFound
	}
	o, err := scanOrg(p.db.QueryRowContext(ctx, `SELECT `+orgCols+` FROM orgs WHERE stripe_customer_id=$1`, customerID))
	return o, mapErr(err)
}

func (p *PostgresStore) MarkEventProcessed(ctx context.Context, eventID, eventType string) (bool, error) {
	if eventID == "" {
		return true, nil
	}
	res, err := p.db.ExecContext(ctx,
		`INSERT INTO billing_events (event_id, type, processed_at) VALUES ($1,$2,now())
		 ON CONFLICT (event_id) DO NOTHING`, eventID, eventType)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n == 1, nil
}

func (p *PostgresStore) InsertMeteredUsage(ctx context.Context, u MeteredUsage) (MeteredUsage, error) {
	if u.CreatedAt.IsZero() {
		u.CreatedAt = time.Now()
	}
	err := p.db.QueryRowContext(ctx,
		`INSERT INTO metered_usage (org_id, metric, quantity, window_start, window_end, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		u.OrgID, u.Metric, u.Quantity, u.WindowStart, u.WindowEnd, u.CreatedAt).Scan(&u.ID)
	if isUniqueViolation(err) {
		return MeteredUsage{}, ErrConflict
	}
	return u, err
}

func (p *PostgresStore) PendingMeteredUsage(ctx context.Context, limit int) ([]MeteredUsage, error) {
	if limit <= 0 {
		limit = 1000
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT id,org_id,metric,quantity,window_start,window_end,reported_at,created_at,COALESCE(stripe_identifier,'')
		 FROM metered_usage WHERE reported_at IS NULL ORDER BY id LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []MeteredUsage
	for rows.Next() {
		var u MeteredUsage
		var reported sql.NullTime
		if err := rows.Scan(&u.ID, &u.OrgID, &u.Metric, &u.Quantity, &u.WindowStart, &u.WindowEnd, &reported, &u.CreatedAt, &u.Identifier); err != nil {
			return nil, err
		}
		u.ReportedAt = nullTimePtr(reported)
		out = append(out, u)
	}
	return out, rows.Err()
}

func (p *PostgresStore) MarkMeteredUsageReported(ctx context.Context, ids []int64, at time.Time) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := p.db.ExecContext(ctx,
		`UPDATE metered_usage SET reported_at=$2 WHERE id = ANY($1)`, ids, at)
	return err
}

func (p *PostgresStore) MeteredForWindow(ctx context.Context, orgID, metric string, start, end time.Time) (int64, time.Time, error) {
	var quantity int64
	var lastEnd sql.NullTime
	var overlap bool
	err := p.db.QueryRowContext(ctx, `SELECT COALESCE(sum(quantity),0),max(window_end),
COALESCE(bool_or(window_start<$3 OR window_end>$4),false) FROM metered_usage
WHERE org_id=$1 AND metric=$2 AND window_start<$4 AND window_end>$3`, orgID, metric, start, end).
		Scan(&quantity, &lastEnd, &overlap)
	if err != nil {
		return 0, start, err
	}
	if overlap {
		return 0, start, ErrConflict
	}
	if !lastEnd.Valid {
		return quantity, start, nil
	}
	return quantity, lastEnd.Time, nil
}

func (p *PostgresStore) Close() error {
	if db, ok := p.db.(*sql.DB); ok {
		return db.Close()
	}
	return nil
}

// --- helpers ---

func execOne(res sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullTime(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t
}

func nullTimePtr(t sql.NullTime) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

// isUniqueViolation reports whether err is a Postgres unique-constraint error
// (SQLSTATE 23505). It matches by message to avoid importing the pgconn types.
func isUniqueViolation(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "duplicate key"))
}
