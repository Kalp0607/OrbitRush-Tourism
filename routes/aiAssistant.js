const express = require("express");
const router = express.Router();
const Tour = require("../models/tour");
const CustomEnquiry = require("../models/customEnquiry");
const { sendEmail } = require("../services/mailer");

/**
 * Helper to call Gemini REST API securely on backend
 */
async function callGeminiAPI(messagesHistory, toursCatalog, currentState) {
  const apiKey = process.env.GEMINI_API_KEY;

  const catalogContext = toursCatalog.map((t) => ({
    id: t._id,
    name: t.name,
    location: t.location,
    price: t.price,
    duration: t.duration,
  }));

  const systemInstructionText = `You are OrbitRush AI Tour Assistant, an expert, enthusiastic travel planner for OrbitRush Tourism.
Your task is to conversationally collect travel details from the user and generate a personalized custom tour plan.

OrbitRush Catalog Tours available for reference:
${JSON.stringify(catalogContext, null, 2)}

Requirements to extract or confirm from user:
- Destination
- Approximate Start Date
- Duration (number of days)
- Number of Travelers
- Budget (in INR / ₹)
- Accommodation preference (e.g. Budget, 3-Star, 5-Star Luxury)
- Transportation preference (Flight, Train, Private Cab)
- Preferred activities & Special requests

Rules:
1. Be friendly, concise, and helpful.
2. Intelligently recognize details the user has already provided in previous messages (Current State: ${JSON.stringify(currentState)}).
3. Do NOT ask for information already known unless the user asks to change it. Only prompt for what is missing.
4. Suggest 1-3 matching OrbitRush catalog tours if available.
5. Create or update a day-by-day itinerary when enough details (destination & duration) are known.
6. Always return your response in JSON format matching this EXACT schema:
{
  "reply": "Friendly response text to the user",
  "extractedState": {
    "destination": "Extracted destination or null",
    "startDate": "Extracted start date or null",
    "duration": "Extracted duration e.g. '4 Days' or null",
    "numberOfTravelers": 2,
    "budget": "Extracted budget e.g. '₹40,000' or null",
    "preferences": "Extracted preferences or null",
    "activities": ["Activity 1", "Activity 2"],
    "accommodation": "Extracted accommodation or null",
    "transportation": "Extracted transportation or null",
    "specialRequests": "Extracted special requests or null"
  },
  "suggestedTours": [
    { "name": "Catalog Tour Name", "location": "Location", "price": 15000 }
  ],
  "itinerary": [
    { "day": 1, "title": "Day 1 Title", "description": "Activities planned" }
  ],
  "isReadyForEnquiry": true_or_false
}`;

  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY missing in .env. Using smart planner engine.");
    return generateFallbackResponse(messagesHistory, currentState, toursCatalog);
  }

  // Format contents array with proper role alternation and no consecutive same-role messages
  const rawContents = (messagesHistory || [])
    .map((msg) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text || "" }],
    }))
    .filter((c) => c.parts[0].text.trim() !== "");

  // Merge consecutive messages of the same role if any exist
  const contents = [];
  for (const item of rawContents) {
    if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
      contents[contents.length - 1].parts[0].text += "\n" + item.parts[0].text;
    } else {
      contents.push(item);
    }
  }

  // Ensure contents starts with 'user' role
  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({
      role: "user",
      parts: [{ text: "Hello! Help me plan a tour." }],
    });
  }

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstructionText }],
    },
    contents: contents,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  };

  // List of active Gemini model endpoints in order of preference
  const models = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
  ];

  for (const modelName of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(25000),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Gemini API (${modelName}) returned status ${response.status}:`, errText);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const cleanedText = rawText.replace(/```json\s*/gi, "").replace(/```\s*$/gi, "").trim();
        const parsedData = JSON.parse(cleanedText);
        console.log(`✅ Gemini API call succeeded with model ${modelName}!`);
        return parsedData;
      }
    } catch (err) {
      console.error(`Error with Gemini model ${modelName}:`, err.message);
    }
  }

  console.warn("⚠️ All Gemini API models failed/rejected. Falling back to smart planner engine.");
  return generateFallbackResponse(messagesHistory, currentState, toursCatalog);
}

/**
 * Smart Fallback Engine ensuring 100% reliable functionality
 */
function generateFallbackResponse(messagesHistory, currentState, toursCatalog) {
  const lastUserMsg = [...messagesHistory].reverse().find((m) => m.sender === "user")?.text || "";
  const lowerMsg = lastUserMsg.toLowerCase();

  const state = { ...currentState };

  // Match Destination
  if (!state.destination) {
    const matchedTour = toursCatalog.find(
      (t) => lowerMsg.includes(t.name.toLowerCase()) || lowerMsg.includes(t.location.toLowerCase())
    );
    if (matchedTour) {
      state.destination = matchedTour.location;
    } else if (lowerMsg.includes("goa")) state.destination = "Goa";
    else if (lowerMsg.includes("manali")) state.destination = "Manali";
    else if (lowerMsg.includes("kerala")) state.destination = "Kerala";
    else if (lowerMsg.includes("rajasthan")) state.destination = "Rajasthan";
    else if (lowerMsg.includes("ladakh")) state.destination = "Ladakh";
    else if (lastUserMsg.length > 2 && !lowerMsg.includes("hi") && !lowerMsg.includes("hello")) {
      state.destination = lastUserMsg;
    }
  }

  // Match Duration
  const daysMatch = lowerMsg.match(/(\d+)\s*(day|days|night|nights)/i);
  if (daysMatch) {
    state.duration = `${daysMatch[1]} Days`;
  } else if (!state.duration) {
    state.duration = "4 Days";
  }

  // Match Travelers
  const travelersMatch = lowerMsg.match(/(\d+)\s*(people|person|traveler|travelers|adult|adults)/i);
  if (travelersMatch) {
    state.numberOfTravelers = parseInt(travelersMatch[1], 10);
  } else if (!state.numberOfTravelers) {
    state.numberOfTravelers = 2;
  }

  // Match Budget
  const budgetMatch = lowerMsg.match(/(₹|rs\.?|inr)?\s*(\d+[,.\d]*)/i);
  if (budgetMatch && budgetMatch[2] && parseInt(budgetMatch[2].replace(/,/g, ""), 10) > 1000) {
    state.budget = `₹${parseInt(budgetMatch[2].replace(/,/g, ""), 10).toLocaleString()}`;
  }

  // Find Matching OrbitRush Tours
  const matchingTours = toursCatalog.filter((t) => {
    if (!state.destination) return true;
    return (
      t.location.toLowerCase().includes(state.destination.toLowerCase()) ||
      t.name.toLowerCase().includes(state.destination.toLowerCase())
    );
  }).slice(0, 3);

  // Generate Sample Itinerary
  const numDays = parseInt((state.duration || "4").match(/\d+/) || [4], 10);
  const destName = state.destination || "your destination";
  const itinerary = [];
  for (let i = 1; i <= Math.min(numDays, 7); i++) {
    if (i === 1) {
      itinerary.push({
        day: 1,
        title: `Arrival in ${destName} & Check-in`,
        description: `Welcome to ${destName}! Private transfer to hotel, relaxation, and evening local exploration.`,
      });
    } else if (i === numDays) {
      itinerary.push({
        day: i,
        title: `Souvenir Shopping & Departure`,
        description: `Enjoy breakfast, check out from hotel, visit local markets, and head to airport/station.`,
      });
    } else {
      itinerary.push({
        day: i,
        title: `Full Day Sightseeing & Local Experiences (Day ${i})`,
        description: `Guided tour of top attractions, adventure activities, local dining, and cultural shows in ${destName}.`,
      });
    }
  }

  let replyText = "";
  if (!state.destination) {
    replyText = "👋 Hello! Where would you like to travel for your next dream vacation?";
  } else if (!state.budget) {
    replyText = `Awesome! A trip to ${state.destination} for ${state.duration} sounds wonderful. What is your approximate budget for ${state.numberOfTravelers} traveler(s)?`;
  } else {
    replyText = `I've crafted a custom ${state.duration} itinerary for ${state.destination} with a budget of ${state.budget}! You can tweak any day, or click "Send Custom Enquiry" to get a official quote.`;
  }

  return {
    reply: replyText,
    extractedState: state,
    suggestedTours: matchingTours.map((t) => ({
      name: t.name,
      location: t.location,
      price: t.price,
    })),
    itinerary: itinerary,
    isReadyForEnquiry: !!(state.destination && state.budget),
  };
}

