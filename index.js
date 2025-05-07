// ✅ Bot Facebook + Gemini + Ghi log rõ ràng
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAGE_ID = process.env.PAGE_ID;

const repliedFile = path.join(__dirname, "replied.json");
let repliedCommentIds = new Set();

if (fs.existsSync(repliedFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(repliedFile, "utf8"));
    if (Array.isArray(saved)) repliedCommentIds = new Set(saved);
  } catch (err) {
    console.error("❌ Lỗi đọc replied.json:", err.message);
  }
}

function saveRepliedIds() {
  try {
    fs.writeFileSync(repliedFile, JSON.stringify([...repliedCommentIds]), "utf8");
  } catch (err) {
    console.error("❌ Lỗi ghi replied.json:", err.message);
  }
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const noidung_txt = fs.readFileSync("noidung.txt", "utf8");

app.get("/", (req, res) => {
  res.send("🤖 Bot đang chạy bằng Gemini API + Facebook");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook đã được Facebook xác nhận");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  console.log("📨 Đã nhận webhook từ Facebook");
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      // ✅ Xử lý inbox
      if (entry.messaging) {
        const webhook_event = entry.messaging[0];
        const sender_psid = webhook_event.sender.id;

        if (webhook_event.message) {
          const textMessage = webhook_event.message.text || "";
          console.log("💬 Nhận inbox:", textMessage);

          try {
            const basePrompt = `Bạn là nhân viên bán hàng online của fanpage Lộc Pet Shop. Trả lời như đang chat Facebook: ngắn gọn, tự nhiên, thân thiện, đúng trọng tâm, không văn vở, không dùng \"Chào bạn!\" liên tục.

❌ Không hỏi kiểu: “bạn cần gì”, “shop có nhiều loại”, “xem chó hay mèo”, “hình vậy là sao”. Nếu không chắc chắn thì bỏ qua, không suy đoán.
✅ Nếu khách hỏi tư vấn cách chăm sóc chó/mèo, thì **trích nội dung quan trọng và tóm gọn đủ ý trong phần hướng dẫn chăm sóc** từ nội dung nội bộ (nếu có), không được nói chung chung.
✅ Nếu khách gửi ảnh chó/mèo: đoán giống, tư vấn giá, size, màu sắc nếu rõ thông tin.
✅ Nếu khách hỏi giá thì trả lời đúng theo thông tin.
➡ Nếu khách xin hình/video: luôn trả lời đúng câu này: \"Qua zalo: 0908 725270 xem giúp em, có chủ em gửi ảnh đẹp rõ nét liền ạ!\"
  
🤝 Nếu không hiểu rõ ý khách, lịch sự nhờ khách làm rõ lại, ví dụ:
\"Khách nói giúp em rõ hơn với ạ, để em hỗ trợ chính xác nhất nha.\"

⚡️ Luôn chú ý cảm xúc của khách: 
- Nếu khách có vẻ vội, hãy trả lời thật nhanh.
- Nếu khách thân thiện, hãy trả lời vui vẻ, thêm icon cảm xúc.
- Nếu khách khó tính, trả lời thật rõ ràng, chuyên nghiệp.`;

            const result = await model.generateContent({
              contents: [
                {
                  parts: [
                    { text: `${basePrompt}\n\nDưới đây là thông tin nội bộ cửa hàng:\n${noidung_txt}\n\nLời nhắn khách: ${textMessage}` }
                  ]
                }
              ]
            });

            const reply = result.response.text().trim();
            await axios.post(
              `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
              {
                recipient: { id: sender_psid },
                messaging_type: "RESPONSE",
                message: { text: reply || "Mình nhận được rồi nha!" },
              }
            );
            console.log("✅ Đã trả lời inbox thành công!");
          } catch (err) {
            console.error("❌ Lỗi trả lời inbox:", err.message);
          }
        }
      }

      // ✅ Xử lý comment
      if (entry.changes) {
        for (const change of entry.changes) {
          const value = change.value;

          if (
            change.field === "feed" &&
            value.item === "comment" &&
            value.message &&
            value.from?.id !== PAGE_ID &&
            !repliedCommentIds.has(value.comment_id)
          ) {
            const userComment = value.message;
            const commentId = value.comment_id;
            console.log("💬 Nhận comment:", userComment);

            try {
              const result = await model.generateContent({
                contents: [
                  {
                    parts: [
                      {
                        text: `Bạn là nhân viên fanpage Lộc Pet Bà Rịa. Hãy trả lời bình luận Facebook sau bằng tiếng Việt, tự nhiên, ngắn gọn, giống như người thật đang rep nhanh trên Facebook. Tránh lặp lại nội dung nội bộ, không trả lời giá cụ thể, không giải thích dài dòng. \n\nNội dung bình luận khách: \"${userComment}\"`
                      }
                    ]
                  }
                ]
              });

              const reply = result.response.text().trim();
              const resApi = await axios.post(
                `https://graph.facebook.com/v19.0/${commentId}/comments`,
                { message: reply, access_token: PAGE_ACCESS_TOKEN }
              );

              repliedCommentIds.add(resApi.data.id);
              saveRepliedIds();
              console.log("✅ Đã trả lời comment thành công!");
            } catch (err) {
              console.error("❌ Lỗi trả lời comment:", err.response?.data || err.message);
            }
          }
        }
      }
    }
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// ✅ Hàm đăng bài kiểu feed (caption nằm trên ảnh hoặc video)
async function postFeedWithMedia(mediaUrl, message) {
  const url = `https://graph.facebook.com/${PAGE_ID}/feed`;
  try {
    const res = await axios.post(url, {
      message: message,
      link: mediaUrl,
      access_token: PAGE_ACCESS_TOKEN,
    });
    console.log("✅ Đăng bài /feed thành công:", res.data);
  } catch (err) {
    console.error("❌ Lỗi đăng bài /feed:", err.response?.data || err.message);
  }
}

// 🕘 Tự động đăng bài mỗi ngày lúc 9h sáng (giờ VN = 2h UTC)
cron.schedule("0 2 * * *", () => {
  const today = new Date().getDate();
  if (today % 2 === 0) {
    postFeedWithMedia(
      "https://yourcdn.com/image.jpg",
      "📸 Hôm nay có ảnh siêu cưng đây cả nhà ơi!"
    );
  } else {
    postFeedWithMedia(
      "https://yourcdn.com/video.mp4",
      "🎥 Video hot hôm nay, coi liền cho nóng!"
    );
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot đang chạy tại cổng ${PORT} (Gemini + Messenger + Comment)`);
});
