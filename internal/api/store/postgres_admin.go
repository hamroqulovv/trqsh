package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

// Postgres implementations of the admin console's store methods, plus the shared
// column lists/scanners the org and user queries use.

const (
	userCols = `id,email,name,avatar_url,oauth_provider,oauth_subject,created_at,disabled_at,disabled_reason`
	orgCols  = `id,name,plan,COALESCE(stripe_customer_id,''),created_at,plan_expires_at,suspended_at,suspended_reason`
)

// orgColsAs is orgCols qualified with a table alias, for joins.
func orgColsAs(a string) string {
	return a + `.id,` + a + `.name,` + a + `.plan,COALESCE(` + a + `.stripe_customer_id,''),` + a + `.created_at,` +
		a + `.plan_expires_at,` + a + `.suspended_at,` + a + `.suspended_reason`
}

type rowScanner interface{ Scan(...any) error }

func scanOrg(r rowScanner) (Org, error) {
	var o Org
	var exp, susp sql.NullTime
	err := r.Scan(&o.ID, &o.Name, &o.Plan, &o.StripeCustomerID, &o.CreatedAt, &exp, &susp, &o.SuspendedReason)
	o.PlanExpiresAt = nullTimePtr(exp)
	o.SuspendedAt = nullTimePtr(susp)
	return o, err
}

