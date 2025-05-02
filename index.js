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

      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;
        console.log("💬 Tin nhắn khách:", userMessage);

        try {
          const noidung_txt = fs.readFileSync("noidung.txt", "utf8");

          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

          const prompt = \`
Bạn đang đóng vai người bán hàng online của fanpage Lộc Pet Shop. Trả lời thật ngắn gọn (1 câu, tối đa 20 từ), thân thiện, giống chị bán hàng Facebook.

🌟 Chọn 1 trong các mẫu nếu phù hợp:
- Có bé Poodle nha bạn, giá tầm 2tr5 – 3tr5 🐶 dễ thương lắm!
- Có nha, nhiều giống lắm, bạn muốn loại nào mình gửi giá liền!
- Nhắn Zalo 0908 725270 giúp mình nha, gửi hình dễ nói hơn 💬

❗ Nếu không biết câu nào phù hợp, trả lời:
"Bạn nhắn Zalo 0908 725270 giúp mình nha!"

---
Thông tin nội bộ của shop:

\${noidung_txt}
Tin nhắn khách: \${userMessage}
\`;

          const result = await model.generateContent(prompt);
          const reply = result.response.text().trim();

          await axios.post(
            \`https://graph.facebook.com/v18.0/me/messages?access_token=\${PAGE_ACCESS_TOKEN}\`,
            {
              recipient: { id: sender_psid },
              messaging_type: "RESPONSE",
              message: { text: reply || "Shop đang cập nhật, nhắn qua Zalo 0908 725270 nhé!" }
            }
          );
        } catch (error) {
          console.error("❌ Lỗi phản hồi Gemini:", error.message || error);
        }
      }
    }
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

app.listen(3000, () => {
  console.log("🚀 Bot đang chạy tại http://localhost:3000 (Google Gemini)");
});