// 1. Interactive AI Assistant Chat Endpoint
router.post("/chat", async (req, res) => {
  try {
    const { messages = [], state = {} } = req.body;
    const activeTours = await Tour.find({})
      .select("name location price duration coverImage")
      .lean();

    const response = await callGeminiAPI(messages, activeTours, state);
    return res.json(response);
  } catch (err) {
    console.error("AI Assistant Chat Error:", err);
    return res.status(500).json({
      reply: "I'm having trouble processing that right now. Please try again!",
      extractedState: req.body.state || {},
      suggestedTours: [],
      itinerary: [],
    });
  }
});

// 2. Submit Custom Enquiry Endpoint
router.post("/submit-enquiry", async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      destination,
      startDate,
      duration,
      numberOfTravelers,
      budget,
      preferences,
      activities,
      accommodation,
      transportation,
      specialRequests,
      suggestedTours,
      itinerary,
      aiSummary,
    } = req.body;

    if (!customerName || !customerEmail || !customerPhone || !destination) {
      return res.status(400).json({ error: "Name, email, phone, and destination are required." });
    }

    const customEnquiry = await CustomEnquiry.create({
      userId: req.user ? req.user._id : null,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: customerPhone.trim(),
      destination: destination.trim(),
      startDate: startDate ? new Date(startDate) : null,
      duration: duration || "3 Days",
      numberOfTravelers: numberOfTravelers || 1,
      budget: budget || "Flexible",
      preferences: preferences || "",
      activities: activities || [],
      accommodation: accommodation || "Standard",
      transportation: transportation || "Included",
      specialRequests: specialRequests || "",
      suggestedTours: suggestedTours || [],
      itinerary: itinerary || [],
      aiSummary: aiSummary || `Custom trip to ${destination}`,
      status: "PENDING",
    });

    // Send Email Notification to Admin
    const adminEmail = process.env.GMAIL_USER || "orbitrushtourism@gmail.com";
    const itineraryHtml = (customEnquiry.itinerary || [])
      .map((item) => `<li><strong>Day ${item.day}: ${item.title}</strong> - ${item.description}</li>`)
      .join("");

    const emailSubject = `🚀 New Custom Tour Enquiry: ${customEnquiry.destination} (${customEnquiry.customerName})`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #007bff; margin-top: 0;">New AI Custom Tour Enquiry Received!</h2>
        <p>A customer has crafted a custom tour plan using the OrbitRush AI Tour Assistant.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; font-weight: bold; width: 40%;">Customer Name:</td><td style="padding: 8px;">${customEnquiry.customerName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${customEnquiry.customerEmail}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;">${customEnquiry.customerPhone}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Destination:</td><td style="padding: 8px;">${customEnquiry.destination}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Duration:</td><td style="padding: 8px;">${customEnquiry.duration}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Travelers:</td><td style="padding: 8px;">${customEnquiry.numberOfTravelers}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Budget:</td><td style="padding: 8px;">${customEnquiry.budget}</td></tr>
        </table>

        <h3 style="color: #333;">AI Generated Itinerary Preview:</h3>
        <ul>${itineraryHtml || "<li>Custom itinerary generated</li>"}</ul>

        <p><a href="http://localhost:${process.env.PORT || 8008}/tour/admin/dashboard/custom-enquiries" style="background: #007bff; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px; display: inline-block;">View in Admin Dashboard</a></p>
      </div>
    `;

    await sendEmail({
      to: adminEmail,
      subject: emailSubject,
      html: emailHtml,
      text: `New Custom Tour Enquiry for ${customEnquiry.destination} from ${customEnquiry.customerName} (${customEnquiry.customerEmail}, ${customEnquiry.customerPhone}).`,
    });

    return res.json({ success: true, enquiryId: customEnquiry._id });
  } catch (err) {
    console.error("Custom Enquiry Submission Error:", err);
    return res.status(500).json({ error: "Failed to submit custom enquiry. Please try again." });
  }
});

module.exports = router;
