const fetch = require("node-fetch");

const BALE_TOKEN = process.env.BALE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Required channel membership
const REQUIRED_CHANNEL = "@motarjem_mehran";
const CHANNEL_URL = "https://ble.ir/motarjem_mehran";
// Set to "false" to disable membership check temporarily
const ENABLE_MEMBERSHIP_CHECK = process.env.ENABLE_MEMBERSHIP_CHECK !== "false";

// ---------- Channel membership ----------
async function isChannelMember(userId) {
  // If membership check is disabled, always return true
  if (!ENABLE_MEMBERSHIP_CHECK) {
    console.log("[bale] Membership check is disabled, allowing all users");
    return true;
  }
  
  try {
    // Try using channel ID instead of username for better compatibility
    const channelId = REQUIRED_CHANNEL.startsWith('@') ? REQUIRED_CHANNEL : `@${REQUIRED_CHANNEL}`;
    
    const res = await fetch(`${BALE_API}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, user_id: userId }),
    });
    const txt = await res.text();
    console.log(`[bale] getChatMember response for user ${userId}:`, txt);
    
    let j;
    try {
      j = JSON.parse(txt);
    } catch (parseErr) {
      console.error("[bale] Failed to parse getChatMember response:", txt);
      // If parsing fails, allow user (fail open for better UX)
      return true;
    }
    
    if (!j?.ok) {
      console.error("[bale] getChatMember not ok:", j?.description || txt);
      // If API call fails (e.g., bot not admin), allow user (fail open)
      // This prevents blocking all users if bot setup is incomplete
      return true;
    }
    
    const status = j?.result?.status;
    console.log(`[bale] User ${userId} status in channel:`, status);
    
    const isMember = (
      status === "member" ||
      status === "administrator" ||
      status === "creator" ||
      status === "owner"
    );
    
    // Also check for "left" or "kicked" status
    if (status === "left" || status === "kicked") {
      return false;
    }
    
    return isMember;
  } catch (e) {
    console.error("[bale] isChannelMember failed", e);
    // On error, allow user (fail open)
    return true;
  }
}

function joinKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📢 عضویت در کانال", url: CHANNEL_URL }],
      [{ text: "✅ عضو شدم، بررسی کن", callback_data: "verify" }], 
    ],
  };
}

async function sendJoinPrompt(chatId, replyTo) {
  await sendMessage(
    chatId,
    `سلام 👋\nبرای استفاده از ربات، اول باید عضو کانال ما بشی:\n${REQUIRED_CHANNEL}\n\nبعد از عضویت، روی دکمه «✅ عضو شدم، بررسی کن» بزن.`,
    replyTo,
    joinKeyboard(),
  );
}

// ---------- Bale helpers ----------
async function sendMessage(chatId, text, replyTo, replyMarkup) {
  try {
    await fetch(`${BALE_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        reply_to_message_id: replyTo,
        reply_markup: replyMarkup,
      }),
    });
  } catch (e) {
    console.error("[bale] sendMessage failed", e);
  }
}

async function sendLongMessage(chatId, text, replyTo) {
  const MAX = 3800;
  if (text.length <= MAX) return sendMessage(chatId, text, replyTo);
  for (let i = 0; i < text.length; i += MAX) {
    await sendMessage(
      chatId,
      text.slice(i, i + MAX),
      i === 0 ? replyTo : undefined,
    );
  }
}



async function sendAudio(chatId, filename, bytes, contentType, caption, replyTo) {
  try {
    const form = new (require("form-data"))();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption.slice(0, 1000));
    if (replyTo) form.append("reply_to_message_id", String(replyTo));
    form.append("audio", Buffer.from(bytes), {
      filename,
      contentType,
    });
    const res = await fetch(`${BALE_API}/sendAudio`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[bale] sendAudio failed", res.status, t);
      await sendDocument(chatId, filename, bytes, contentType, caption, replyTo);
    }
  } catch (e) {
    console.error("[bale] sendAudio error", e);
  }
}

