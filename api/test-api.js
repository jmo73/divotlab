// Test script for DataGolf API integration
// Run with: node test-api.js

const DATAGOLF_API_KEY = 'dc8cd870e0460b9fb860cf59164e';
const DATAGOLF_BASE_URL = 'https://feeds.datagolf.com';

console.log('🏌️ Testing DataGolf API Connection...\n');

// Test 1: Skill Ratings
async function testSkillRatings() {
  console.log('Test 1: Fetching Skill Ratings...');
  try {
    const url = `${DATAGOLF_BASE_URL}/preds/skill-ratings?display=value&file_format=json&key=${DATAGOLF_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✓ Skill Ratings fetched successfully');
    console.log(`  - Total players: ${data.rankings?.length || 0}`);
    
    if (data.rankings && data.rankings.length > 0) {
      const topPlayer = data.rankings[0];
      console.log(`  - Top SG Player: ${topPlayer.player_name}`);
      console.log(`  - SG Total: ${topPlayer.sg_total}`);
      console.log(`  - SG Off-the-Tee: ${topPlayer.sg_ott}`);
      console.log(`  - SG Approach: ${topPlayer.sg_app}`);
      console.log(`  - SG Around Green: ${topPlayer.sg_arg}`);
      console.log(`  - SG Putting: ${topPlayer.sg_putt}`);
    }
    
    return data;
  } catch (error) {
    console.error('✗ Skill Ratings failed:', error.message);
    return null;
  }
}

// Test 2: Field Updates
async function testFieldUpdates() {
  console.log('\nTest 2: Fetching Field Updates...');
  try {
    const url = `${DATAGOLF_BASE_URL}/field-updates?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✓ Field Updates fetched successfully');
    console.log(`  - Event: ${data.event_name || 'N/A'}`);
    console.log(`  - Course: ${data.course || 'N/A'}`);
    console.log(`  - Field Size: ${data.field?.length || 0} players`);
    
    if (data.field && data.field.length > 0) {
      console.log(`  - Sample player: ${data.field[0].player_name}`);
    }
    
    return data;
  } catch (error) {
    console.error('✗ Field Updates failed:', error.message);
    return null;
  }
}

// Test 3: Pre-Tournament Predictions
async function testPreTournament() {
  console.log('\nTest 3: Fetching Pre-Tournament Predictions...');
  try {
    const url = `${DATAGOLF_BASE_URL}/preds/pre-tournament?tour=pga&file_format=json&key=${DATAGOLF_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✓ Pre-Tournament Predictions fetched successfully');
    console.log(`  - Event: ${data.event_name || 'N/A'}`);
    
    if (data.predictions && data.predictions.length > 0) {
      const favorite = data.predictions[0];
      console.log(`  - Favorite: ${favorite.player_name}`);
      console.log(`  - Win Probability: ${(favorite.win_prob * 100).toFixed(2)}%`);
      console.log(`  - Top 5 Probability: ${(favorite.top_5_prob * 100).toFixed(2)}%`);
      console.log(`  - Make Cut Probability: ${(favorite.make_cut_prob * 100).toFixed(2)}%`);
    }
    
    return data;
  } catch (error) {
    console.error('✗ Pre-Tournament Predictions failed:', error.message);
    return null;
  }
}

// Test 4: Rankings
async function testRankings() {
  console.log('\nTest 4: Fetching DataGolf Rankings...');
  try {
    const url = `${DATAGOLF_BASE_URL}/preds/get-dg-rankings?file_format=json&key=${DATAGOLF_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✓ Rankings fetched successfully');
    console.log(`  - Total ranked players: ${data.rankings?.length || 0}`);
    
    if (data.rankings && data.rankings.length > 0) {
      console.log('\n  Top 5 Players:');
      data.rankings.slice(0, 5).forEach((player, i) => {
        console.log(`    ${i + 1}. ${player.player_name} - Skill: ${player.primary_skill.toFixed(2)}`);
      });
    }
    
    return data;
  } catch (error) {
    console.error('✗ Rankings failed:', error.message);
    return null;
  }
}

// Run all tests
async function runTests() {
  const skillRatings = await testSkillRatings();
  const fieldUpdates = await testFieldUpdates();
  const preTournament = await testPreTournament();
  const rankings = await testRankings();
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  const results = [
    { name: 'Skill Ratings', success: !!skillRatings },
    { name: 'Field Updates', success: !!fieldUpdates },
    { name: 'Pre-Tournament', success: !!preTournament },
    { name: 'Rankings', success: !!rankings }
  ];
  
  results.forEach(test => {
    const icon = test.success ? '✓' : '✗';
    const status = test.success ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${test.name}: ${status}`);
  });
  
  const allPassed = results.every(t => t.success);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! API connection is working.');
    console.log('\nNext steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Test the server: curl http://localhost:3001/health');
    console.log('3. Get homepage stats: curl http://localhost:3001/api/homepage-stats');
  } else {
    console.log('\n⚠️  Some tests failed. Check your API key and network connection.');
  }
}

runTests();