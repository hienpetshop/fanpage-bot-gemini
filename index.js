// ✅ Full code hoàn chỉnh: Auto trả lời tin nhắn + comment Facebook bằng Gemini API (có lưu comment_id vào file)

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAGE_ID = '100823721459300'; // ✅ ID thật của Fanpage bạn

const repliedFile = path.join(__dirname, "replied.json");
let repliedCommentIds = new Set();

// 🟢 Đọc các comment đã phản hồi trước đó từ file
if (fs.existsSync(repliedFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(repliedFile, "utf8"));
    if (Array.isArray(saved)) {
      repliedCommentIds = new Set(saved);
    }
  } catch (err) {
    console.error("⚠️ Không đọc được replied.json:", err.message);
  }
}

// 🔁 Hàm lưu Set vào file JSON
function saveRepliedIds() {
  try {
    fs.writeFileSync(repliedFile, JSON.stringify([...repliedCommentIds]), "utf8");
  } catch (err) {
    console.error("⚠️ Không lưu replied.json:", err.message);
  }
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const noidung_txt = fs.readFileSync("noidung.txt", "utf8");

app.get("/", (req, res) => {
  res.send("🤖 Bot Lộc Pet Shop đang chạy bằng Gemini miễn phí!");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      // ✅ Xử lý tin nhắn Messenger
      if (entry.messaging) {
        const webhook_event = entry.messaging[0];
        const sender_psid = webhook_event.sender.id;

        if (webhook_event.message) {
          const textMessage = webhook_event.message.text || "";
          const attachments = webhook_event.message.attachments || [];
          const imageAttachment = attachments.find(att => att.type === "image");

          try {
            let promptParts = [];

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

            if (imageAttachment) {
              const imageUrl = imageAttachment.payload.url;
              const imageBuffer = await axios.get(imageUrl, { responseType: "arraybuffer" });
              const base64Image = Buffer.from(imageBuffer.data, 'binary').toString('base64');

              promptParts.push({
                text: `${basePrompt}\n\nDưới đây là thông tin nội bộ cửa hàng:\n${noidung_txt}\n\nLời nhắn khách: ${textMessage}`
              });
              promptParts.push({
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image
                }
              });
            } else if (textMessage) {
              promptParts.push({
                text: `${basePrompt}\n\nDưới đây là thông tin nội bộ cửa hàng:\n${noidung_txt}\n\nLời nhắn khách: ${textMessage}`
              });
            }

            if (promptParts.length > 0) {
              const result = await model.generateContent({ contents: [{ parts: promptParts }] });
              const reply = result.response.text().trim() || "Bạn cần tư vấn gì thêm? Gửi hình hoặc hỏi mình tư vấn nha!";

              await axios.post(
                `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                {
                  recipient: { id: sender_psid },
                  messaging_type: "RESPONSE",
                  message: { text: reply }
                }
              );
            }
          } catch (error) {
            console.error("❌ Lỗi xử lý Gemini:", error.message || error);
          }
        }
      }

      // ✅ Xử lý comment Facebook
      if (entry.changes) {
        for (const change of entry.changes) {
          const value = change.value;

          if (
            change.field === "feed" &&
            value.item === "comment" &&
            value.message &&
            value.from &&
            value.from.id !== PAGE_ID &&
            !repliedCommentIds.has(value.comment_id)
          ) {
            console.log("📥 Nhận comment từ người khác:", value.message);
            const userComment = value.message;
            const commentId = value.comment_id;

            try {
              const geminiRes = await model.generateContent({
                contents: [
                  {
                    parts: [
                      {
                        text: `Bạn là nhân viên fanpage Lộc Pet Bà Rịa. Hãy trả lời bình luận sau bằng tiếng Việt tự nhiên, thân thiện, ngắn gọn như người thật đang dùng Facebook.

✅ Trả lời giống như đang rep comment – chỉ 1 đến 2 câu là đủ, ngắn gọn, đúng trọng tâm.
✅ Trả lời giống như đang trả lời nhanh của người thật, đúng ngữ cảnh, không cần quá lịch sự.
❌ Tuyệt đối **không được viết dài dòng**, **không dùng "hoặc... hoặc..."**.
❌ Nếu khách hỏi kiểu: "Giá bao nhiêu?", "Giá?", "Nhiêu?", "Nhiêu vậy?" — thì **không nêu chính xác giá**. Hãy trả lời kiểu:
→ "Dạ, giá tùy loại ạ, Inbox hoặc add Zalo 0908 725270, em sẽ cho thông tin cụ thể hơn ạ!": "${userComment}"`
                      }
                    ]
                  }
                ]
              });

              const reply = geminiRes.response.text().trim() || "Cảm ơn bạn đã quan tâm ạ!";

              const resApi = await axios.post(
                `https://graph.facebook.com/v19.0/${commentId}/comments`,
                { message: reply, access_token: PAGE_ACCESS_TOKEN }
              );

              repliedCommentIds.add(resApi.data.id);
              saveRepliedIds(); // ✅ Lưu lại ID vào file
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

app.listen(3000, () => {
  console.log("🚀 Bot đang chạy tại http://localhost:3000 (Gemini + Messenger + Comment)");
});
