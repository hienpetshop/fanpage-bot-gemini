// ✅ Bot Facebook + Gemini + Cloudinary + Auto Post 4 bài/ngày (6h15, 11h15, 17h30, 20h30)
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(bodyParser.json());

app.get("/ping", (req, res) => {
  res.send("✅ Bot đang thức - ping thành công!");
});

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAGE_ID = process.env.PAGE_ID;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const repliedFile = path.join(__dirname, "replied.json");
if (!fs.existsSync(repliedFile)) {
  fs.writeFileSync(repliedFile, "[]", "utf8");
}

let repliedCommentIds = new Set();
try {
  const saved = JSON.parse(fs.readFileSync(repliedFile, "utf8"));
  if (Array.isArray(saved)) repliedCommentIds = new Set(saved);
} catch (err) {
  console.error("❌ Lỗi đọc replied.json:", err.message);
}

function saveRepliedIds() {
  try {
    fs.writeFileSync(repliedFile, JSON.stringify([...repliedCommentIds]), "utf8");
  } catch (err) {
    console.error("❌ Lỗi ghi replied.json:", err.message);
  }
}

const repliedImageFile = path.join(__dirname, "replied_images.json");
let repliedImageIds = new Set();
if (fs.existsSync(repliedImageFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(repliedImageFile, "utf8"));
    if (Array.isArray(saved)) repliedImageIds = new Set(saved);
  } catch (err) {
    console.error("❌ Lỗi đọc replied_images.json:", err.message);
  }
}
function saveRepliedImages() {
  try {
    fs.writeFileSync(repliedImageFile, JSON.stringify([...repliedImageIds]), "utf8");
  } catch (err) {
    console.error("❌ Lỗi ghi replied_images.json:", err.message);
  }
}

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
      if (entry.messaging && entry.messaging.length > 0) {
        const webhook_event = entry.messaging[0];
        const sender_psid = webhook_event.sender.id;
        if (webhook_event.message) {
          const textMessage = webhook_event.message.text || "";
          const attachments = webhook_event.message.attachments;
          if (!textMessage && attachments && attachments[0]?.type === "image") {
            const imageUrl = attachments[0].payload.url;

            // ⏱️ Kiểm tra thời gian gửi ảnh, chỉ xử lý nếu ảnh mới gửi (trong 10 giây)
            const timestamp = webhook_event.timestamp;
            const now = Date.now();
            if (!timestamp || now - timestamp > 10000) {
              console.warn("⏱️ Ảnh cũ quá (gửi lại webhook), bỏ qua.");
              return;
            }

            const uniqueKey = `${sender_psid}_${imageUrl}`;
            if (repliedImageIds.has(uniqueKey)) {
              console.log("⚠️ Ảnh này từ người này đã được trả lời. Bỏ qua.");
              return;
            }
            repliedImageIds.add(uniqueKey);
            saveRepliedImages();
            console.log("📷 Nhận ảnh từ URL:", imageUrl);
            try {
              const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
              const base64Image = Buffer.from(response.data, "binary").toString("base64");
              const result = await model.generateContent([
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Image,
                  },
                },
                {
                  text: "Đây là ảnh một con chó hoặc mèo. Đoán giống và ước tính giá bán tại Shop. Trả lời ngắn gọn, dễ hiểu."
                }
              ]);
              const reply = result.response.text().trim();
              await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                recipient: { id: sender_psid },
                messaging_type: "RESPONSE",
                message: { text: reply },
              });
              console.log("✅ Đã trả lời ảnh thành công!");
            } catch (err) {
              console.error("❌ Lỗi xử lý ảnh:", err.message);
            }
            return;
          }

function getTodayFolder(buoi) {
  const now = new Date();
  now.setHours(now.getHours() + 7);
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `ngay-${dd}-${mm}-${yyyy}/${buoi}`;
}

async function getImageUrls(folderName) {
  try {
    const res = await cloudinary.search
      .expression(`folder:${folderName} AND resource_type:image`)
      .sort_by("public_id", "asc")
      .max_results(10)
      .execute();
    return res.resources.map(file => file.secure_url);
  } catch (err) {
    console.error("❌ Lỗi lấy ảnh:", err.message);
    return [];
  }
}

async function getVideoUrl(folderName) {
  try {
    const res = await cloudinary.search
      .expression(`folder:${folderName} AND resource_type:video`)
      .sort_by("public_id", "asc")
      .max_results(1)
      .execute();
    return res.resources[0]?.secure_url || null;
  } catch (err) {
    console.error("❌ Lỗi lấy video:", err.message);
    return null;
  }
}

