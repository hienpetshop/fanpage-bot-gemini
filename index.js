const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

// ✅ Khởi tạo Firestore từ biến môi trường FIREBASE_KEY_JSON
const firebaseConfig = JSON.parse(process.env.FIREBASE_KEY_JSON);
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
});
const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAGE_ID = '109777333867290';

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
      // ✅ Xử lý tin nhắn
      if (entry.messaging) {
        const webhook_event = entry.messaging[0];
        const sender_psid = webhook_event.sender.id;

        if (webhook_event.message) {
          const textMessage = webhook_event.message.text || "";
          const attachments = webhook_event.message.attachments || [];
          const imageAttachment = attachments.find(att => att.type === "image");

          try {
            let promptParts = [];

            const basePrompt = `Bạn là nhân viên bán hàng online của fanpage Lộc Pet Shop. Trả lời như đang chat Facebook: ngắn gọn, tự nhiên, thân thiện, đúng trọng tâm, không văn vở, không dùng "Chào bạn!" liên tục.

❌ Không hỏi kiểu: “bạn cần gì”, “shop có nhiều loại”, “xem chó hay mèo”, “hình vậy là sao”. Nếu không chắc chắn thì bỏ qua, không suy đoán.
✅ Nếu khách hỏi tư vấn cách chăm sóc chó/mèo, thì **trích nội dung quan trọng và tóm gọn đủ ý trong phần hướng dẫn chăm sóc** từ nội dung nội bộ (nếu có), không được nói chung chung.
✅ Nếu khách gửi ảnh chó/mèo: đoán giống, tư vấn giá, size, màu sắc nếu rõ thông tin.
✅ Nếu khách hỏi giá thì trả lời đúng theo thông tin.
➡ Nếu khách xin hình/video: luôn trả lời đúng câu này: "Qua zalo: 0908 725270 xem giúp em, có chủ em gửi ảnh đẹp rõ nét liền ạ!"

🤝 Nếu không hiểu rõ ý khách, lịch sự nhờ khách làm rõ lại, ví dụ:
"Khách nói giúp em rõ hơn với ạ, để em hỗ trợ chính xác nhất nha."

⚡️ Luôn chú ý cảm xúc của khách:
- Nếu khách có vẻ vội, hãy trả lời thật nhanh.
- Nếu khách thân thiện, hãy trả lời vui vẻ, thêm icon cảm xúc.
- Nếu khách khó tính, trả lời thật rõ ràng, chuyên nghiệp.`;

            if (imageAttachment) {
              const imageUrl = imageAttachment.payload.url;
              const imageBuffer = await axios.get(imageUrl, { responseType: "arraybuffer" });
              const base64Image = Buffer.from(imageBuffer.data, 'binary').toString('base64');
              promptParts.push({ text: `${basePrompt}\n\nDưới đây là thông tin nội bộ cửa hàng:\n${noidung_txt}\n\nLời nhắn khách: ${textMessage}` });
              promptParts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
            } else if (textMessage) {
              promptParts.push({ text: `${basePrompt}\n\nDưới đây là thông tin nội bộ cửa hàng:\n${noidung_txt}\n\nLời nhắn khách: ${textMessage}` });
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

      // ✅ Xử lý comment
      if (entry.changes) {
        for (const change of entry.changes) {
          const value = change.value;
          if (
            change.field === "feed" &&
            value.item === "comment" &&
            value.message &&
            value.from &&
            value.from.id !== PAGE_ID
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
                        text: `Bạn là nhân viên fanpage Lộc Pet Bà Rịa. Trả lời bình luận sau bằng tiếng Việt ngắn gọn, thân thiện như người thật đang dùng Facebook.

✅ Nếu bình luận chỉ là lời khen (ví dụ: “đẹp”, “cưng”, “đẹp quá”, “iu ghê”, “dễ thương vậy trời”) hoặc không rõ mục đích thì chỉ cần trả lời cảm ơn nhẹ nhàng, ví dụ: “Dạ em cảm ơn ạ! 🥰” hoặc “Thương quá trời luôn, cảm ơn bạn nhen!”.
✅ Nếu là câu hỏi (giống chó, màu lông, tư vấn, chăm sóc...) thì trả lời đúng trọng tâm.
❌ Không được trả lời dài dòng, không nêu giá, không thêm ví dụ khác.
➡ Nội dung bình luận khách cần phản hồi là: "${userComment}"`
                      }
                    ]
                  }
                ]
              });

              const reply = geminiRes.response.text().trim() || "Cảm ơn bạn đã quan tâm ạ!";
              await axios.post(
                `https://graph.facebook.com/v19.0/${commentId}/comments`,
                { message: reply, access_token: PAGE_ACCESS_TOKEN }
              );
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
