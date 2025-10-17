<!-- 6a55fa7d-8d7c-4789-9ed9-23380c81f847 0d2a6179-1746-4de1-9d0b-a7d5f3d3f49c -->
# Add 5-exchange guest chat limit

## Recommendation

- Use a persistent per-browser guestId with a 24-hour rolling window. This maximizes growth by allowing daily re-tries without punishing shared IPs, while strongly nudging sign-up after the first session.

## Server-side enforcement

1) Create persistent guestId

- In `middleware.ts`, if no Supabase user and no `guest_id` cookie, set one (HttpOnly, Secure, SameSite=Lax, 365d TTL).
```ts
// middleware.ts (inside middleware before return)
const hasGuest = request.cookies.get('guest_id')
if (!hasGuest) {
  const id = crypto.randomUUID()
  response.cookies.set('guest_id', id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  })
}
```


2) Extend Redis wrapper for counters

- In `lib/redis/config.ts`, add `get(key)`, `incr(key)`, and `expire(key, seconds)` methods for both Upstash and node-redis paths.

3) Enforce limit in chat API

- In `app/api/chat/route.ts`:
  - Read `userId`; if not anonymous, proceed.
  - For anonymous: read `guest_id` from cookies; compute `key = guest:exchanges:${guestId}`.
  - Read current count: `const n = Number(await redis.get(key) || 0)`.
  - If `n >= LIMIT` (env `FREE_GUEST_EXCHANGES` default 5) return 429 with JSON `{ code: 'FREE_LIMIT_REACHED' }` and header `x-free-limit: reached`.
```ts
const LIMIT = parseInt(process.env.FREE_GUEST_EXCHANGES || '5', 10)
...
if (userId === 'anonymous') {
  const guestId = (await cookies()).get('guest_id')?.value
  if (!guestId) return new Response('Unauthorized', { status: 401 })
  const key = `guest:exchanges:${guestId}`
  const current = Number((await redis.get(key)) ?? 0)
  if (current >= LIMIT) {
    return new Response(JSON.stringify({ code: 'FREE_LIMIT_REACHED' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'x-free-limit': 'reached' }
    })
  }
}
```


4) Increment on successful assistant answer

- In `lib/streaming/handle-stream-finish.ts` after saving (or at the end of try):
  - If `userId === 'anonymous'` read `guest_id` from `cookies()`, then:
  - `await redis.incr(key)` and `await redis.expire(key, 60*60*24)` to start/refresh a 24h TTL window from first use.
```ts
if (userId === 'anonymous') {
  const guestId = (await cookies()).get('guest_id')?.value
  if (guestId) {
    const key = `guest:exchanges:${guestId}`
    await redis.incr(key)
    await redis.expire(key, 60 * 60 * 24)
  }
}
```


## Client UX

5) Lock input and show CTA when limited

- In `components/chat.tsx`:
  - Add `const [isLocked, setIsLocked] = useState(false)`.
  - In `useChat({ onError })`, if `error.message` includes `FREE_LIMIT_REACHED` (or response status 429 if available), `setIsLocked(true)` and toast a concise message.
  - Pass `isLocked` to `ChatPanel`.

6) Prompt to sign in or create account

- In `components/chat-panel.tsx`:
  - Accept `isLocked` prop; when true:
    - Render a banner above the textarea with: “You’ve used your 5 free replies today. Sign in for unlimited chat.”
    - Buttons to `/auth/login` and `/auth/sign-up`.
    - Disable textarea and send button when `isLocked`.
```tsx
// props: isLocked: boolean
{isLocked && (
  <div className="mb-2 rounded-md border bg-card p-3 text-sm">
    You’ve used your 5 free replies today. <a href="/auth/login" className="underline">Sign in</a> or <a href="/auth/sign-up" className="underline">create an account</a>.
  </div>
)}
<Textarea disabled={isLocked || isLoading || isToolInvocationInProgress()} ... />
<Button type="submit" disabled={isLocked || isLoading || isToolInvocationInProgress()}>
```


## Archival

- Create `plans/guest-chat-limit.md` with this plan content; store future plans in `plans/`.

## Configuration

- Add `FREE_GUEST_EXCHANGES` to `.env` (default 5). No migration needed.

## Light instrumentation (optional)

- Log when limit is hit (server) with `guestId` hashed (no PII) to gauge conversion effectiveness.

### To-dos

- [ ] Set persistent guest_id cookie for anonymous users in middleware
- [ ] Add get/incr/expire methods to Redis wrapper for counters
- [ ] Check and reject when over limit in app/api/chat/route.ts
- [ ] Increment guest counter on successful finish in handle-stream-finish.ts
- [ ] Track limit error in components/chat.tsx and lock input
- [ ] Show Sign in/Create account CTA and disable input in ChatPanel


