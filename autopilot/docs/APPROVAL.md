# Approval — Divot Lab Autopilot

## Overview

Every post must be approved before going live. The approval interface is a **Telegram Bot** — free, no per-message cost, and the best UX for this use case because images render natively inline and inline keyboard buttons require a single tap.

The flow has three paths:

- **Approve** → post fires immediately to X and Instagram
- **Edit** → bot enters edit mode, you type a correction, caption regenerates, new preview sent
- **Skip** → post is discarded, nothing goes live

---

## Telegram Bot Setup

### Creating the Bot

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Name it: `Divot Lab Autopilot` (display name)
4. Username: `divotlab_autopilot_bot` (must be unique — add numbers if taken)
5. BotFather returns a token: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
6. Store as `TELEGRAM_BOT_TOKEN` in Vercel env vars

### Getting Your Chat ID

1. Send any message to your new bot
2. Call: `https://api.telegram.org/bot{TOKEN}/getUpdates`
3. Find `message.chat.id` in the response — this is your personal chat ID
4. Store as `TELEGRAM_CHAT_ID` in Vercel env vars

### Webhook vs Polling

Use **webhooks** not polling. The bot receives messages at:
```
POST /api/autopilot/telegram/webhook
```

Register the webhook once:
```
https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://divotlab.com/api/autopilot/telegram/webhook
```

Add this to `BUILD_ORDER.md` Phase 7 setup steps.

---

## Approval Message Format

When a post is queued, the bot sends a message to your Telegram chat:

```
DIVOT LAB — Post Ready

📊 R1 Leaderboard · The Masters

─────────────────────

X CAPTION (247 chars):
Scheffler sits two clear at Augusta after R1. His DG rating coming 
in was the highest in the field. Wind at 18mph pushed the field 
average to +1.2 today. The model likes him here.
via @DataGolf #PGATour #TheMasters

─────────────────────

INSTAGRAM CAPTION:
R1 recap — The Masters

Scheffler leads Augusta at -8...
[full IG caption]

─────────────────────

🌬 Conditions: 18mph wind, 62°F, calm greens
📈 Field avg score: +1.2 today
```

Followed immediately by the stat card image, then an inline keyboard:

```
[ ✓ Approve ]  [ ✎ Edit X ]  [ ✎ Edit IG ]  [ ✗ Skip ]
```

Or for posts where both captions are identical in structure:

```
[ ✓ Approve ]  [ ✎ Edit Both ]  [ ✗ Skip ]
```

The image renders inline above the buttons in Telegram. You see exactly what will post.

---

## Edit Flow — Full State Machine

### Step 1: Tap Edit

User taps `✎ Edit X`, `✎ Edit IG`, or `✎ Edit Both`.

Bot responds:
```
Editing X caption.

Current:
"Scheffler sits two clear at Augusta after R1..."

Type your correction instruction below.
Examples:
· "Change SG number to +1.6"
· "Remove the last sentence"  
· "Make it shorter"
· "The wind was 22mph not 18mph"

Or tap Cancel to go back.
```

```
[ Cancel ]
```

Queue status updates to `pending_edit`. Bot enters awaiting-instruction mode for this chat ID. The next text message from this chat ID is treated as the edit instruction.

### Step 2: Send Instruction

User types: `"Change wind to 22mph and remove the last sentence"`

Bot responds immediately:
```
Got it. Regenerating...
```

### Step 3: Regeneration

System calls Claude API with:
- Original caption(s) for the platform(s) being edited
- The original data payload (stored in queue — not re-fetched)
- The original context object (stored in queue)
- The edit instruction
- Brand voice system prompt

Regeneration prompt in `autopilot/lib/claude.ts`:

```typescript
const EDIT_SYSTEM_PROMPT = `
You are editing a social media caption for Divot Lab, a data-driven golf analytics brand.
You will receive: the original caption, the original data that informed it, and an edit instruction.
Apply the edit instruction precisely. Do not change anything not mentioned in the instruction.
Maintain brand voice: data-first, no exclamation points, short punchy sentences.
Output only the revised caption. No preamble, no explanation.
`

async function regenerateCaption(
  originalCaption: string,
  editInstruction: string,
  originalData: TriggerData,
  originalContext: PostContext,
  platform: 'twitter' | 'instagram'
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: EDIT_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `
Original caption:
"${originalCaption}"