func collectOrgs(rows *sql.Rows) ([]Org, error) {
	defer func() { _ = rows.Close() }()
	out := []Org{}
	for rows.Next() {
		o, err := scanOrg(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// escapeLike makes user text literal inside an ILIKE '%…%' pattern.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func escapeLike(s string) string { return likeEscaper.Replace(strings.TrimSpace(s)) }

func (p *PostgresStore) count(ctx context.Context, query string, args ...any) (int, error) {
	var n int
	err := p.db.QueryRowContext(ctx, query, args...).Scan(&n)
	return n, err
}

func (p *PostgresStore) CountUsers(ctx context.Context, search string) (int, error) {
	return p.count(ctx,
		`SELECT count(*) FROM users WHERE ($1='' OR email ILIKE '%'||$1||'%' OR name ILIKE '%'||$1||'%')`, escapeLike(search))
}

func (p *PostgresStore) CountOrgs(ctx context.Context, plan, search string) (int, error) {
	return p.count(ctx,
		`SELECT count(*) FROM orgs WHERE ($1='' OR plan=$1) AND ($2='' OR name ILIKE '%'||$2||'%' OR id ILIKE '%'||$2||'%')`,
		strings.ToLower(strings.TrimSpace(plan)), escapeLike(search))
}

func (p *PostgresStore) CountTunnelSessionsWhere(ctx context.Context, f TunnelSessionFilter) (int, error) {
	where, args := tunnelWhere(f)
	return p.count(ctx, `SELECT count(*) FROM tunnel_sessions `+where, args...) // #nosec G202 -- `where` is built only from constant SQL fragments and $N markers by tunnelWhere; user values are bound args
}

// --- account controls ---

func (p *PostgresStore) SetUserDisabled(ctx context.Context, id string, at *time.Time, reason string) error {
	if at == nil {
		return execOne(p.db.ExecContext(ctx, `UPDATE users SET disabled_at=NULL, disabled_reason='' WHERE id=$1`, id))
	}
	return execOne(p.db.ExecContext(ctx, `UPDATE users SET disabled_at=$2, disabled_reason=$3 WHERE id=$1`, id, *at, reason))
}

// DeleteUser removes the user and, in the same statement, every org they were the
// only member of (those would otherwise be left with nobody able to reach them).
func (p *PostgresStore) DeleteUser(ctx context.Context, id string) error {
	return execOne(p.db.ExecContext(ctx,
		`WITH orphan AS (
		   SELECT m.org_id FROM org_members m
		   WHERE m.user_id=$1
		     AND NOT EXISTS (SELECT 1 FROM org_members o WHERE o.org_id=m.org_id AND o.user_id<>$1)
		 ), gone AS (
		   DELETE FROM orgs WHERE id IN (SELECT org_id FROM orphan)
		 )
		 DELETE FROM users WHERE id=$1`, id))
}

func (p *PostgresStore) SetOrgSuspended(ctx context.Context, id string, at *time.Time, reason string) error {
	if at == nil {
		return execOne(p.db.ExecContext(ctx, `UPDATE orgs SET suspended_at=NULL, suspended_reason='' WHERE id=$1`, id))
	}
	return execOne(p.db.ExecContext(ctx, `UPDATE orgs SET suspended_at=$2, suspended_reason=$3 WHERE id=$1`, id, *at, reason))
}

func (p *PostgresStore) RenameOrg(ctx context.Context, id, name string) error {
	return execOne(p.db.ExecContext(ctx, `UPDATE orgs SET name=$2 WHERE id=$1`, id, name))
}

func (p *PostgresStore) DeleteOrg(ctx context.Context, id string) error {
	return execOne(p.db.ExecContext(ctx, `DELETE FROM orgs WHERE id=$1`, id))
}

func (p *PostgresStore) RemoveOrgMember(ctx context.Context, orgID, userID string) error {
	return execOne(p.db.ExecContext(ctx, `DELETE FROM org_members WHERE org_id=$1 AND user_id=$2`, orgID, userID))
}

func (p *PostgresStore) SetOrgMemberRole(ctx context.Context, orgID, userID, role string) error {
	return execOne(p.db.ExecContext(ctx, `UPDATE org_members SET role=$3 WHERE org_id=$1 AND user_id=$2`, orgID, userID, role))
}

// --- cross-org directories ---

func (p *PostgresStore) ListAllAPIKeys(ctx context.Context, q Query, state string) ([]AdminAPIKey, int, error) {
	limit, offset := clampPage(q.Limit, q.Offset)
	search := escapeLike(q.Search)
	const filter = ` FROM api_keys k JOIN orgs o ON o.id=k.org_id
		WHERE ($1='' OR k.name ILIKE '%'||$1||'%' OR k.prefix ILIKE '%'||$1||'%' OR k.org_id ILIKE '%'||$1||'%' OR o.name ILIKE '%'||$1||'%')
		  AND ($2='' OR ($2='active' AND k.revoked_at IS NULL) OR ($2='revoked' AND k.revoked_at IS NOT NULL))`
	total, err := p.count(ctx, `SELECT count(*)`+filter, search, state)
	if err != nil {
		return nil, 0, err
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT k.id,k.org_id,k.name,k.prefix,k.last_used_at,k.revoked_at,k.created_at,o.name`+filter+
			` ORDER BY k.created_at DESC LIMIT $3 OFFSET $4`, search, state, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()
	out := []AdminAPIKey{}
	for rows.Next() {
		var k AdminAPIKey
		var last, revoked sql.NullTime
		if err := rows.Scan(&k.ID, &k.OrgID, &k.Name, &k.Prefix, &last, &revoked, &k.CreatedAt, &k.OrgName); err != nil {
			return nil, 0, err
		}
		k.LastUsedAt, k.RevokedAt = nullTimePtr(last), nullTimePtr(revoked)
		out = append(out, k)
	}
	return out, total, rows.Err()
}

func (p *PostgresStore) AdminRevokeAPIKey(ctx context.Context, id string, at time.Time) error {
	// COALESCE keeps the original revocation time when the key is already revoked.
	return execOne(p.db.ExecContext(ctx, `UPDATE api_keys SET revoked_at=COALESCE(revoked_at,$2) WHERE id=$1`, id, at))
}

func (p *PostgresStore) ListAllSubdomains(ctx context.Context, q Query) ([]AdminSubdomain, int, error) {
	limit, offset := clampPage(q.Limit, q.Offset)
	search := escapeLike(q.Search)
	const filter = ` FROM reserved_subdomains s JOIN orgs o ON o.id=s.org_id
		WHERE ($1='' OR s.subdomain ILIKE '%'||$1||'%' OR s.org_id ILIKE '%'||$1||'%' OR o.name ILIKE '%'||$1||'%')`
	total, err := p.count(ctx, `SELECT count(*)`+filter, search)
	if err != nil {
		return nil, 0, err
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT s.id,s.org_id,s.subdomain,s.created_at,o.name`+filter+` ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`,
		search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()
	out := []AdminSubdomain{}
	for rows.Next() {
		var s AdminSubdomain
		if err := rows.Scan(&s.ID, &s.OrgID, &s.Subdomain, &s.CreatedAt, &s.OrgName); err != nil {
			return nil, 0, err
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

func (p *PostgresStore) AdminReleaseSubdomain(ctx context.Context, id string) error {
	return execOne(p.db.ExecContext(ctx, `DELETE FROM reserved_subdomains WHERE id=$1`, id))
}

func (p *PostgresStore) ListAllCustomDomains(ctx context.Context, q Query, status string) ([]AdminDomain, int, error) {
	limit, offset := clampPage(q.Limit, q.Offset)
	search := escapeLike(q.Search)
	const filter = ` FROM custom_domains d JOIN orgs o ON o.id=d.org_id
		WHERE ($1='' OR d.domain ILIKE '%'||$1||'%' OR d.org_id ILIKE '%'||$1||'%' OR o.name ILIKE '%'||$1||'%')
		  AND ($2='' OR ($2='verified' AND d.verified_at IS NOT NULL) OR ($2='pending' AND d.verified_at IS NULL))`
	total, err := p.count(ctx, `SELECT count(*)`+filter, search, status)
	if err != nil {
		return nil, 0, err
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT d.id,d.org_id,d.domain,d.verify_token,d.verified_at,d.cert_status,d.created_at,o.name`+filter+
			` ORDER BY d.created_at DESC LIMIT $3 OFFSET $4`, search, status, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()
	out := []AdminDomain{}
	for rows.Next() {
		var d AdminDomain
		var verified sql.NullTime
		if err := rows.Scan(&d.ID, &d.OrgID, &d.Domain, &d.VerifyToken, &verified, &d.CertStatus, &d.CreatedAt, &d.OrgName); err != nil {
			return nil, 0, err
		}
		d.VerifiedAt = nullTimePtr(verified)
		out = append(out, d)
	}
	return out, total, rows.Err()
}

func (p *PostgresStore) AdminVerifyDomain(ctx context.Context, id string, at time.Time) error {
	return execOne(p.db.ExecContext(ctx, `UPDATE custom_domains SET verified_at=$2, cert_status='verified' WHERE id=$1`, id, at))
}

func (p *PostgresStore) AdminDeleteDomain(ctx context.Context, id string) error {
	return execOne(p.db.ExecContext(ctx, `DELETE FROM custom_domains WHERE id=$1`, id))
}

func (p *PostgresStore) ListSubscriptions(ctx context.Context, q Query, status string) ([]AdminSubscription, int, error) {
	limit, offset := clampPage(q.Limit, q.Offset)
	search := escapeLike(q.Search)
	const filter = ` FROM subscriptions s JOIN orgs o ON o.id=s.org_id
		WHERE ($1='' OR s.org_id ILIKE '%'||$1||'%' OR o.name ILIKE '%'||$1||'%'
		       OR s.stripe_subscription_id ILIKE '%'||$1||'%' OR s.stripe_customer_id ILIKE '%'||$1||'%')
		  AND ($2='' OR s.status=$2)`
	total, err := p.count(ctx, `SELECT count(*)`+filter, search, status)
	if err != nil {
		return nil, 0, err
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT s.id,s.org_id,s.stripe_subscription_id,s.stripe_customer_id,s.plan,s.status,
		        s.current_period_end,s.cancel_at_period_end,s.created_at,s.updated_at,o.name`+filter+
			` ORDER BY s.updated_at DESC LIMIT $3 OFFSET $4`, search, status, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()
	out := []AdminSubscription{}
	for rows.Next() {
		var s AdminSubscription
		var end sql.NullTime
		if err := rows.Scan(&s.ID, &s.OrgID, &s.StripeSubID, &s.StripeCustomerID, &s.Plan, &s.Status,
			&end, &s.CancelAtPeriodEnd, &s.CreatedAt, &s.UpdatedAt, &s.OrgName); err != nil {
			return nil, 0, err
		}
		if end.Valid {
			s.CurrentPeriodEnd = end.Time
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

// --- fleet usage ---

func (p *PostgresStore) UsageSeriesAll(ctx context.Context, since time.Time, bucket string) ([]UsageBucket, error) {
	if bucket != "hour" {
		bucket = "day"
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT date_trunc($2, window_end) AS b,
		        COALESCE(sum(bytes_in),0), COALESCE(sum(bytes_out),0), COALESCE(sum(requests),0)
		 FROM usage_records WHERE window_end>=$1 GROUP BY b ORDER BY b`, since, bucket)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []UsageBucket{}
	for rows.Next() {
		var b UsageBucket
		if err := rows.Scan(&b.Start, &b.BytesIn, &b.BytesOut, &b.Requests); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (p *PostgresStore) TopOrgsByUsage(ctx context.Context, since time.Time, limit int) ([]OrgUsage, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT u.org_id, COALESCE(o.name,''), sum(u.bytes_in), sum(u.bytes_out), sum(u.requests)
		 FROM usage_records u LEFT JOIN orgs o ON o.id=u.org_id
		 WHERE u.window_end>=$1 GROUP BY u.org_id, o.name
		 ORDER BY sum(u.bytes_in)+sum(u.bytes_out) DESC LIMIT $2`, since, limit)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []OrgUsage{}
	for rows.Next() {
		var u OrgUsage
		if err := rows.Scan(&u.OrgID, &u.OrgName, &u.BytesIn, &u.BytesOut, &u.Requests); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// --- audit log ---

func (p *PostgresStore) AppendAudit(ctx context.Context, e AuditEntry) error {
	detail, err := json.Marshal(e.Detail)
	if err != nil || e.Detail == nil {
		detail = []byte("{}")
	}
	if e.At.IsZero() {
		e.At = time.Now()
	}
	_, err = p.db.ExecContext(ctx,
		`INSERT INTO admin_audit (at, actor, action, target_type, target_id, summary, detail, ip)
		 VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
		e.At, e.Actor, e.Action, e.TargetType, e.TargetID, e.Summary, string(detail), e.IP)
	return err
}

func (p *PostgresStore) ListAudit(ctx context.Context, q AuditQuery) ([]AuditEntry, int, error) {
	limit, offset := clampPage(q.Limit, q.Offset)
	search := escapeLike(q.Search)
	const filter = ` FROM admin_audit
		WHERE ($1='' OR action=$1) AND ($2='' OR target_type=$2) AND ($3='' OR target_id=$3)
		  AND ($4='' OR action ILIKE '%'||$4||'%' OR target_type ILIKE '%'||$4||'%' OR target_id ILIKE '%'||$4||'%'
		       OR summary ILIKE '%'||$4||'%' OR actor ILIKE '%'||$4||'%')`
	total, err := p.count(ctx, `SELECT count(*)`+filter, q.Action, q.TargetType, q.TargetID, search)
	if err != nil {
		return nil, 0, err
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT id,at,actor,action,target_type,target_id,summary,detail,ip`+filter+
			` ORDER BY id DESC LIMIT $5 OFFSET $6`, q.Action, q.TargetType, q.TargetID, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()
	out := []AuditEntry{}
	for rows.Next() {
		var e AuditEntry
		var detail []byte
		if err := rows.Scan(&e.ID, &e.At, &e.Actor, &e.Action, &e.TargetType, &e.TargetID, &e.Summary, &detail, &e.IP); err != nil {
			return nil, 0, err
		}
		if len(detail) > 0 {
			_ = json.Unmarshal(detail, &e.Detail)
		}
		out = append(out, e)
	}
	return out, total, rows.Err()
}
