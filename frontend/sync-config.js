#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read config.yaml from parent directory
const configPath = path.join(__dirname, '..', 'config.yaml');
const envPath = path.join(__dirname, '.env');

try {
  // Read and parse YAML config
  const configFile = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configFile);
  
  // Extract relevant values
  const apiEndpoint = config.rag_api_endpoint.replace(/\/$/, '') + '/'; // Ensure trailing slash
  const apiKey = config.api_key;
  
  // Read current .env file to preserve other variables
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  // Update or add the Vite environment variables
  const envLines = envContent.split('\n').filter(line => 
    !line.startsWith('VITE_API_ENDPOINT=') && 
    !line.startsWith('VITE_API_KEY=') &&
    line.trim() !== ''
  );
  
  // Add the updated values
  envLines.push(`VITE_API_ENDPOINT=${apiEndpoint}`);
  envLines.push(`VITE_API_KEY=${apiKey}`);
  
  // Add environment marker if not present
  if (!envLines.some(line => line.startsWith('VITE_ENVIRONMENT='))) {
    envLines.push('VITE_ENVIRONMENT=development');
  }
  
  // Write back to .env
  fs.writeFileSync(envPath, envLines.join('\n') + '\n');
  
  console.log('✓ .env file updated successfully from config.yaml');
  console.log(`  API Endpoint: ${apiEndpoint}`);
  console.log(`  API Key: ${apiKey.substring(0, 8)}...`);
  
} catch (error) {
  console.error('Error syncing config:', error.message);
  process.exit(1);
}