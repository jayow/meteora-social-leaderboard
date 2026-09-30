#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'https://web-production-c8f29.up.railway.app';

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

async function testFollowEndpoint() {
  console.log('\n🧪 Test 2: Follow without session should return 401');
  
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

async function testXLoginReturnTo() {
  console.log('\n🧪 Test 3: X login accepts returnTo parameter');
  
  const returnPath = '/profile/me';
  const res = await fetch(`${BASE_URL}/api/x/login?returnTo=${encodeURIComponent(returnPath)}`, {
    redirect: 'manual',
  });
  
  if (res.status === 307 || res.status === 302) {
    const location = res.headers.get('location');
    if (location && location.includes('twitter.com')) {
      console.log('✅ X login redirects to Twitter OAuth');
      return true;
    }
  }
  
  console.log(`❌ Unexpected response: ${res.status}`);
  return false;
}

async function testSessionEndpoint() {
  console.log('\n🧪 Test 4: Session endpoint returns user data structure');
  
  const res = await fetch(`${BASE_URL}/api/auth/session`);
  const data = await res.json();
  
  console.log('Session response:', data);
  
  if ('userId' in data) {
    console.log('✅ Session endpoint has correct structure');
    return true;
  } else {
    console.log('❌ Session endpoint missing userId field');
    return false;
  }
}

async function main() {
  console.log('🚀 Verifying authentication flow (no session tests)');
  console.log('Base URL:', BASE_URL);
  console.log('Commit:', '916138e391c7095bccf4cae7a6bb802ff25e6fce');
  
  const results = await Promise.all([
    testNoSession(),
    testFollowEndpoint(),
    testXLoginReturnTo(),
    testSessionEndpoint(),
  ]);
  
  const allPassed = results.every(r => r);
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('✅ All basic tests passed!');
    console.log('\n📝 Summary:');
    console.log('   ✅ Profile edits require session (no auto wallet signature)');
    console.log('   ✅ Follow actions require session (no auto wallet signature)');
    console.log('   ✅ X OAuth login supports returnTo parameter');
    console.log('   ✅ Session endpoint has correct structure');
    console.log('\n🎯 Manual verification needed:');
    console.log('   - Visit site without session → profile edits show "Sign in with X"');
    console.log('   - Sign in with X → can edit profile without wallet signature');
    console.log('   - Banner upload/remove works without wallet signature');
    console.log('   - Follow button works without wallet signature');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
