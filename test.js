const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require("axios");
require("dotenv").config();

(async () => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelVision = genAI.getGenerativeModel({ model: "gemini-1.5-pro-vision" });

  const imageUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
  const imageBuffer = await axios.get(imageUrl, { responseType: "arraybuffer" });

  try {
    const result = await modelVision.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: Buffer.from(imageBuffer.data).toString("base64"),
        },
      },
      {
        text: "Mô tả nội dung ảnh bằng tiếng Việt.",
      }
    ]);

    console.log("✅ Kết quả từ Gemini:", result.response.text());
  } catch (err) {
    console.error("❌ Lỗi:", err.response?.data || err.message);
  }
})();

