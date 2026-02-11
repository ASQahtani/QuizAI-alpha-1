
import { GoogleGenAI, Type } from "@google/genai";
import { MCQ, ExtractionResult } from "../types";

export async function extractMCQsFromText(text: string): Promise<ExtractionResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Identify and extract ALL multiple choice questions from the text below.
        Also, generate a concise and descriptive title for this quiz based on the content (e.g., "Biology 101 Midterm", "JavaScript Fundamentals").
        
        The text is extracted from a PDF.
        
        RULES:
        1. Extract the question text, all options, the correct answer, and the explanation exactly as they appear in the PDF.
        2. If an answer key is provided separately at the end of the text, use it to determine the correct answers.
        3. If an answer is NOT explicitly provided in the text, set correctAnswer to "Answer not found in PDF".
        4. If an explanation is NOT provided, set explanation to "Explanation not found in PDF".
        5. Include the source page number based on the "--- PAGE X ---" markers provided in the text.
        6. Provide a confidence score (0 to 1) for each extraction based on how clear the text was.
        7. Generate a 'title' field that is short and descriptive.
        8. NEVER hallucinate information. If data is missing, use the "not found" strings specified above.

        TEXT:
        ${text}
      `,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1000 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A concise title for the quiz." },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
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
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const data = JSON.parse(cleanedText);
    
    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error("Gemini response was not in the expected format.");
    }

    const mcqs = data.questions.map((q: any, index: number) => ({
      ...q,
      id: `q-${index}-${Date.now()}`
    }));

    return {
      title: data.title || "Untitled Quiz",
      questions: mcqs
    };
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse Gemini response as JSON. The model may have returned invalid data.");
    }
    throw error;
  }
}
