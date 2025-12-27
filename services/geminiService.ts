
import { GoogleGenAI, Type } from "@google/genai";
import { Keyframe } from "../types";

const MODEL_NAME = 'gemini-3-flash-preview';

export async function analyzeFrames(frames: Keyframe[]): Promise<Keyframe[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const analyzedFrames = await Promise.all(
    frames.map(async (frame, index) => {
      try {
        const base64Data = frame.dataUrl.split(',')[1];
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data,
                },
              },
              {
                text: "Analyze this jewelry product frame. Provide a short, professional label (e.g., 'Full Portrait', 'Clarity Close-up', 'Lifestyle Shot') and a one-sentence marketing description highlighting the product details. Keep it in English.",
              },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["label", "description"],
            },
          },
        });

        const result = JSON.parse(response.text || '{}');
        return {
          ...frame,
          label: result.label || `Frame ${index + 1}`,
          aiDescription: result.description || "Jewelry showcase",
        };
      } catch (error) {
        console.error("AI Analysis Error:", error);
        return { ...frame, label: `Frame ${index + 1}` };
      }
    })
  );

  return analyzedFrames;
}
