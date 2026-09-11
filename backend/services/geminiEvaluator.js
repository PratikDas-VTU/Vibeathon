process.env.GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/gcp-key.json";

const { VertexAI } = require("@google-cloud/vertexai");

const vertexAI = new VertexAI({
  project: "blood-link-471105",
  location: "us-central1"
});

const model = vertexAI.getGenerativeModel({
  model: "gemini-1.0-pro"
});

async function evaluatePrompt(promptText) {
  const systemPrompt = `
You are an AI judge for a hackathon.

Evaluate the quality of the following AI prompt.

Score from 0 to 10 based on:
- Clarity
- Specificity
- Technical depth
- Relevance
- Prompt engineering quality

Respond STRICTLY in JSON:
{
  "score": number,
  "feedback": "short constructive feedback"
}
`;

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\n" + promptText }]
        }
      ]
    });

    let text =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    text = text.replace(/```json|```/gi, "").trim();

    const parsed = JSON.parse(text);

    return {
      score: Math.max(0, Math.min(10, Number(parsed.score))),
      feedback: parsed.feedback || "No feedback provided"
    };
  } catch (err) {
    console.error("Vertex AI evaluation failed:", err.message);
    return {
      score: 5,
      feedback: "AI evaluation failed. Fallback score applied."
    };
  }
}

module.exports = { evaluatePrompt };
