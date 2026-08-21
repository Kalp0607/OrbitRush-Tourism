require("dotenv").config();
const { Router } = require("express");
const aiRoute = require("../routes/aiAssistant");

// Test callGeminiAPI via endpoint or directly
async function testFull() {
  const toursCatalog = [
    { _id: "1", name: "Magical Goa Beach Tour", location: "Goa", price: 15000, duration: "4 Days" }
  ];
  const messagesHistory = [{ sender: "user", text: "I want to visit Goa for 4 days" }];
  const currentState = {};

  console.log("Calling full backend handler logic...");
  try {
    const res = await fetch("http://localhost:8008/api/ai-assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messagesHistory, state: currentState })
    });
    console.log("Response status:", res.status);
    const data = await res.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Test failed:", e.message);
  }
}

testFull();
