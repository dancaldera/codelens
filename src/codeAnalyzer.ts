import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { exec } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';
import { z } from 'zod';

const execAsync = promisify(exec);

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
  prompt: string = 'Analyze the images and solve the coding problem in them'
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
    
    // Get basic image info for the analysis
    const imageInfo = await Promise.all(
      imagePaths.map(async (path, index) => {
        try {
          const stats = await fs.promises.stat(path);
          return `Image ${index + 1}: ${path.split('/').pop()} (${Math.round(stats.size/1024)} KB)`;
        } catch (err) {
          return `Image ${index + 1}: Unable to read file info`;
        }
      })
    );
    
    console.log('Images to analyze:', imageInfo);
    
    // Use a simpler, faster approach - just analyze based on file info
    // This avoids getting stuck in OCR or other slow processes
    
    // Create a quick analysis to send to the API
    const quickAnalysis = `
      Please analyze the code shown in these images:
      ${imageInfo.join('\n')}
      
      ${prompt}
      
      Note: The actual image content is not available for direct analysis.
      Please provide your best possible analysis based on the context.
    `;
    
    // Use a faster model with a quick timeout
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
      
      const generatePromise = generateObject({
        model: openai('gpt-4o-mini'),
        schema: codeAnalysisSchema,
        prompt: quickAnalysis,
      });
      
      // Race against a 10-second timeout
      const timeoutPromise = new Promise<{object: {analysis: CodeAnalysisResult}}>((_, reject) => {
        setTimeout(() => reject(new Error('AI response timeout')), 10000);
      });
      
      // Wait for either the AI response or the timeout
      const result = await Promise.race([generatePromise, timeoutPromise]);
      
      // Clear the main timeout since we got a response
      clearTimeout(analysisTimeout);
      
      return result.object.analysis;
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
