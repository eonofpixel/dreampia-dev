---
title: Performance — Cache Patterns
parent: ./_index.md
related:
  - sqlite-tuning.md
status: draft
last_updated: 2026-05-02
---

# Cache Patterns

> **한 줄 요약**: 메모리 LRU + IndexedDB + SQLite. TTL + invalidation.

---

## 계층

```
[Memory]              가장 빠름. 휘발성.
  ↓ miss
[IndexedDB]           Renderer 안 빠른 cache (5MB ~ GB)
  ↓ miss
[SQLite]              영구 저장 (메인 DB)
  ↓ miss
[Network / API]       마지막 fallback
```

---

## Memory cache (LRU)

```typescript
import LRU from 'lru-cache';

const sessionCache = new LRU<string, Session>({
  max: 50,                       // 최대 50 세션
  ttl: 1000 * 60 * 30,           // 30분
  
  // Eviction callback
  dispose: (session, key, reason) => {
    console.log(`Evicted ${key}, reason: ${reason}`);
  },
});

// 사용
function getSession(id: string): Session | undefined {
  return sessionCache.get(id);
}

function setSession(session: Session) {
  sessionCache.set(session.id, session);
}

function invalidate(id: string) {
  sessionCache.delete(id);
}
```

---

## React Query (서버 상태)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Read
const { data: messages } = useQuery({
  queryKey: ['messages', sessionId],
  queryFn: () => loadMessages(sessionId),
  staleTime: 1000 * 60,          // 1분 fresh
  gcTime: 1000 * 60 * 30,         // 30분 cache
});

// Write + invalidate
const mutation = useMutation({
  mutationFn: (turn: Turn) => saveTurn(sessionId, turn),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
  },
});
```

---

## IndexedDB (Renderer 영구)

```typescript
import { openDB, IDBPDatabase } from 'idb';

interface DraftDB {
  drafts: {
    key: string;            // session_id
    value: { content: string; updated_at: number };
  };
  thumbnails: {
    key: string;            // tab_id
    value: Blob;
  };
}

let db: IDBPDatabase<DraftDB>;

async function getDb() {
  if (!db) {
    db = await openDB<DraftDB>('dreampia-cache', 1, {
      upgrade(db) {
        db.createObjectStore('drafts');
        db.createObjectStore('thumbnails');
      },
    });
  }
  return db;
}

// Save draft (autosave)
async function saveDraft(sessionId: string, content: string) {
  const db = await getDb();
  await db.put('drafts', { content, updated_at: Date.now() }, sessionId);
}

// Thumbnail (큰 blob)
async function saveThumbnail(tabId: string, blob: Blob) {
  const db = await getDb();
  await db.put('thumbnails', blob, tabId);
}
```

→ Renderer 안에서만 사용. SQLite 못 직접 접근.

---

## HTTP cache (API)

```typescript
// Service Worker (Phase 2)
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/static-data')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // Stale-while-revalidate
          fetchAndUpdate(event.request);
          return cached;
        }
        return fetch(event.request);
      })
    );
  }
});

async function fetchAndUpdate(request) {
  const fresh = await fetch(request);
  const cache = await caches.open('api-v1');
  cache.put(request, fresh.clone());
  return fresh;
}
```

---

## Provider Adapter cache

```typescript
// 프롬프트 caching (Claude)
class ClaudeAdapter {
  async sendMessage(messages: ClaudeMessage[]) {
    return this.client.messages.create({
      model: 'claude-sonnet-4-6',
      messages,
      
      // System prompt cache (재사용)
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },   // ★ Claude 자동 cache
        },
      ],
    });
  }
}
```

→ 같은 system prompt 반복 시 비용 절감.

---

## 채팅 메시지 cache 전략

```typescript
class MessageCache {
  // L1: 메모리 (최근 100개)
  private memory = new LRU<string, Turn>({ max: 100 });
  
  // L2: SQLite (모두)
  private db: Database;
  
  async get(turnId: string): Promise<Turn> {
    // L1 hit
    const cached = this.memory.get(turnId);
    if (cached) return cached;
    
    // L2 fetch
    const turn = this.db.prepare('SELECT * FROM turns WHERE id = ?').get(turnId);
    
    // L1 populate
    this.memory.set(turnId, turn);
    
    return turn;
  }
  
  async set(turn: Turn) {
    // 둘 다 업데이트
    this.memory.set(turn.id, turn);
    this.db.prepare('INSERT OR REPLACE INTO turns ...').run(turn);
  }
}
```

---

## Prefetch 전략

```typescript
// 사용자 hover 시 다음 페이지 prefetch
function ChatItem({ chat, onActivate }) {
  return (
    <button
      onMouseEnter={() => prefetchMessages(chat.id)}    // hover prefetch
      onClick={() => onActivate(chat.id)}                // click activate
    >
      {chat.title}
    </button>
  );
}

async function prefetchMessages(sessionId: string) {
  if (messageCache.has(sessionId)) return;     // 이미 cache
  
  // Background fetch
  loadMessages(sessionId).then(messages => {
    messageCache.set(sessionId, messages);
  });
}
```

---

## Cache invalidation

```
원칙: 데이터 변경 시 즉시 invalidate.

패턴:
  - Mutation 성공 → invalidate (React Query)
  - Multi-window: leader 가 broadcast (multi-window.md)
  - TTL 만료: 자동
  - 사용자 명시 refresh
```

---

## 측정

```typescript
// Cache hit rate
class TrackedCache extends LRU {
  hits = 0;
  misses = 0;
  
  get(key: string) {
    const result = super.get(key);
    if (result !== undefined) this.hits++;
    else this.misses++;
    return result;
  }
  
  hitRate() {
    return this.hits / (this.hits + this.misses);
  }
}

// 모니터링
setInterval(() => {
  metrics.gauge('cache.hit_rate.session', sessionCache.hitRate());
}, 60_000);
```

---

## 관련

- [memory.md](./memory.md) — Memory budget
- [sqlite-tuning.md](./sqlite-tuning.md) — DB 성능
