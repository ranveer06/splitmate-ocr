import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OCR_API_KEY = process.env.OCR_SPACE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/ocr", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    console.log(`[REQUEST] /ocr - imageUrl: ${imageUrl}`);

    // Download the image first
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Failed to fetch image from URL");
    const imageBuffer = await imageResponse.buffer();

    // Prepare multipart/form-data
    const formData = new FormData();
    formData.append("file", imageBuffer, { filename: "receipt.jpg" });
    formData.append("OCREngine", "2");

    const ocrResponse = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: OCR_API_KEY,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const data = await ocrResponse.json();
    console.log("[OCR API RESPONSE]", JSON.stringify(data, null, 2));

    if (data.IsErroredOnProcessing) {
      console.error("[OCR ERROR]", data.ErrorMessage);
      return res.status(500).json({ error: data.ErrorMessage });
    }

    const text = data.ParsedResults?.[0]?.ParsedText || "";
    res.status(200).json({ text });
  } catch (err) {
    console.error("OCR Failure:", err);
    res.status(500).json({ error: "Unexpected OCR failure." });
  }
});

// /parse route stays the same...
app.post("/parse", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing OCR text" });
  }

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a receipt parser. Extract item names and their prices from the receipt text. Also extract subtotal, tax, and total. Return as JSON.",
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.3,
      }),
    });

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) throw new Error("Failed to get response from OpenAI.");

    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch (e) {
      parsed = { raw: reply };
    }

    res.json(parsed);
  } catch (err) {
    console.error("LLM Parse Failure:", err);
    res.status(500).json({ error: "Failed to parse receipt with LLM" });
  }
});

app.get("/", (req, res) => {
  res.send("Splitmate OCR/LLM API is live.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