Original data context:
${JSON.stringify(originalData, null, 2)}

Edit instruction:
"${editInstruction}"

Platform: ${platform} (${platform === 'twitter' ? '280 char max' : '2200 char max'})

Output the revised caption only.
`
    }]
  })
  
  return response.content[0].type === 'text' ? response.content[0].text.trim() : originalCaption
}
```

### Step 4: New Preview Sent

Bot sends updated preview message with the revised caption(s) and a new inline keyboard:

```
✓ Updated. Here's the revised caption:

X CAPTION (231 chars):
Scheffler sits two clear at Augusta after R1. His DG rating coming 
in was the highest in the field. Wind at 22mph pushed the field 
average to +1.2 today. The model likes him here.
via @DataGolf #PGATour #TheMasters

─────────────────────
```

```
[ ✓ Approve ]  [ ✎ Edit X ]  [ ✎ Edit IG ]  [ ✗ Skip ]
```

Queue status returns to `pending`. Edit history is appended to `autopilot_queue.edit_history` JSONB column.

User can edit again unlimited times. Each edit creates a new entry in edit history.

### Edit Timeout

If user taps Edit but sends no instruction within 30 minutes:

Bot sends:
```
Edit timed out. Post is still pending.
```

```
[ ✓ Approve ]  [ ✎ Edit Both ]  [ ✗ Skip ]
```

Queue status returns to `pending`. Post expiry clock continues from original `created_at`.

---

## Queue Status During Edit Flow

```
pending
  ↓ (tap Edit)
pending_edit
  ↓ (instruction received, regenerating)
pending_edit_regenerating
  ↓ (regeneration complete)
pending              ← back to pending with updated captions
  ↓ (tap Approve)
approved
  ↓ (posting complete)
posted

pending → skipped    (tap Skip at any point)
pending → expired    (4 hours from created_at, no action)
pending_edit → pending_edit_timeout  (30 min no instruction)
  → pending          (timeout resets to pending)
```

---

## Approve Flow

User taps `✓ Approve`.

Bot responds immediately:
```
Posting now...
```

System fires `firePosting(postId)` asynchronously. On completion:

**Success:**
```
✓ Posted.

X: https://x.com/divotlabgolf/status/123...
IG: https://www.instagram.com/p/abc.../

Thu 3:42pm
```

**Partial (one platform failed):**
```
⚠ Partially posted.

✓ X: https://x.com/divotlabgolf/status/123...
✗ Instagram failed: [short error description]

Check dashboard: divotlab.com/autopilot
```

**Both failed:**
```
✗ Post failed on both platforms.

Error: [short description]

Check dashboard: divotlab.com/autopilot
```

---

## Skip Flow

User taps `✗ Skip`.

Bot responds:
```
Skipped. No post was made.
```

Queue status → `skipped`. No further messages.

---

## Token Expiry

After 4 hours from `created_at` with no approval:

Bot sends:
```
⏱ Post expired — no action taken.

[Trigger Label · Event Name]
```

Queue status → `expired`. Inline keyboard buttons are removed from the original message (edit the message via Telegram API to remove markup).

---

## Telegram Webhook Handler

In `app/api/autopilot/telegram/webhook/route.ts`:

