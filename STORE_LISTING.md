# PromptBox — Chrome Web Store Listing Assets

## Store Title (max 45 chars is ideal)

**PromptBox: Prompt Manager for AI Chats**

> Alternative: "PromptBox — AI Prompt Manager & '/'' Menu"

## Short Description (max 132 chars)

> Insert AI prompts with "/" on ChatGPT, Claude & Gemini. Folders, variable fill-in, JSON backup. One-time purchase — no subscription.

(128 characters ✓)

## Detailed Description

**Stop retyping the same prompts. Type "/" instead.**

PromptBox is the lightweight prompt manager built for people who use ChatGPT, Claude, and Gemini every day — and refuse to pay a monthly subscription just to save a few snippets.

### ⚡ Type "/" to insert any prompt
Just type `/` followed by a keyword in any supported AI chat box. A clean, native-feeling menu pops up instantly. Pick a prompt with your mouse — or with ↑ ↓ and Enter, without ever leaving the keyboard.

### 🌐 Works across all three major AI chatbots
One extension, three platforms: **ChatGPT** (chatgpt.com), **Claude** (claude.ai), and **Gemini** (gemini.google.com). Your prompt library follows you everywhere.

### 🗂 Organize with folders
Group prompts into folders like General, Coding, or Writing — create your own in one click. Filter instantly from the popup.

### ⌗ Dynamic variable fill-in (Pro)
Write prompts with placeholders like:

> "Write a unit test in [language] for the following function: [code]"

When you insert it, PromptBox asks for each variable in a small dialog, fills everything in, and drops the finished prompt straight into the chat. No more manual find-and-replace.

### 💾 JSON import / export (Pro)
Own your data. Export your entire prompt library to a JSON file, back it up, move it between browsers, or share it with your team. Import merges intelligently — no duplicates.

### 🔒 Private by design
Everything is stored locally in your browser via chrome.storage.local. **No servers, no accounts, no analytics, no tracking.** Your prompts never leave your device.

### 💰 Pay once. Use forever.
Other prompt managers charge $5–10 *per month*. PromptBox Pro is a **one-time purchase of $6.99** — lifetime license, all future updates included. No subscription. No "per seat". No nonsense.

**Free vs Pro**
| Feature | Free | Pro |
|---|---|---|
| "/" quick-insert menu | ✓ | ✓ |
| Keyboard navigation | ✓ | ✓ |
| Saved prompts | 5 | Unlimited |
| Folders | 2 custom | Unlimited |
| Variable fill-in | — | ✓ |
| JSON import/export | — | ✓ |

---

## Permission Justifications (for the store review form)

### `storage`
PromptBox stores the user's saved prompts, folder names, and license state locally in the browser using `chrome.storage.local`. No data is transmitted anywhere; there is no backend server. This permission is the sole persistence mechanism of the product.

### `host_permissions: https://chatgpt.com/*, https://claude.ai/*, https://gemini.google.com/*`
The core feature of PromptBox is a "/"-triggered prompt insertion menu that appears inside the chat input box of the three supported AI platforms. The content script needs to run on these hosts to (1) detect when the user types "/" in the chat input, (2) display the prompt-selection menu, and (3) insert the selected prompt text into the input box when the user chooses one. The extension does not read, modify, or transmit page content or conversation data. Restricting these hosts to exactly the three supported domains keeps the permission surface minimal.

### Single purpose
A prompt manager that saves and quickly inserts reusable AI prompts on supported AI chat sites.

## Store Category
**Productivity** → Tools

## Suggested Tags
prompt manager, ChatGPT, Claude, Gemini, AI prompts, snippets, productivity, GPT prompts

## Screenshots checklist (1280×800 or 640×400)
1. "/" menu open on ChatGPT (hero shot)
2. Variable fill-in dialog in action
3. Popup manager with folders & Pro badge
4. "Pay once" pricing comparison card
5. Privacy-first statement card
