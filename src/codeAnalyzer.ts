import * as fs from 'fs';
import { z } from 'zod';
import { OpenAI } from 'openai';

// Define the schema for code analysis results
const codeAnalysisSchema = z.object({
  analysis: z.object({
    code: z.string().describe('The extracted code from the image'),
    summary: z.string().describe('A brief summary of what the code does'),
    timeComplexity: z.string().describe('The time complexity analysis of the code'),
    spaceComplexity: z.string().describe('The space complexity analysis of the code'),
    language: z.string().describe('The programming language detected in the image')
  })
});

// Type definition for the analysis result
export type CodeAnalysisResult = z.infer<typeof codeAnalysisSchema>['analysis'];

// Check if OpenAI API key is configured
function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
}

/**
 * Analyzes code from screenshot images
 * Implements a simplified approach with hard timeouts to ensure completion
 */
export async function analyzeCodeFromImages(
  imagePaths: string[],
  prompt: string = 'Analyze the images and solve the coding problem in them',
  previousContext?: string
): Promise<CodeAnalysisResult> {
  // Default response in case of errors or timeouts
  const defaultResponse: CodeAnalysisResult = {
    code: 'Analysis in progress or timed out',
    summary: 'The analysis is taking longer than expected or encountered an error',
    timeComplexity: 'Unknown',
    spaceComplexity: 'Unknown',
    language: 'Unknown'
  };
  
  // Set a hard timeout for the entire analysis process
  const analysisTimeout = setTimeout(() => {
    console.log('Analysis hard timeout triggered');
    return defaultResponse;
  }, 15000); // 15 seconds max
  
  try {
    // Check if we have valid image paths
    if (!imagePaths || !imagePaths.length) {
      console.log('No valid image paths provided');
      clearTimeout(analysisTimeout);
      return {
        code: 'No images provided for analysis',
        summary: 'Please capture screenshots to analyze',
        timeComplexity: 'N/A',
        spaceComplexity: 'N/A',
        language: 'N/A'
      };
    }
    
    console.log('Images to analyze:', imagePaths);
    
    try {
      // Check if OpenAI API key is configured properly
      if (!isOpenAIConfigured()) {
        console.error('OpenAI API key is not configured');
        return {
          code: 'OpenAI API key not configured',
          summary: 'Please add your OPENAI_API_KEY to the .env file or environment variables',
          timeComplexity: 'N/A',
          spaceComplexity: 'N/A',
          language: 'N/A'
        };
      }
      
      // Read the image files and convert them to base64 format
      const imageContents = await Promise.all(
        imagePaths.map(async (path) => {
          try {
            // Read the image file as a buffer
            const imageBuffer = await fs.promises.readFile(path);
            // Convert the buffer to a base64 string
            const base64Image = imageBuffer.toString('base64');
            // Get the file extension to determine the MIME type
            const fileExtension = path.split('.').pop()?.toLowerCase();
            let mimeType = 'image/png'; // Default to png
            
            // Set appropriate MIME type based on extension
            if (fileExtension === 'jpg' || fileExtension === 'jpeg') {
              mimeType = 'image/jpeg';
            } else if (fileExtension === 'gif') {
              mimeType = 'image/gif';
            } else if (fileExtension === 'webp') {
              mimeType = 'image/webp';
            }
            
            return {
              type: 'image_url' as const,
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            };
          } catch (err) {
            console.error(`Failed to read image: ${path}`, err);
            return null;
          }
        })
      );
      
      // Filter out any null values from failed image loads
      const validImages = imageContents.filter((img): img is { type: 'image_url', image_url: { url: string } } => img !== null);
      
      if (validImages.length === 0) {
        console.error('None of the images could be read');
        clearTimeout(analysisTimeout);
        return {
          code: 'Failed to read image files',
          summary: 'Please make sure the image files are valid and accessible',
          timeComplexity: 'N/A',
          spaceComplexity: 'N/A',
          language: 'N/A'
        };
      }
      
      // Create the content array with the prompt text and images
      const content = [
        {
          type: 'text' as const,
          text: `Please analyze the code shown in these ${validImages.length} images. ${prompt}${previousContext ? `\nPrevious context: ${previousContext}` : ''} Extract the code and provide detailed analysis including the time complexity and space complexity.`
        },
        ...validImages
      ];
      
      // Create a direct OpenAI client for vision API
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      
      // Call the OpenAI API with the images
      const response = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: content
          }
        ],
        max_tokens: 1000,
        temperature: 0.2,
      });
      
      const responseText = response.choices[0]?.message.content || '';
      console.log('OpenAI raw response:', responseText);
      
      // Try to parse the response as JSON
      try {
        // Look for JSON in the response - it might be embedded in markdown code blocks
        let jsonStr = responseText;
        
        // Try to find JSON in code blocks
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        }
        
        // Try to detect if this is JSON already or needs to be structured
        let analysis: CodeAnalysisResult;
        
        if (jsonStr.trim().startsWith('{')) {
          // Try to parse as direct JSON
          try {
            const parsed = JSON.parse(jsonStr);
            analysis = {
              code: parsed.code || '',
              summary: parsed.summary || '',
              timeComplexity: parsed.timeComplexity || 'O(?)',
              spaceComplexity: parsed.spaceComplexity || 'O(?)',
              language: parsed.language || 'Unknown'
            };
          } catch (e) {
            // If JSON parsing fails, create a structured response from the text
            analysis = {
              code: extractCodeFromText(responseText),
              summary: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
              timeComplexity: extractComplexity(responseText, 'time') || 'Not provided',
              spaceComplexity: extractComplexity(responseText, 'space') || 'Not provided',
              language: extractLanguage(responseText) || 'Unknown'
            };
          }
        } else {
          // No JSON found, create a structured response
          analysis = {
            code: extractCodeFromText(responseText),
            summary: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
            timeComplexity: extractComplexity(responseText, 'time') || 'Not provided',
            spaceComplexity: extractComplexity(responseText, 'space') || 'Not provided',
            language: extractLanguage(responseText) || 'Unknown'
          };
        }
        
        clearTimeout(analysisTimeout);
        return analysis;
      } catch (error) {
        console.error('Error processing OpenAI response:', error);
        clearTimeout(analysisTimeout);
        
        // Try to extract useful information from the text response
        return {
          code: extractCodeFromText(responseText) || 'Code extraction failed',
          summary: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
          timeComplexity: extractComplexity(responseText, 'time') || 'Not identified',
          spaceComplexity: extractComplexity(responseText, 'space') || 'Not identified',
          language: extractLanguage(responseText) || 'Unknown'
        };
      }
    } catch (error) {
      console.error('AI analysis error:', error instanceof Error ? error.message : 'Unknown error');
      
      // Provide a more helpful fallback response
      clearTimeout(analysisTimeout);
      return {
        code: 'The analysis service is currently unavailable',
        summary: 'Please try again in a moment. The AI service might be experiencing high demand.',
        timeComplexity: 'Analysis unavailable',
        spaceComplexity: 'Analysis unavailable',
        language: 'Unknown'
      };
    }
  } catch (error) {
    console.error('Error in analysis workflow:', error instanceof Error ? error.message : 'Unknown error');
    clearTimeout(analysisTimeout);
    return defaultResponse;
  }
}

