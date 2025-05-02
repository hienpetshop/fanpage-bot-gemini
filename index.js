const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message) {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const noidung_txt = fs.readFileSync("noidung.txt", "utf8");

        const textMessage = webhook_event.message.text || "";
        const attachments = webhook_event.message.attachments || [];
        const imageAttachment = attachments.find(att => att.type === "image");

        try {
          let promptParts = [];

          if (imageAttachment) {
            const imageUrl = imageAttachment.payload.url;
            const imageBuffer = await axios.get(imageUrl, { responseType: "arraybuffer" });
            const base64Image = Buffer.from(imageBuffer.data, 'binary').toString('base64');

            promptParts.push({
              text: `Bạn là người bán hàng online của fanpage Lộc Pet Shop. Trả lời tự nhiên, giống nhân viên tư vấn trên Facebook. Văn phong ngắn gọn, dễ hiểu, như đang nhắn tin với khách.
Tập trung đúng thông tin khách cần, không dài dòng, không nói thừa.
Không dùng văn vở lịch sự quá mức. Tránh kiểu “chào bạn”, “cảm ơn”, v.v.
Dưới đây là thông tin nội bộ cửa hàng:
${noidung_txt}

Lời nhắn khách: ${textMessage}`
            });

            promptParts.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image
              }
            });
          } else if (textMessage) {
            promptParts.push({
              text: `Bạn là người bán hàng online của fanpage Lộc Pet Shop. Trả lời tự nhiên, giống nhân viên tư vấn trên Facebook. Văn phong ngắn gọn, dễ hiểu, như đang nhắn tin với khách.
Tập trung đúng thông tin khách cần, không dài dòng, không nói thừa.
Không dùng văn vở lịch sự quá mức. Tránh kiểu “chào bạn”, “cảm ơn”, v.v.
Dưới đây là thông tin nội bộ cửa hàng:
${noidung_txt}

Lời nhắn khách: ${textMessage}`
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
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

app.listen(3000, () => {
  console.log("🚀 Bot đang chạy tại http://localhost:3000 (Gemini + Ảnh + Văn bản)");
});
