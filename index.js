const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

const firebaseConfig = JSON.parse(process.env.FIREBASE_KEY_JSON);
admin.initializeApp({ credential: admin.credential.cert(firebaseConfig) });
const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAGE_ID = "109777333867290";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const noidung_txt = fs.readFileSync("noidung.txt", "utf8");

app.get("/", (req, res) => {
  res.send("🤖 Bot Lộc Pet Shop đang chạy bằng Gemini + Firestore!");
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
      // ✅ Trả lời tin nhắn
      if (entry.messaging) {
        const webhook_event = entry.messaging[0];
        const sender_psid = webhook_event.sender.id;

        if (webhook_event.message) {
          const textMessage = webhook_event.message.text || "";
          const attachments = webhook_event.message.attachments || [];
          const imageAttachment = attachments.find(att => att.type === "image");

          try {
            const basePrompt = `Bạn là nhân viên bán hàng online của fanpage Lộc Pet Shop. Trả lời như đang chat Facebook: ngắn gọn, thân thiện, đúng trọng tâm. 
❌ Không hỏi kiểu: “bạn cần gì?”, “shop có nhiều loại”, v.v.
✅ Nếu khách gửi ảnh chó/mèo: đoán giống, tư vấn giá.
✅ Nếu khách hỏi giá thì trả lời đúng theo thông tin.
➡ Nếu khách xin hình/video: luôn trả lời: "Qua zalo: 0908 725270 xem giúp em, có chủ em gửi ảnh đẹp rõ nét liền ạ!"`;

            const promptParts = [];

            if (imageAttachment) {
              const imageUrl = imageAttachment.payload.url;
              const imageBuffer = await axios.get(imageUrl, { responseType: "arraybuffer" });
              const base64Image = Buffer.from(imageBuffer.data, "binary").toString("base64");
              promptParts.push({ text: `${basePrompt}\n\nNội dung nội bộ:\n${noidung_txt}\n\nKhách nhắn: ${textMessage}` });
              promptParts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
            } else {
              promptParts.push({ text: `${basePrompt}\n\nNội dung nội bộ:\n${noidung_txt}\n\nKhách nhắn: ${textMessage}` });
            }

            const result = await model.generateContent({ contents: [{ parts: promptParts }] });
            const reply = result.response.text().trim() || "Bạn cần tư vấn gì thêm? Gửi hình hoặc hỏi mình tư vấn nha!";

            await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
              recipient: { id: sender_psid },
              messaging_type: "RESPONSE",
              message: { text: reply }
            });
          } catch (error) {
            console.error("❌ Lỗi trả lời tin nhắn:", error.message || error);
          }
        }
      }

      // ✅ Trả lời comment
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
            const userComment = value.message;
            const commentId = value.comment_id;

            try {
              const geminiRes = await model.generateContent({
                contents: [
                  {
                    parts: [
                      {
                        text: `Bạn là nhân viên fanpage Lộc Pet Bà Rịa. Trả lời bình luận sau bằng tiếng Việt ngắn gọn, thân thiện như người thật dùng Facebook.
✅ Nếu là lời khen (ví dụ: “đẹp”, “iu quá”) thì trả lời cảm ơn nhẹ nhàng.
✅ Nếu là câu hỏi: giống chó, màu lông, chăm sóc → trả lời ngắn đúng trọng tâm.
❌ Không trả lời dài dòng hay nêu giá.
➡ Bình luận khách: "${userComment}"`
                      }
                    ]
                  }
                ]
              });

              const reply = geminiRes.response.text().trim() || "Cảm ơn bạn đã quan tâm ạ!";

              await axios.post(`https://graph.facebook.com/v19.0/${commentId}/comments`, {
                message: reply,
                access_token: PAGE_ACCESS_TOKEN
              });

              await db.collection("replied_comments").doc(commentId).set({
                comment: userComment,
                reply: reply,
                commentId: commentId,
                time: new Date().toISOString()
              });
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
  console.log("🚀 Bot Lộc Pet đang chạy tại http://localhost:3000");
});
