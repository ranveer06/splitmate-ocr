import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OCR_API_KEY = process.env.OCR_SPACE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/ocr", async (req, res) => {
  try {
    const { imageUrl, filetype } = req.body;

    console.log("[REQUEST] /ocr - imageUrl:", imageUrl);

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: OCR_API_KEY,
      },
      body: new URLSearchParams({
        url: imageUrl,
        OCREngine: "2",
        filetype: filetype || "JPG",
      }),
    });

    const data = await response.json();

    console.log("[OCR API RESPONSE]", JSON.stringify(data, null, 2)); // log full OCR API response

    if (data.IsErroredOnProcessing) {
      console.error("[OCR ERROR]", data.ErrorMessage || data.ErrorDetails || data);
      return res.status(500).json({ error: data.ErrorMessage || "OCR processing error" });
    }

    const text = data.ParsedResults?.[0]?.ParsedText || "";
    res.status(200).json({ text });
  } catch (err) {
    console.error("[SERVER ERROR] OCR Failure:", err);
    res.status(500).json({ error: "Unexpected OCR failure." });
  }
});

app.post("/parse", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing OCR text" });
  }

  try {
    console.log("[REQUEST] /parse - text length:", text.length);

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
            content:
              "You are a receipt parser. Extract item names and their prices from the receipt text. Also extract subtotal, tax, and total. Return as JSON.",
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
    console.log("[OpenAI RESPONSE]", JSON.stringify(data, null, 2)); // log full OpenAI API response

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
    console.error("[SERVER ERROR] LLM Parse Failure:", err);
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
