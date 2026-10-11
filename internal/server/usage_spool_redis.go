package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/trqsh-uz/trqsh/pkg/authz"
)

// Pending batches have no TTL. They survive pod/edge replacement and are
// deleted only after the API acknowledges their idempotent DB write.
type redisUsageSpool struct {
	rdb    *redis.Client
	prefix string
}

func (u *usageAgg) enableRedisSpool(rdb *redis.Client, edgeID string) error {
	id := sha256.Sum256([]byte(edgeID))
	spool := &redisUsageSpool{rdb: rdb, prefix: "trqsh:usage:" + hex.EncodeToString(id[:]) + ":"}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	iter := rdb.Scan(ctx, 0, spool.prefix+"*", 100).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		data, err := rdb.Get(ctx, key).Bytes()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			return err
		}
		var window authz.Usage
		if err := json.Unmarshal(data, &window); err != nil {
			return err
		}
		if spool.prefix+window.EventID != key || window.AccountID == "" || window.WindowEnd.IsZero() {
			return fmt.Errorf("invalid pending usage batch")
		}
		u.pending = append(u.pending, &window)
	}
	if err := iter.Err(); err != nil {
		return err
	}
	u.redisSpool = spool
	return nil
}

func (s *redisUsageSpool) save(w *authz.Usage) error {
	data, err := json.Marshal(w)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.rdb.SetNX(ctx, s.prefix+w.EventID, data, 0).Err()
}

func (s *redisUsageSpool) remove(w *authz.Usage) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.rdb.Del(ctx, s.prefix+w.EventID).Err()
}