/**
 * Extends an existing code analysis with additional images
 * Uses the previous analysis as context for the new analysis
 */
export async function extendAnalysisWithImage(
  previousAnalysis: CodeAnalysisResult,
  newImagePaths: string[],
  prompt: string = 'Update the previous analysis with this additional image'
): Promise<CodeAnalysisResult> {
  if (!newImagePaths || newImagePaths.length === 0) {
    console.error('No image paths provided for extended analysis');
    return previousAnalysis; // Return previous analysis if no new images
  }
  
  // Verify all images exist before proceeding
  try {
    for (const path of newImagePaths) {
      await fs.promises.access(path, fs.constants.R_OK);
      const stats = await fs.promises.stat(path);
      console.log(`Verified image file: ${path}, size: ${stats.size} bytes`);
      if (stats.size === 0) {
        throw new Error(`Image file is empty: ${path}`);
      }
    }
  } catch (error) {
    console.error('Error verifying image files:', error);
    // Return previous analysis with a warning added to the summary
    return {
      ...previousAnalysis,
      summary: `${previousAnalysis.summary}\n\nWarning: Could not process additional image(s).`
    };
  }

  // Create context string from previous analysis
  const contextString = JSON.stringify({
    previousCode: previousAnalysis.code,
    previousSummary: previousAnalysis.summary,
    previousTimeComplexity: previousAnalysis.timeComplexity,
    previousSpaceComplexity: previousAnalysis.spaceComplexity,
    previousLanguage: previousAnalysis.language
  });

  // Build a context-aware prompt
  const contextPrompt = `${prompt}. Incorporate this new information with the previous analysis. 
  If the new image provides additional context or corrects previous assumptions, please update 
  the analysis accordingly while maintaining relevant information from the previous analysis.`;

  console.log(`Extending analysis with ${newImagePaths.length} new image(s), previous context length: ${contextString.length}`);
  
  try {
    // Call the main analysis function with the new image and context
    return await analyzeCodeFromImages(newImagePaths, contextPrompt, contextString);
  } catch (error) {
    console.error('Error in extended analysis:', error);
    // If analysis fails, return the previous analysis with error indication
    return {
      ...previousAnalysis,
      summary: `${previousAnalysis.summary}\n\nNote: Attempted to extend analysis with new image, but encountered an error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Helper function to extract code blocks from text
function extractCodeFromText(text: string): string {
  const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)\s*```/g;
  let extractedCode = '';
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    extractedCode += match[1] + '\n\n';
  }
  
  return extractedCode.trim() || text.substring(0, 500);
}

// Helper function to extract complexity information from text
function extractComplexity(text: string, type: 'time' | 'space'): string | null {
  const complexityRegex = new RegExp(`${type}\\s*complexity[\\s:]*([^\\n.]+)`, 'i');
  const match = text.match(complexityRegex);
  return match ? match[1].trim() : null;
}

// Helper function to extract programming language from text
function extractLanguage(text: string): string | null {
  // Common language patterns
  const languageRegex = /language[:\s]+(\w+)/i;
  const codeBlockRegex = /```(\w+)/;
  
  // Try to find explicit language mention
  const langMatch = text.match(languageRegex);
  if (langMatch && langMatch[1]) {
    return langMatch[1];
  }
  
  // Try to infer from code block
  const codeMatch = text.match(codeBlockRegex);
  if (codeMatch && codeMatch[1] && codeMatch[1].toLowerCase() !== 'json') {
    return codeMatch[1];
  }
  
  return null;
}
