export type MessageIntent = "greeting" | "task";

// Single-word greeting tokens (matched after normalization, lowercased).
const GREETING_WORDS = new Set([
  // English
  "hi", "hii", "hiii", "hiya", "hey", "heey", "heya", "hello", "helo",
  "yo", "yoo", "sup", "wassup", "whatsup", "howdy", "hola",
  "morning", "afternoon", "evening",
  // Chinese
  "嗨", "嗨嗨", "你好", "您好", "哈喽", "哈啰", "哈罗", "哈喽喽",
  "嘿", "嘿嘿", "嘿哟", "在吗", "在么", "在不在", "在不", "有人吗", "有人在吗",
  "早", "早啊", "早安", "早上好", "中午好", "下午好", "晚上好", "晚安", "嗨喽"
]);

// Multi-word greeting phrases (matched as a whole after normalization).
const GREETING_PHRASES = new Set([
  "good morning", "good afternoon", "good evening", "good night",
  "whats up", "what s up", "how are you", "how r u", "hows it going",
  "long time no see"
]);

// Words that may appear alongside a greeting without making it a task
// ("hi there", "hey man", "hello everyone").
const FILLER_WORDS = new Set([
  "there", "man", "bro", "dude", "buddy", "guys", "guy", "all",
  "everyone", "yall", "team", "啊", "呀", "哦", "呢", "哈"
]);

// Trailing CJK particles / interjections stripped before matching ("你好啊" -> "你好").
const TRAILING_PARTICLES_RE = /[啊呀哦呢嘛吧哈喽~～]+$/u;

function normalize(content: string): string {
  return content
    .toLowerCase()
    // strip emoji / pictographs
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    // punctuation -> space
    .replace(/[!！?？.。,，、:：;；'"`~～…\-_/\\()（）\s]+/gu, " ")
    .trim();
}

export function classifyIntent(content: string): MessageIntent {
  const norm = normalize(content);
  if (norm.length === 0) return "task";

  if (GREETING_PHRASES.has(norm)) return "greeting";

  const tokens = norm.split(" ").filter(Boolean);

  // Pure greeting: a few tokens, each one a greeting word (with trailing
  // particles stripped) or an allowed filler, and at least one real greeting.
  if (tokens.length > 0 && tokens.length <= 3) {
    let hasGreeting = false;
    const allValid = tokens.every((token) => {
      const stripped = token.replace(TRAILING_PARTICLES_RE, "") || token;
      if (GREETING_WORDS.has(token) || GREETING_WORDS.has(stripped)) {
        hasGreeting = true;
        return true;
      }
      return FILLER_WORDS.has(token);
    });
    if (allValid && hasGreeting) return "greeting";
  }

  return "task";
}
