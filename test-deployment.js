#!/usr/bin/env node

/**
 * Test script to verify API deployment
 * Usage: node test-deployment.js [base-url]
 * Example: node test-deployment.js https://your-project.vercel.app
 */

const baseUrl = process.argv[2] || 'http://localhost:3000';

async function testEndpoint(endpoint, description) {
  try {
    console.log(`\n🧪 Testing: ${description}`);
    console.log(`   URL: ${baseUrl}${endpoint}`);
    
    const response = await fetch(`${baseUrl}${endpoint}`);
    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));
    
    return response.ok;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log(`🚀 Testing API deployment at: ${baseUrl}`);
  
  const tests = [
    { endpoint: '/health', description: 'Health Check' },
    { endpoint: '/foods?type=apple&limit=2', description: 'Food Search' },
    { endpoint: '/nonexistent', description: '404 Handler' }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const success = await testEndpoint(test.endpoint, test.description);
    if (success) passed++;
  }
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('✅ All tests passed! Your API is working correctly.');
  } else {
    console.log('❌ Some tests failed. Please check your deployment.');
    process.exit(1);
  }
}

runTests().catch(console.error);
