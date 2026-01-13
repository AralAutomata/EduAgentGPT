// Import ChatOpenAI class from LangChain's OpenAI package
// This is a wrapper around OpenAI's API that makes it easier to use
import { ChatOpenAI } from "@langchain/openai";

// Import ChatPromptTemplate which helps us build prompts with placeholders
// Think of it like a Mad Libs template: "Hello {name}, you are {age} years old"
import { ChatPromptTemplate } from "@langchain/core/prompts";

// Import type definitions (not actual code, just types for TypeScript)
import type { AppConfig, StudentAnalysis, TeacherSummary, TeacherPreferences } from "./types.ts";
import type { Logger } from "./logger.ts";

/**
 * Create a configured ChatOpenAI model instance
 * This is a helper function to keep model creation consistent
 */
function createModel(config: AppConfig) {
  // Build configuration object for OpenAI
  const modelConfig = {
    // API key for authentication (from environment variables)
    openAIApiKey: config.openAiApiKey,
    
    // Which model to use: "gpt-4", "gpt-3.5-turbo", etc.
    modelName: config.openAiModel,
    
    // Temperature controls randomness/creativity (0-1 scale)
    // 0 = very deterministic (same input → same output)
    // 1 = very creative (same input → different outputs)
    // 0.8 is fairly creative, good for generating varied educational advice
    temperature: 0.8,
    
    // If a custom base URL is provided (for proxies or custom endpoints)
    // use it, otherwise undefined (which means use OpenAI's default)
    // The "?" is a ternary operator: condition ? ifTrue : ifFalse
    configuration: config.openAiBaseUrl
      ? { baseURL: config.openAiBaseUrl }  // Custom endpoint
      : undefined,                          // Use default
  };

  // Create and return the model instance
  return new ChatOpenAI(modelConfig);
}

/**
 * Build an LLM agent that turns structured analysis into personalized insights.
 * This is the main factory function that creates our AI agent.
 * 
 * Think of this as creating a specialized assistant that knows how to:
 * 1. Talk to OpenAI's API
 * 2. Format questions properly
 * 3. Parse responses
 */
export function createAgent(
  config: AppConfig,              // Application configuration
  logger: Logger,                 // For logging operations
  preferences?: TeacherPreferences // Optional teacher customization
) {
  // STEP 1: Create the AI model instance
  const model = createModel(config);
  
  // STEP 2: Convert teacher preferences to JSON string for inclusion in prompts
  // If preferences exist, stringify them nicely (with 2-space indentation)
  // If not, use the string "None"
  // This will be injected into prompts so the AI knows the teacher's preferences
  const teacherRulesJson = preferences ? JSON.stringify(preferences, null, 2) : "None";

  // STEP 3: Define the prompt template for STUDENT insights
  // ChatPromptTemplate.fromMessages creates a conversation structure
  const studentPrompt = ChatPromptTemplate.fromMessages([
    // First message: system message (sets the AI's role and behavior)
    [
      "system",  // Message type
      // The actual prompt text:
      "You are an educational coach writing for a student. " +
      "Use a warm, encouraging, growth-mindset tone grounded in the analysis and teacher notes. " +
      "Return ONLY valid JSON with these fields: " +
      "positiveObservation (string), " +
      "strengths (array of 1-3 strings), " +
      "improvementAreas (array of 1-2 strings), " +
      "strategies (array of 2-3 strings), " +
      "nextStepGoal (string), " +
      "encouragement (string). " +
      "Avoid raw scores, sensitive labels, or mention of JSON.",
    ],
    
    // Second message: human message (the actual question/input)
    [
      "human",  // Message type
      // Template with placeholders in curly braces
      // These will be filled in when we invoke the chain
      "Student analysis JSON:\n{analysisJson}\n\n" +
      "Teacher preferences JSON:\n{teacherRulesJson}\n\n" +
      "Return ONLY the JSON object.",
    ],
  ]);

  // STEP 4: Define the prompt template for TEACHER summary
  // Similar structure but different instructions
  const teacherPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are an educational coach preparing a class summary for the teacher. " +
      "Use a supportive, solution-oriented tone. " +
      "Return ONLY valid JSON with fields: " +
      "classOverview (string), " +
      "strengths (array of 1-4 strings), " +
      "attentionNeeded (array of objects with name and reason), " +
      "nextSteps (array of 2-4 strings). " +
      "Avoid raw scores or shaming language.",
    ],
    [
      "human",
      "Teacher summary JSON:\n{summaryJson}\n\n" +
      "Teacher preferences JSON:\n{teacherRulesJson}\n\n" +
      "Return ONLY the JSON object.",
    ],
  ]);

  // STEP 5: Return an object with two async functions
  // This is the "agent" - it has methods to generate different types of insights
  return {
    /**
     * Generate personalized insights for a single student
     * Takes: StudentAnalysis (the structured data from analyzer.ts)
     * Returns: Promise<string> (the AI's response as a JSON string)
     */
    async generateStudentInsights(analysis: StudentAnalysis): Promise<string> {
      // Convert the analysis object to a pretty JSON string
      // null, 2 means "no replacer function, 2-space indentation"
      const analysisJson = JSON.stringify(analysis, null, 2);
      
      // Log that we're starting this operation (for debugging)
      logger.debug("Generating student insights", { studentId: analysis.student.id });
      
      // Create a "chain" by piping the prompt template into the model
      // Think of this as: prompt → model → response
      // The pipe operator connects them like plumbing pipes
      const chain = studentPrompt.pipe(model);
      
      // Invoke the chain with the actual data
      // This fills in the {analysisJson} and {teacherRulesJson} placeholders
      // and sends the complete prompt to OpenAI
      const response = await chain.invoke({ analysisJson, teacherRulesJson });
      
      // response.content is the AI's reply (could be string or array of content blocks)
      // .toString() ensures we get a string
      return response.content.toString();
    },

    /**
     * Generate a summary for the teacher about the entire class
     * Takes: TeacherSummary (aggregated data about all students)
     * Returns: Promise<string> (the AI's response as a JSON string)
     */
    async generateTeacherSummary(summary: TeacherSummary): Promise<string> {
      // Convert summary to JSON string
      const summaryJson = JSON.stringify(summary, null, 2);
      
      // Log the operation
      logger.debug("Generating teacher summary");
      
      // Create the chain (prompt → model)
      const chain = teacherPrompt.pipe(model);
      
      // Invoke with the summary data
      const response = await chain.invoke({ summaryJson, teacherRulesJson });
      
      // Return the AI's response as a string
      return response.content.toString();
    },
  };
}

// HOW THIS WORKS IN PRACTICE:
// 
// 1. You call createAgent(config, logger, preferences)
//    This returns an object with two functions
//
// 2. You call agent.generateStudentInsights(analysis)
//    This:
//    a) Converts analysis to JSON
//    b) Fills that JSON into the prompt template
//    c) Sends the complete prompt to OpenAI
//    d) Returns OpenAI's response (hopefully valid JSON)
//
// 3. The response looks something like:
//    {
//      "positiveObservation": "You're showing great progress in Math!",
//      "strengths": ["Math skills", "Class participation"],
//      "improvementAreas": ["Science lab reports"],
//      "strategies": ["Review notes daily", "Ask questions in class"],
//      "nextStepGoal": "Complete 3 practice problems this week",
//      "encouragement": "Keep up the great work!"
//    }