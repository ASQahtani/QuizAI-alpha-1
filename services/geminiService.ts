
import { GoogleGenAI, Type } from "@google/genai";
import { MCQ, ExtractionResult } from "../types";

export async function extractMCQsFromText(text: string): Promise<ExtractionResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        You are a specialized "QuizAI" converter. Your goal is to process the following text extracted from a PDF and provide a structured MCQ quiz.
        
        CRITICAL INSTRUCTIONS:
        1. EXTRACT ALL: Scan the text for existing multiple-choice questions. You MUST extract EVERY SINGLE MCQ found in the text. If there are 40 questions, extract all 40. Do not truncate the list.
        2. GENERATE IF NEEDED: If the text contains raw educational content but FEW or NO pre-formatted MCQs, generate at least 15-20 high-quality MCQs based on the core concepts.
        3. FORMAT: Each question must have exactly 4 options (A, B, C, D).
        4. ACCURACY: Provide the correct answer exactly as found or determined.
        5. EDUCATIONAL VALUE: Provide a clear explanation for the correct answer.
        6. SOURCE MAPPING: Identify the page number using the "--- PAGE X ---" markers provided in the text.

        The final output MUST be a JSON object with a 'title' and an array of 'questions'. Ensure the JSON is complete and not cut off.

        TEXT:
        ${text}
      `,
      config: {
        responseMimeType: "application/json",
        // No thinking budget needed for pure extraction to save output tokens for the actual questions
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Descriptive title for the quiz." },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    minItems: 4,
                    maxItems: 4
                  },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  pageNumber: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER }
                },
                required: ["question", "options", "correctAnswer", "explanation", "pageNumber", "confidence"]
              }
            }
          },
          required: ["title", "questions"]
        }
      }
    });

    if (!response || !response.text) {
      throw new Error("Gemini returned an empty response.");
    }

    let cleanedText = response.text.trim();
    const data = JSON.parse(cleanedText);
    
    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error("Unexpected response format.");
    }

    const mcqs = data.questions.map((q: any, index: number) => ({
      ...q,
      id: `q-${index}-${Date.now()}`
    }));

    return {
      title: data.title || "QuizAI Generated Quiz",
      questions: mcqs
    };
  } catch (error) {
    console.error("Gemini Conversion Error:", error);
    throw new Error("Failed to convert PDF to MCQs. The document might be too large or the text might be unreadable.");
  }
}
