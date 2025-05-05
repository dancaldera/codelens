import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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

/**
 * Extract text from an image using OCR
 * @param imagePath Path to the image
 * @returns Extracted text or empty string if OCR fails
 */
async function extractTextFromImage(imagePath: string): Promise<string> {
  try {
    // First try using tesseract if available (better for code)
    try {
      const outputBase = path.join(
        path.dirname(imagePath),
        `${path.basename(imagePath, path.extname(imagePath))}-ocr`
      );
      const outputFile = `${outputBase}.txt`;
      
      // Run OCR on the image with settings optimized for code
      await execAsync(`tesseract "${imagePath}" "${outputBase}" -l eng --psm 6`);
      
      // Read the extracted text
      const text = await fs.promises.readFile(outputFile, 'utf8');
      console.log(`Extracted ${text.length} characters of text from image using Tesseract`);
      
      if (text.length > 0) {
        return text;
      }
    } catch (err) {
      console.log('Tesseract OCR failed or not installed, trying alternative method');
    }
    
    // Fallback to macOS built-in text recognition if tesseract fails
    try {
      // Create a temporary script to extract text using macOS's built-in text recognition
      const scriptPath = path.join(path.dirname(imagePath), 'extract_text.scpt');
      const outputPath = path.join(path.dirname(imagePath), 'extracted_text.txt');
      
      // AppleScript to extract text from image
      const applescript = `
        set theImage to POSIX file "${imagePath}"
        set theOutputFile to POSIX file "${outputPath}"
        
        tell application "System Events"
          set theText to do shell script "mdls -raw -name kMDItemTextContent " & quoted form of (POSIX path of theImage)
        end tell
        
        do shell script "echo " & quoted form of theText & " > " & quoted form of (POSIX path of theOutputFile)
      `;
      
      // Write the script to a file
      await fs.promises.writeFile(scriptPath, applescript);
      
      // Execute the AppleScript
      await execAsync(`osascript "${scriptPath}"`);
      
      // Read the extracted text
      const text = await fs.promises.readFile(outputPath, 'utf8');
      console.log(`Extracted ${text.length} characters of text from image using macOS text recognition`);
      
      // Clean up temporary files
      try {
        await fs.promises.unlink(scriptPath);
        await fs.promises.unlink(outputPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return text;
    } catch (err) {
      console.log('macOS text recognition failed, using manual analysis');
    }
    
    // If all OCR methods fail, return empty string
    return '';
  } catch (error) {
    console.error('Error extracting text from image:', error);
    return '';
  }
}

/**
 * Create a text-only analysis of the code in the images
 * This approach avoids sending the images entirely to reduce token usage
 */
async function analyzeImagesLocally(imagePaths: string[]): Promise<string> {
  try {
    // Extract text from all images
    const extractedTexts = await Promise.all(
      imagePaths.map(path => extractTextFromImage(path))
    );
    
    // Combine all extracted text
    return extractedTexts.map((text, i) => 
      `=== CODE FROM IMAGE ${i+1} ===\n${text}\n`
    ).join('\n\n');
  } catch (error) {
    console.error('Error in local image analysis:', error);
    return 'Error extracting code from images.';
  }
}

/**
 * Analyzes code from screenshot images
 * @param imagePaths Array of paths to screenshot images
 * @param prompt Additional context or instructions for the analysis
 * @returns Promise with the analysis result
 */
export async function analyzeCodeFromImages(
  imagePaths: string[],
  prompt: string = 'Analyze the images and solve the coding problem in them'
): Promise<CodeAnalysisResult> {
  try {
    // Validate that we have image paths
    if (!imagePaths.length) {
      throw new Error('No image paths provided for analysis');
    }

    console.log('Analyzing images locally to extract code...');
    const extractedCode = await analyzeImagesLocally(imagePaths);
    
    if (!extractedCode || extractedCode.trim().length === 0) {
      console.log('No code extracted from images, falling back to default analysis');
      return {
        code: 'Unable to extract code from images',
        summary: 'Code extraction failed',
        timeComplexity: 'Unknown',
        spaceComplexity: 'Unknown',
        language: 'Unknown'
      };
    }
    
    console.log(`Extracted ${extractedCode.length} characters of code from images`);
    
    // Create a text-only prompt with the extracted code
    const fullPrompt = `${prompt}\n\nHere is the code extracted from the images:\n\n${extractedCode}`;
    
    console.log(`Prompt length: ${fullPrompt.length} characters`);

    // Generate the analysis using the AI SDK
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: codeAnalysisSchema,
      prompt: fullPrompt,
    });

    return object.analysis;
  } catch (error) {
    console.error('Error analyzing code from images:', error);
    throw error;
  }
}
