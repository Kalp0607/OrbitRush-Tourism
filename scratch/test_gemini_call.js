require("dotenv").config();

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  const payload = {
    system_instruction: {
      parts: [{ text: "You are a helpful travel assistant. Reply in JSON format: {\"reply\": \"string\"}" }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: "Hello! Plan a 2 day trip to Goa" }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const models = [
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash-exp",
    "gemini-pro"
  ];

  for (const m of models) {
    console.log(`Testing model ${m}...`);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      console.log(`Status for ${m}:`, res.status);
      const text = await res.text();
      console.log(`Response body for ${m}:`, text.substring(0, 300));
    } catch (e) {
      console.error(`Error for ${m}:`, e.message);
    }
  }
}

testGemini();