```typescript
export async function POST(req: Request) {
  const body = await req.json()
  
  // Verify the message is from our bot's registered chat only
  const chatId = body?.message?.chat?.id || body?.callback_query?.message?.chat?.id
  if (String(chatId) !== process.env.TELEGRAM_CHAT_ID) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // Route by update type
  if (body.callback_query) {
    // Button tap — Approve, Edit X, Edit IG, Edit Both, Skip, Cancel
    await handleCallbackQuery(body.callback_query)
    // Always answer callback to remove loading state on button
    await answerCallbackQuery(body.callback_query.id)
  } else if (body.message?.text) {
    // Text message — could be an edit instruction if in pending_edit state
    await handleTextMessage(body.message)
  }
  
  // Telegram requires 200 response quickly — always return 200
  return new Response('OK', { status: 200 })
}

async function handleCallbackQuery(query: TelegramCallbackQuery) {
  const [action, postId] = query.data.split(':')  // data format: "approve:uuid" | "edit_x:uuid" etc
  
  switch (action) {
    case 'approve': return handleApprove(postId, query.message)
    case 'edit_x':  return handleEditStart(postId, 'twitter', query.message)
    case 'edit_ig': return handleEditStart(postId, 'instagram', query.message)
    case 'edit_both': return handleEditStart(postId, 'both', query.message)
    case 'skip':    return handleSkip(postId, query.message)
    case 'cancel':  return handleEditCancel(postId, query.message)
  }
}

async function handleTextMessage(message: TelegramMessage) {
  // Check if there's a pending_edit post waiting for an instruction
  const pendingEdit = await getPendingEditPost()
  
  if (!pendingEdit) {
    // No edit in progress — ignore the message or send help text
    await sendTelegramMessage('No post is waiting for edits right now.')
    return
  }
  
  // Treat this message as the edit instruction
  await processEditInstruction(pendingEdit.id, message.text, pendingEdit.editPlatform)
}
```

---

## Telegram API Helper

In `autopilot/lib/telegram.ts`:

```typescript
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function sendApprovalMessage(post: QueuedPost, imageBuffer: Buffer): Promise<void> {
  // Send image with caption and inline keyboard as one message
  const formData = new FormData()
  formData.append('chat_id', CHAT_ID)
  formData.append('photo', new Blob([imageBuffer], { type: 'image/png' }), 'post.png')
  formData.append('caption', buildApprovalMessageText(post))
  formData.append('reply_markup', JSON.stringify({
    inline_keyboard: buildApprovalKeyboard(post.id)
  }))
  
  await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData })
  
  // Send full captions as a separate message (photos have 1024 char caption limit)
  await sendTelegramMessage(buildCaptionPreviewText(post), buildApprovalKeyboard(post.id))
}

function buildApprovalKeyboard(postId: string) {
  return [
    [
      { text: '✓ Approve', callback_data: `approve:${postId}` },
      { text: '✎ Edit Both', callback_data: `edit_both:${postId}` },
      { text: '✗ Skip', callback_data: `skip:${postId}` }
    ],
    [
      { text: '✎ Edit X only', callback_data: `edit_x:${postId}` },
      { text: '✎ Edit IG only', callback_data: `edit_ig:${postId}` }
    ]
  ]
}

export async function sendTelegramMessage(
  text: string,
  inlineKeyboard?: any[][]
): Promise<TelegramMessage> {
  const body: any = { chat_id: CHAT_ID, text, parse_mode: 'HTML' }
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard }
  
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  
  return (await res.json()).result
}

export async function editTelegramMessage(
  messageId: number,
  text: string,
  inlineKeyboard?: any[][]
): Promise<void> {
  // Used to update the approval message after edits or expiry
  const body: any = { chat_id: CHAT_ID, message_id: messageId, text, parse_mode: 'HTML' }
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard }
  else body.reply_markup = { inline_keyboard: [] }  // removes buttons if no keyboard passed
  
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  })
}
```

---

## Packages Required

```bash
npm install node-fetch form-data
```

No dedicated Telegram SDK needed — the Telegram Bot API is simple enough to call directly with fetch. This keeps the dependency footprint small.

---

## Security

- Webhook endpoint verifies `chat_id` matches `TELEGRAM_CHAT_ID` on every request
- Callback query data uses `action:postId` format — postId is a UUID, not guessable
- All database operations on post IDs verify the post belongs to the expected state before acting
- Webhook URL is not secret but is useless to anyone not in the authorized chat
- Never log the bot token
