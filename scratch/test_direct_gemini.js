require("dotenv").config();
const Tour = require("../models/tour");
const mongoose = require("mongoose");

// We can test Gemini request payload directly
async function directTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Using API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "NONE");

  const systemInstructionText = `You are OrbitRush AI Tour Assistant. Respond strictly in JSON:
{
  "reply": "text",
  "extractedState": { "destination": "Goa", "duration": "4 Days" },
  "suggestedTours": [],
  "itinerary": [
    { "day": 1, "title": "Arrival", "description": "Check in" }
  ],
  "isReadyForEnquiry": true
}`;

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: "Plan a trip to Goa for 4 days" }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7
    }
  };

  const modelName = "gemini-3.6-flash";
  console.log(`Sending payload to ${modelName}...`);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log("HTTP Status:", res.status);
  const data = await res.json();
  console.log("Returned Data:", JSON.stringify(data, null, 2));
}

directTest();