async function sendDocument(chatId, filename, bytes, contentType, caption, replyTo) {
  try {
    const form = new (require("form-data"))();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption.slice(0, 1000));
    if (replyTo) form.append("reply_to_message_id", String(replyTo));
    form.append("document", Buffer.from(bytes), {
      filename,
      contentType,
    });
    const res = await fetch(`${BALE_API}/sendDocument`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[bale] sendDocument failed", res.status, t);
    }
  } catch (e) {
    console.error("[bale] sendDocument error", e);
  }
}

function toBase64(buf) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return Buffer.from(binary, "binary").toString("base64");
}

function guessMime(path, current, fallback, map) {
  let mime = current;
  if (!mime || mime === "application/octet-stream") {
    const ext = path.split(".").pop()?.toLowerCase();
    mime = (ext && map[ext]) || fallback;
  }
  return mime;
}

async function getFileBytes(fileId) {
  const fileRes = await fetch(`${BALE_API}/getFile?file_id=${fileId}`);
  const fileText = await fileRes.text();
  let fileJson;
  try {
    fileJson = JSON.parse(fileText);
  } catch {
    throw new Error(`getFile non-JSON: ${fileText.slice(0, 200)}`);
  }
  const filePath = fileJson?.result?.file_path;
  if (!filePath) throw new Error(`No file_path: ${fileText.slice(0, 200)}`);

  const imgRes = await fetch(`https://tapi.bale.ai/file/bot${BALE_TOKEN}/${filePath}`);
  if (!imgRes.ok) throw new Error(`download failed ${imgRes.status}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  let mime = imgRes.headers.get("content-type")?.split(";")[0]?.trim() || "";
  return { bytes, mime, path: filePath };
}

// ---------- TTS (English pronunciation) ----------
const EN_MARKER = "🔤 EN:";

function ttsKeyboard(mode = "src") {
  return {
    inline_keyboard: [
      [{ text: "🔊 شنیدن تلفظ انگلیسی", callback_data: `tts:${mode}` }],
      [{ text: "📚 مترادف و متضاد", callback_data: `syn:${mode}` }],
    ],
  };
}

function extractEnglishFromCallbackMessage(cqMessage, mode) {
  if (mode === "src") {
    const t = cqMessage?.reply_to_message?.text;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  }
  if (mode === "msg") {
    const t = cqMessage?.text ?? "";
    const idx = t.indexOf(EN_MARKER);
    if (idx === -1) return null;
    const after = t.slice(idx + EN_MARKER.length).trim();
    const stop = after.indexOf("\n\n");
    return (stop === -1 ? after : after.slice(0, stop)).trim() || null;
  }
  return null;
}

function chunkForTts(text, max = 190) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = [];
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let buf = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (buf) {
        parts.push(buf);
        buf = "";
      }
      const words = s.split(" ");
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).trim().length > max) {
          if (cur) parts.push(cur);
          cur = w;
        } else {
          cur = (cur ? cur + " " : "") + w;
        }
      }
      if (cur) parts.push(cur);
    } else if ((buf + " " + s).trim().length > max) {
      if (buf) parts.push(buf);
      buf = s;
    } else {
      buf = (buf ? buf + " " : "") + s;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

async function googleTts(text) {
  const chunks = chunkForTts(text);
  if (chunks.length === 0) throw new Error("متنی برای تلفظ پیدا نشد.");
  const buffers = [];
  for (const c of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(c)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) throw new Error(`خطا در دریافت صوت (${res.status})`);
    buffers.push(new Uint8Array(await res.arrayBuffer()));
  }
  let total = 0;
  for (const b of buffers) total += b.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

async function sendPronunciation(chatId, englishText, replyTo) {
  const trimmed = englishText.trim().slice(0, 1500);
  if (!trimmed) {
    await sendMessage(chatId, "متنی برای تلفظ نیست.", replyTo);
    return;
  }
  const mp3 = await googleTts(trimmed);
  await sendAudio(
    chatId,
    "pronunciation.mp3",
    mp3,
    "audio/mpeg",
    "🔊 تلفظ انگلیسی",
    replyTo,
  );
}

// ---------- AI calls with Gemini ----------
async function translateText(text) {
  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "You are a professional English-to-Persian (Farsi) translator. Translate the user's English text into natural, fluent Persian. Output ONLY the Persian translation, no explanations, no English.",
            },
          ],
        },
        { parts: [{ text }] },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 5000,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini translate error:", JSON.stringify(data));
    throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function synonymsAndAntonym(input) {
  const latinRatio = (input.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(input.length, 1);
  const isEnglish = latinRatio > 0.4;
  
  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "You are an English vocabulary helper for Persian speakers. Given a word or short phrase " +
                "(possibly in Persian), identify the target English word. Then return EXACTLY this Markdown format in Persian, no extra text:\n\n" +
                "🔤 *کلمه:* <english word>\n" +
                "🇮🇷 *ترجمه:* <persian meaning>\n\n" +
                "✅ *مترادف‌ها (Synonyms):*\n" +
                "1. <syn1> — <persian meaning>\n" +
                "2. <syn2> — <persian meaning>\n" +
                "3. <syn3> — <persian meaning>\n\n" +
                "❌ *متضاد (Antonym):*\n" +
                "• <ant> — <persian meaning>\n\n" +
                "📝 *جمله‌ی نمونه:*\n" +
                "<a simple English sentence using the original word>\n" +
                "ترجمه: <persian translation of the sentence>\n\n" +
                "Rules: pick common, useful synonyms. If the input has multiple words, focus on the most important content word. " +
                "If no English equivalent exists or the word is unclear, reply in Persian: 'کلمه قابل تشخیص نیست.'",
            },
          ],
        },
        {
          parts: [
            {
              text: isEnglish ? input.trim() : `این کلمه فارسیه: ${input.trim()}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 5000,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini synonym error:", JSON.stringify(data));
    throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function translateImage(fileId) {
  const { bytes, mime: ct, path } = await getFileBytes(fileId);
  const mime = guessMime(path, ct, "image/jpeg", {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  });
  const b64 = toBase64(bytes);

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "You are an OCR + English-to-Persian translator. Read all English text in the image and translate it into natural fluent Persian. Output ONLY the Persian translation. If no English text, reply in Persian: 'متن انگلیسی در تصویر پیدا نشد.'",
            },
            {
              inline_data: {
                mime_type: mime,
                data: b64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 5000,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini image translate error:", JSON.stringify(data));
    throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function extractEnglishFromImage(fileId) {
  const { bytes, mime: ct, path } = await getFileBytes(fileId);
  const mime = guessMime(path, ct, "image/jpeg", {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  });
  const b64 = toBase64(bytes);

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "Extract ALL English text from the image, preserving order and punctuation. Output ONLY the English text, nothing else. If none, output an empty string.",
            },
            {
              inline_data: {
                mime_type: mime,
                data: b64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 5000,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini extract error:", JSON.stringify(data));
    throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function analyzeLabTestImage(fileId) {
  const { bytes, mime: ct, path } = await getFileBytes(fileId);
  const mime = guessMime(path, ct, "image/jpeg", {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  });
  const b64 = toBase64(bytes);

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "تو یک دستیار پزشکی هستی که نتایج آزمایش‌های پزشکی (خون، ادرار، بیوشیمی، هورمونی و …) را به زبان فارسی روان تحلیل می‌کنی.\n" +
                "از روی تصویرِ برگه‌ی آزمایش:\n" +
                "۱) نام آزمایش/پروفایل را بنویس.\n" +
                "۲) جدولی از هر شاخص بساز با ستون‌های: نام شاخص | مقدار بیمار | محدوده‌ی مرجع | وضعیت (طبیعی/بالا/پایین).\n" +
                "۳) برای هر مقدار غیرطبیعی، توضیح کوتاه و قابل فهم بده که این یعنی چه و معمولاً به چه دلایلی رخ می‌دهد.\n" +
                "۴) یک «جمع‌بندی کلی» در ۳–۵ خط بنویس.\n" +
                "۵) در صورت لزوم، «پیشنهاد گام بعدی» (مثل تکرار آزمایش، مراجعه به متخصص خاص، تغییر سبک زندگی) اضافه کن.\n" +
                "۶) در انتها این هشدار را بیاور: «این تحلیل صرفاً جنبه‌ی آموزشی دارد و جایگزین نظر پزشک نیست.»\n" +
                "اگر تصویر برگه‌ی آزمایش نیست یا کیفیتش پایین است، صادقانه بگو و راهنمایی کن دوباره با کیفیت بهتر بفرستد.\n" +
                "فقط فارسی بنویس و از Markdown ساده استفاده کن.",
            },
            {
              inline_data: {
                mime_type: mime,
                data: b64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 0.9,
        maxOutputTokens: 5000,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini lab test error:", JSON.stringify(data));
    throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

function wantsAnalysis(caption) {
  if (!caption) return false;
  const c = caption.toLowerCase();
  return (
    c.includes("/analyze") ||
    c.includes("/test") ||
    caption.includes("تحلیل") ||
    caption.includes("آزمایش") ||
    caption.includes("ازمایش")
  );
}

// ---------- Audio/Video → SRT ----------
function secondsToSrtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const ms = Math.round(s * 1000);
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  const mmm = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(mmm, 3)}`;
}

function buildSrt(segments) {
  return segments
    .filter((s) => s && typeof s.text === "string" && s.text.trim())
    .map(
      (s, i) =>
        `${i + 1}\n${secondsToSrtTime(s.start)} --> ${secondsToSrtTime(s.end)}\n${s.text.trim()}\n`,
    )
    .join("\n");
}

async function transcribeAndTranslateMedia(fileId, kind) {
  const { bytes, mime: ct, path } = await getFileBytes(fileId);
  const mime =
    kind === "audio"
      ? guessMime(path, ct, "audio/ogg", {
          ogg: "audio/ogg",
          oga: "audio/ogg",
          opus: "audio/ogg",
          mp3: "audio/mpeg",
          m4a: "audio/mp4",
          mp4: "audio/mp4",
          wav: "audio/wav",
          webm: "audio/webm",
          aac: "audio/aac",
          flac: "audio/flac",
        })
      : guessMime(path, ct, "video/mp4", {
          mp4: "video/mp4",
          mov: "video/quicktime",
          webm: "video/webm",
          mkv: "video/x-matroska",
          avi: "video/x-msvideo",
          "3gp": "video/3gpp",
          m4v: "video/mp4",
          mpeg: "video/mpeg",
          mpg: "video/mpeg",
        });
  const b64 = toBase64(bytes);

  const userContent = [
    {
      text:
        kind === "audio"
          ? "Transcribe this English audio and translate to Persian as subtitle segments."
          : "Transcribe the English speech in this video and translate to Persian as subtitle segments.",
    },
  ];

  if (kind === "audio") {
    userContent.push({
      inline_data: {
        mime_type: mime,
        data: b64,
      },
    });
  } else {
    userContent.push({
      inline_data: {
        mime_type: mime,
        data: b64,
      },
    });
  }

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "You transcribe English speech (from audio or video) and translate it to Persian (Farsi). Split into short subtitle segments (max ~7 seconds each, ideally one sentence or clause per segment). For each segment provide start and end times in seconds (floats) and the Persian translation only (no English, no transliteration). Be accurate with timing. If there is no English speech, return an empty segments array.",
            },
          ],
        },
        { parts: userContent },
      ],
      tools: [
        {
          function_declarations: [
            {
              name: "return_subtitles",
              description: "Return Persian subtitle segments with timing.",
              parameters: {
                type: "object",
                properties: {
                  segments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        start: {
                          type: "number",
                          description: "Start time in seconds",
                        },
                        end: {
                          type: "number",
                          description: "End time in seconds",
                        },
                        text: {
                          type: "string",
                          description: "Persian translation of this segment",
                        },
                      },
                      required: ["start", "end", "text"],
                    },
                  },
                },
                required: ["segments"],
              },
            },
          ],
        },
      ],
      tool_config: {
        function_calling_config: {
          mode: "ANY",
          allowed_function_names: ["return_subtitles"],
        },
      },
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 0.9,
        maxOutputTokens: 5000,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini transcribe error:", JSON.stringify(data));
    throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
  }

  const call = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
  const argsRaw = call?.args;
  if (!argsRaw) throw new Error("پاسخی برای رونویسی صوت دریافت نشد.");

  const segments = Array.isArray(argsRaw?.segments) ? argsRaw.segments : [];
  if (segments.length === 0) {
    throw new Error("متن انگلیسی قابل تشخیصی در صوت پیدا نشد.");
  }
  const srt = buildSrt(segments);
  const preview = segments
    .map((s) => s.text)
    .join(" ")
    .slice(0, 500);
  return { srt, preview };
}

// ---------- Main webhook handler ----------
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("Bale translator webhook is alive");
    }

    let update;
    try {
      update = req.body;
    } catch (e) {
      console.error("invalid update json", e);
      return res.status(200).json({ ok: true });
    }

    // Inline-keyboard callback (TTS pronunciation + channel verify)
    if (update?.callback_query) {
      const cq = update.callback_query;
      const cbChatId = cq.message?.chat?.id;
      const cbMsgId = cq.message?.message_id;
      const cbUserId = cq.from?.id;
      const dataStr = typeof cq.data === "string" ? cq.data : "";

      try {
        console.log(`[callback] Received callback_query: ${dataStr}, userId: ${cbUserId}, chatId: ${cbChatId}`);
        
        if (dataStr === "verify" && cbChatId && cbUserId) {
          console.log(`[callback] Verifying membership for user ${cbUserId}`);
          const ok = await isChannelMember(cbUserId);
          console.log(`[callback] Membership check result: ${ok}`);
          
          if (ok) {
            await answerCallbackQuery(cq.id, "✅ عضویت تایید شد");
            await sendMessage(
              cbChatId,
              "عالی! حالا می‌تونی از ربات استفاده کنی 🎉\nبرام بفرست تا به فارسی ترجمه کنم:\n• 📝 متن انگلیسی\n• 🖼 تصویر حاوی متن انگلیسی\n• 🎙 پیام صوتی یا فایل صوتی انگلیسی\n• 🎬 ویدیو انگلیسی (.srt فارسی)\n\n🧪 تحلیل آزمایش پزشکی: عکس برگه‌ی آزمایش رو با کپشن «تحلیل» بفرست.",
            );
          } else {
            await answerCallbackQuery(cq.id, "❌ هنوز عضو نیستی");
            await sendMessage(
              cbChatId,
              "لطفاً ابتدا در کانال عضو شوید و سپس دوباره تلاش کنید.\n\n⚠️ نکته: اگر تازه عضو شدید، ممکن است چند ثانیه طول بکشد تا سیستم به‌روز شود. لطفاً کمی صبر کنید و دوباره امتحان کنید.",
            );
          }
          return res.status(200).json({ ok: true });
        }

        if (dataStr.startsWith("tts:") && cbChatId) {
          if (cbUserId && !(await isChannelMember(cbUserId))) {
            await answerCallbackQuery(cq.id, "ابتدا در کانال عضو شو");
            await sendJoinPrompt(cbChatId, cbMsgId);
            return res.status(200).json({ ok: true });
          }
          const mode = dataStr.slice(4);
          const text = extractEnglishFromCallbackMessage(cq.message, mode);
          if (!text) {
            await answerCallbackQuery(cq.id, "متن پیدا نشد. دوباره بفرست.");
          } else {
            await answerCallbackQuery(cq.id, "در حال ساخت تلفظ…");
            try {
              await sendPronunciation(cbChatId, text, cbMsgId);
            } catch (e) {
              const detail = e instanceof Error ? e.message : String(e);
              console.error("tts error", detail);
              await sendMessage(
                cbChatId,
                `خطا در ساخت تلفظ: ${detail.slice(0, 300)}`,
                cbMsgId,
              );
            }
          }
        } else if (dataStr.startsWith("syn:") && cbChatId) {
          if (cbUserId && !(await isChannelMember(cbUserId))) {
            await answerCallbackQuery(cq.id, "ابتدا در کانال عضو شو");
            await sendJoinPrompt(cbChatId, cbMsgId);
            return res.status(200).json({ ok: true });
          }
          const mode = dataStr.slice(4);
          const text = extractEnglishFromCallbackMessage(cq.message, mode);
          if (!text) {
            await answerCallbackQuery(cq.id, "کلمه‌ای پیدا نشد.");
          } else {
            await answerCallbackQuery(cq.id, "در حال یافتن مترادف…");
            try {
              const out = await synonymsAndAntonym(text);
              await sendLongMessage(
                cbChatId,
                out || "نتیجه‌ای دریافت نشد.",
                cbMsgId,
              );
            } catch (e) {
              const detail = e instanceof Error ? e.message : String(e);
              console.error("syn error", detail);
              await sendMessage(
                cbChatId,
                `خطا در یافتن مترادف: ${detail.slice(0, 300)}`,
                cbMsgId,
              );
            }
          }
        } else {
          await answerCallbackQuery(cq.id);
        }
      } catch (e) {
        console.error("callback_query error", e);
      }
      return res.status(200).json({ ok: true });
    }

    const msg = update?.message ?? update?.edited_message ?? update?.channel_post;
    if (!msg) return res.status(200).json({ ok: true });
    const chatId = msg.chat?.id;
    const msgId = msg.message_id;
    const fromUserId = msg.from?.id;
    if (!chatId) return res.status(200).json({ ok: true });

    // Channel membership gate — only for private chats
    const chatType = msg.chat?.type;
    if ((chatType === "private" || !chatType) && fromUserId) {
      try {
        const ok = await isChannelMember(fromUserId);
        if (!ok) {
          await sendJoinPrompt(chatId, msgId);
          return res.status(200).json({ ok: true });
        }
      } catch (e) {
        console.error("membership check failed", e);
      }
    }

    try {
      // /start
      if (typeof msg.text === "string" && msg.text.startsWith("/start")) {
        await sendMessage(
          chatId,
          "سلام! 👋\nبرام بفرست تا به فارسی ترجمه کنم:\n• 📝 متن انگلیسی\n• 🖼 تصویر حاوی متن انگلیسی\n• 🎙 پیام صوتی یا فایل صوتی انگلیسی\n• 🎬 ویدیو انگلیسی (فایل زیرنویس .srt فارسی تحویل می‌گیری)\n\n🧪 تحلیل آزمایش پزشکی:\nعکس برگه‌ی آزمایش رو بفرست و توی کپشن بنویس «تحلیل» یا «آزمایش» (یا اول /analyze رو بزن).\n\n📚 مترادف و متضاد کلمه:\nبنویس: «مترادف <کلمه>» یا از دکمه‌ی زیر ترجمه‌ی متن استفاده کن. مثلاً: مترادف happy",
        );
        return res.status(200).json({ ok: true });
      }

      // /analyze command
      if (
        typeof msg.text === "string" &&
        (msg.text.startsWith("/analyze") || msg.text.startsWith("/test"))
      ) {
        await sendMessage(
          chatId,
          "🧪 حالت تحلیل آزمایش\nلطفاً عکس برگه‌ی آزمایشت رو بفرست و توی کپشنش بنویس: «تحلیل»\n(هرچی واضح‌تر و باکیفیت‌تر، تحلیل دقیق‌تر)",
        );
        return res.status(200).json({ ok: true });
      }

      // /synonyms command or "مترادف <word>" prefix
      if (typeof msg.text === "string") {
        const t = msg.text.trim();
        const lower = t.toLowerCase();
        let word = "";
        if (lower.startsWith("/synonyms") || lower.startsWith("/syn")) {
          word = t.replace(/^\/syn(onyms)?\s*/i, "").trim();
        } else if (t.startsWith("مترادف")) {
          word = t.replace(/^مترادف[:\s]*/, "").trim();
        }
        if (lower === "/synonyms" || lower === "/syn" || t === "مترادف") {
          await sendMessage(
            chatId,
            "📚 حالت مترادف و متضاد\nکلمه‌ی موردنظرتو بنویس، مثلاً:\n«مترادف happy»\nیا فقط بنویس: happy و بعد روی دکمه «📚 مترادف و متضاد» بزن.",
          );
          return res.status(200).json({ ok: true });
        }
        if (word) {
          try {
            const out = await synonymsAndAntonym(word);
            await sendLongMessage(
              chatId,
              out || "نتیجه‌ای دریافت نشد.",
              msgId,
            );
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            console.error("syn cmd error", detail);
            await sendMessage(
              chatId,
              `خطا در یافتن مترادف: ${detail.slice(0, 300)}`,
              msgId,
            );
          }
          return res.status(200).json({ ok: true });
        }
      }

      // Voice / Audio → SRT
      const audio = msg.voice || msg.audio;
      if (audio?.file_id) {
        await sendMessage(
          chatId,
          "در حال رونویسی صوت و ساخت زیرنویس فارسی… ⏳ (ممکنه چند ثانیه طول بکشه)",
          msgId,
        );
        try {
          const { srt, preview } = await transcribeAndTranslateMedia(
            audio.file_id,
            "audio",
          );
          const bytes = Buffer.from("\uFEFF" + srt, "utf-8");
          await sendDocument(
            chatId,
            "translation_fa.srt",
            bytes,
            "application/x-subrip",
            "زیرنویس فارسی ✅",
            msgId,
          );
          if (preview)
            await sendMessage(chatId, `پیش‌نمایش ترجمه:\n${preview}`, msgId);
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          console.error("audio error", detail);
          await sendMessage(
            chatId,
            `خطا در پردازش صوت: ${detail.slice(0, 400)}`,
            msgId,
          );
        }
        return res.status(200).json({ ok: true });
      }

      // Video → SRT
      const video = msg.video || msg.video_note;
      if (video?.file_id) {
        await sendMessage(
          chatId,
          "در حال پردازش ویدیو و ساخت زیرنویس فارسی… ⏳ (ممکنه کمی طول بکشه)",
          msgId,
        );
        try {
          const { srt, preview } = await transcribeAndTranslateMedia(
            video.file_id,
            "video",
          );
          const bytes = Buffer.from("\uFEFF" + srt, "utf-8");
          await sendDocument(
            chatId,
            "translation_fa.srt",
            bytes,
            "application/x-subrip",
            "زیرنویس فارسی ✅",
            msgId,
          );
          if (preview)
            await sendMessage(chatId, `پیش‌نمایش ترجمه:\n${preview}`, msgId);
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          console.error("video error", detail);
          await sendMessage(
            chatId,
            `خطا در پردازش ویدیو: ${detail.slice(0, 400)}`,
            msgId,
          );
        }
        return res.status(200).json({ ok: true });
      }

      // Photo
      if (Array.isArray(msg.photo) && msg.photo.length > 0) {
        const largest = msg.photo[msg.photo.length - 1];
        const analyze = wantsAnalysis(msg.caption);
        await sendMessage(
          chatId,
          analyze
            ? "در حال تحلیل برگه‌ی آزمایش… 🧪⏳ (ممکنه چند ثانیه طول بکشه)"
            : "در حال خواندن تصویر و ترجمه… ⏳",
          msgId,
        );
        try {
          if (analyze) {
            const analysis = await analyzeLabTestImage(largest.file_id);
            await sendLongMessage(
              chatId,
              analysis || "تحلیلی دریافت نشد.",
              msgId,
            );
          } else {
            const translation = await translateImage(largest.file_id);
            await sendMessage(
              chatId,
              translation || "ترجمه‌ای دریافت نشد.",
              msgId,
            );
            try {
              const english = await extractEnglishFromImage(largest.file_id);
              if (english && english.length > 1) {
                const body = `می‌خوای تلفظ انگلیسی متن داخل تصویرو بشنوی؟ 🔊\n\n${EN_MARKER} ${english}`;
                await sendMessage(chatId, body, msgId, ttsKeyboard("msg"));
              }
            } catch (e) {
              console.error("english extract error", e);
            }
          }
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          console.error("image error", detail);
          await sendMessage(
            chatId,
            `${analyze ? "خطا در تحلیل آزمایش" : "خطا در ترجمه تصویر"}: ${detail.slice(0, 400)}`,
            msgId,
          );
        }
        return res.status(200).json({ ok: true });
      }

      // Text
      if (typeof msg.text === "string" && msg.text.trim()) {
        const src = msg.text.trim();
        try {
          const translation = await translateText(src);
          const latinRatio =
            (src.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(src.length, 1);
          const english = latinRatio > 0.4 ? src : translation || "";
          const body = `${translation || "ترجمه‌ای دریافت نشد."}\n\n${EN_MARKER} ${english}`;
          await sendMessage(chatId, body, msgId, ttsKeyboard("msg"));
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          console.error("text error", detail);
          await sendMessage(
            chatId,
            `خطا در ترجمه: ${detail.slice(0, 400)}`,
            msgId,
          );
        }
        return res.status(200).json({ ok: true });
      }

      // Document containing audio or video
      const docMime =
        typeof msg.document?.mime_type === "string"
          ? msg.document.mime_type
          : "";
      if (
        msg.document?.file_id &&
        (docMime.startsWith("audio/") || docMime.startsWith("video/"))
      ) {
        const kind = docMime.startsWith("video/") ? "video" : "audio";
        await sendMessage(
          chatId,
          kind === "video"
            ? "در حال پردازش فایل ویدیو و ساخت زیرنویس فارسی… ⏳"
            : "در حال رونویسی فایل صوتی و ساخت زیرنویس فارسی… ⏳",
          msgId,
        );
        try {
          const { srt, preview } = await transcribeAndTranslateMedia(
            msg.document.file_id,
            kind,
          );
          const bytes = Buffer.from("\uFEFF" + srt, "utf-8");
          await sendDocument(
            chatId,
            "translation_fa.srt",
            bytes,
            "application/x-subrip",
            "زیرنویس فارسی ✅",
            msgId,
          );
          if (preview)
            await sendMessage(chatId, `پیش‌نمایش ترجمه:\n${preview}`, msgId);
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          console.error("media-doc error", detail);
          await sendMessage(
            chatId,
            `خطا در پردازش فایل: ${detail.slice(0, 400)}`,
            msgId,
          );
        }
        return res.status(200).json({ ok: true });
      }

      await sendMessage(
        chatId,
        "لطفاً متن، تصویر، صوت یا ویدیوی انگلیسی بفرست.",
        msgId,
      );
      return res.status(200).json({ ok: true });
    } catch (innerErr) {
      const detail =
        innerErr instanceof Error ? innerErr.message : String(innerErr);
      console.error("inner handler error", detail, innerErr);
      await sendMessage(
        chatId,
        `یه خطای غیرمنتظره رخ داد: ${detail.slice(0, 300)}`,
        msgId,
      );
      return res.status(200).json({ ok: true });
    }
  } catch (fatal) {
    console.error("FATAL translator webhook error", fatal);
    return res.status(200).json({ ok: true });
  }
};