async function genCaption(buoi) {
  const prompt = `Viết caption Facebook buổi ${buoi} cho fanpage thú cưng.

✨ Viết như một người nuôi thú cưng thật đang kể chuyện thường ngày, giọng điệu gần gũi, nhẹ nhàng, xen chút hài hước đời thường. Không viết kiểu quảng cáo, không thuyết phục người đọc.

❌ Tuyệt đối không dùng từ như: "bán", "mua", "giá", "tìm nhà", "tìm chủ", "liên hệ", "nhắn tin", "đặt cọc", "giao", "ship".

✅ Nội dung phải khiến người đọc *ngầm hiểu* là bé thú cưng đang sẵn sàng cho một chặng hành trình mới, nhưng thể hiện qua cảm xúc và hành động của bé (như háo hức, tò mò, chuẩn bị đi chơi, dậy sớm, ngắm nắng...).

✅ Mỗi caption tối đa 3 câu. Mỗi câu xuống dòng riêng.

📌 Mỗi câu nên bắt đầu bằng icon như: 🐶, 😺, ❤️, ✨, 🏡, 💌, 🎒, ☀️, 🐾...

Ví dụ phong cách đúng:  
☀️ Sáng nay bé Mỡ dậy từ 5h, nằm ngó trời ngó đất như đang suy nghĩ chuyện lớn.  
🐾 Chắc đang lên kế hoạch cho cuộc khám phá ngày mới đó!  
😄 Bé ngoan quá trời luôn á!`;

  const result = await modelText.generateContent({
    contents: [
      {
        parts: [ { text: prompt } ]
      }
    ]
  });
  return result.response.text().trim();
}

async function postAlbumWithPhotos(imageUrls, caption) {
  try {
    const uploaded = await Promise.all(
      imageUrls.map(url =>
        axios.post(`https://graph.facebook.com/${PAGE_ID}/photos`, {
          url,
          published: false,
          access_token: PAGE_ACCESS_TOKEN,
        }).then(res => res.data.id)
      )
    );
    await axios.post(`https://graph.facebook.com/${PAGE_ID}/feed`, {
      message: caption,
      attached_media: uploaded.map(id => ({ media_fbid: id })),
      access_token: PAGE_ACCESS_TOKEN,
    });
    console.log("✅ Đăng album ảnh thành công!");
  } catch (err) {
    console.error("❌ Lỗi đăng album ảnh:", err.response?.data || err.message);
  }
}

async function postVideo(videoUrl, caption) {
  try {
    await axios.post(`https://graph.facebook.com/${PAGE_ID}/videos`, {
      file_url: videoUrl,
      description: caption,
      access_token: PAGE_ACCESS_TOKEN,
    });
    console.log("✅ Đăng video thành công!");
  } catch (err) {
    console.error("❌ Lỗi đăng video:", err.response?.data || err.message);
  }
}

cron.schedule("15 23 * * *", async () => {
  const folder = getTodayFolder("sang");
  const images = await getImageUrls(folder);
  const first4 = images.slice(0, 4);
  if (first4.length === 4) {
    const caption = await genCaption("sáng");
console.log("📢 Caption sáng:", caption);
    await postAlbumWithPhotos(first4, caption);
  } else {
    console.warn("⚠️ Không đủ ảnh sáng để đăng!");
  }
});

cron.schedule("15 4 * * *", async () => {
  const folder = getTodayFolder("trua");
  const videoUrl = await getVideoUrl(folder);
  if (videoUrl) {
    const caption = await genCaption("trưa");
console.log("📢 Caption trưa:", caption);
    await postVideo(videoUrl, caption);
  } else {
    console.warn("⚠️ Không tìm thấy video để đăng trưa!");
  }
});

cron.schedule("30 10 * * *", async () => {
  const folder = getTodayFolder("chieu");
  const images = await getImageUrls(folder);
  const first4 = images.slice(0, 4);
  if (first4.length === 4) {
    const caption = await genCaption("chiều");
console.log("📢 Caption chiều:", caption);
    await postAlbumWithPhotos(first4, caption);
  } else {
    console.warn("⚠️ Không đủ ảnh chiều để đăng!");
  }
});

cron.schedule("30 13 * * *", async () => {
  const folder = getTodayFolder("toi");
  const videoUrl = await getVideoUrl(folder);
  if (videoUrl) {
    const caption = await genCaption("tối");
console.log("📢 Caption tối:", caption);
    await postVideo(videoUrl, caption);
  } else {
    console.warn("⚠️ Không tìm thấy video để đăng tối!");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot đang chạy tại cổng ${PORT} (Gemini + Messenger + Comment + AutoPost)`);
});
