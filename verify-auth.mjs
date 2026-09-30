#!/usr/bin/env node
import { createHmac } from 'crypto';

const BASE_URL = process.env.BASE_URL || 'https://web-production-c8f29.up.railway.app';
const APP_SECRET = process.env.APP_SECRET || process.env.X_CLIENT_SECRET;

if (!APP_SECRET) {
  console.error('❌ APP_SECRET or X_CLIENT_SECRET not set');
  process.exit(1);
}

// Create a session token for a user ID
function makeUserSessionToken(userId) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  const payload = `u:${userId}.${exp}`;
  const sig = createHmac('sha256', APP_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function testNoSession() {
  console.log('\n🧪 Test 1: Profile edit without session should return 401');
  const res = await fetch(`${BASE_URL}/api/users/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thesis: 'Test thesis' }),
  });
  
  if (res.status === 401) {
    console.log('✅ Correctly returns 401 without session');
    return true;
  } else {
    console.log(`❌ Expected 401, got ${res.status}`);
    return false;
  }
}

async function testWithSession() {
  console.log('\n🧪 Test 2: Profile edit with user-id session (user 1) should work without signature');
  
  // Create a session token for user 1 (Jay)
  const sessionToken = makeUserSessionToken(1);
  
  // First, get current state
  const getRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: {
      'Cookie': `pp_session=${sessionToken}`,
    },
  });
  
  const sessionData = await getRes.json();
  console.log('Session data:', sessionData);
  
  if (!sessionData.userId) {
    console.log('❌ Session not recognized');
    return false;
  }
  
  // Try to update thesis
  const patchRes = await fetch(`${BASE_URL}/api/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `pp_session=${sessionToken}`,
    },
    body: JSON.stringify({ thesis: 'Test thesis from verification script' }),
  });
  
  if (patchRes.ok) {
    const data = await patchRes.json();
    console.log('✅ Profile updated successfully without wallet signature');
    console.log('Updated user:', data.user?.id, data.user?.xHandle);
    return true;
  } else {
    console.log(`❌ Profile update failed: ${patchRes.status}`);
    const error = await patchRes.text();
    console.log('Error:', error);
    return false;
  }
}

async function testBannerEndpoint() {
  console.log('\n🧪 Test 3: Banner upload without session should return 401');
  
  const sessionToken = makeUserSessionToken(1);
  
  // Try to upload banner without session
  const noSessionRes = await fetch(`${BASE_URL}/api/users/1/banner`, {
    method: 'POST',
    body: new FormData(),
  });
  
  console.log('Without session:', noSessionRes.status === 401 ? '✅ Returns 401' : `❌ Got ${noSessionRes.status}`);
  
  return noSessionRes.status === 401;
}

async function testFollowEndpoint() {
  console.log('\n🧪 Test 4: Follow without session should return 401');
  
  const res = await fetch(`${BASE_URL}/api/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: 2 }),
  });
  
  if (res.status === 401) {
    console.log('✅ Correctly returns 401 without session');
    return true;
  } else {
    console.log(`❌ Expected 401, got ${res.status}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Verifying authentication flow');
  console.log('Base URL:', BASE_URL);
  
  const results = await Promise.all([
    testNoSession(),
    testWithSession(),
    testBannerEndpoint(),
    testFollowEndpoint(),
  ]);
  
  const allPassed = results.every(r => r);
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('✅ All tests passed!');
    console.log('📝 Summary:');
    console.log('   - Profile edits require session (no wallet signature)');
    console.log('   - Banner uploads require session (no wallet signature)');
    console.log('   - Follow actions require session (no wallet signature)');
    console.log('   - User-id sessions work correctly');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
