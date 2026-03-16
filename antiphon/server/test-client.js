/**
 * Test Client for Storacha x402 Agent
 * Demonstrates the complete agent payment flow
 */

import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';
import FormData from 'form-data';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8000';
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ Error: EVM_PRIVATE_KEY not set in .env file');
  console.log('Get test USDC from: https://faucet.circle.com/ (Base Sepolia)');
  process.exit(1);
}

// Setup x402 payment client
const signer = privateKeyToAccount(PRIVATE_KEY);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const httpClient = new x402HTTPClient(client);
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

console.log('🤖 Storacha x402 Test Client');
console.log(`💰 Wallet: ${signer.address}`);
console.log(`🌐 Server: ${SERVER_URL}\n`);

/**
 * Test 1: Check server health (no payment required)
 */
async function testHealth() {
  console.log('📋 Test 1: Health Check (no payment)');

  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const data = await response.json();

    console.log('✅ Server is healthy');
    console.log(`   Bazaar: ${data.bazaarEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Network: ${data.network}`);
    console.log(`   Endpoints:`);
    Object.entries(data.endpoints).forEach(([name, info]) => {
      console.log(`     - ${info.method} ${info.path}: ${info.price}`);
    });
    console.log('');

    return data;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    throw error;
  }
}

/**
 * Test 2: Upload a file with x402 payment.
 * Uses two-step flow: get 402 first, then POST with payment + fresh body
 * (wrapFetchWithPayment's clone shares body stream so retry has no body).
 */
async function testUpload(filename = 'test.txt') {
  console.log('📤 Test 2: Upload File with Payment');
  console.log(`   File: ${filename}`);

  try {
    if (!fs.existsSync(filename)) {
      console.log('   Creating test file...');
      fs.writeFileSync(filename, `Test file created at ${new Date().toISOString()}\nThis file was uploaded via x402 payment.`);
    }

    const fileBuffer = fs.readFileSync(filename);
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename });
    const body1 = formData.getBuffer();
    const headers1 = formData.getHeaders();

    console.log('   Attempting upload...');

    const firstRes = await fetch(`${SERVER_URL}/upload`, {
      method: 'POST',
      body: body1,
      headers: headers1,
    });

    if (firstRes.status !== 402) {
      if (!firstRes.ok) {
        const errText = await firstRes.text();
        let errMsg = errText;
        try {
          errMsg = JSON.parse(errText).message || JSON.parse(errText).error || errText;
        } catch { }
        throw new Error(`Upload failed: ${errMsg}`);
      }
      const result = await firstRes.json();
      console.log('✅ Upload successful!');
      console.log(`   CID: ${result.data.cid}`);
      console.log(`   Size: ${result.data.size} bytes`);
      console.log(`   URL: ${result.data.url}`);
      console.log('');
      return result.data.cid;
    }

    const getHeader = (name) => firstRes.headers.get(name);
    let body;
    try {
      const text = await firstRes.text();
      if (text) body = JSON.parse(text);
    } catch { }
    const paymentRequired = httpClient.getPaymentRequiredResponse(getHeader, body);
    const paymentPayload = await client.createPaymentPayload(paymentRequired);
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    const formData2 = new FormData();
    formData2.append('file', fileBuffer, { filename });
    const body2 = formData2.getBuffer();
    const headers2 = { ...formData2.getHeaders(), ...paymentHeaders };

    const secondRes = await fetch(`${SERVER_URL}/upload`, {
      method: 'POST',
      body: body2,
      headers: headers2,
    });

    if (!secondRes.ok) {
      const errText = await secondRes.text();
      let errMsg = errText;
      try {
        errMsg = JSON.parse(errText).message || JSON.parse(errText).error || errText;
      } catch { }
      throw new Error(`Upload failed: ${errMsg}`);
    }

    const result = await secondRes.json();
    console.log('✅ Upload successful!');
    console.log(`   CID: ${result.data.cid}`);
    console.log(`   Size: ${result.data.size} bytes`);
    console.log(`   URL: ${result.data.url}`);
    console.log('');
    return result.data.cid;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    throw error;
  }
}

/**
 * Test 3: Retrieve a file with x402 payment
 */
async function testRetrieve(cid) {
  console.log('📥 Test 3: Retrieve File with Payment');
  console.log(`   CID: ${cid}`);

  try {
    console.log('   Attempting retrieval...');

    // Make paid request
    const response = await fetchWithPayment(`${SERVER_URL}/retrieve?cid=${cid}`);

    if (!response.ok) {
      const text = await response.text();
      let msg = text;
      try {
        const err = JSON.parse(text);
        msg = err.message || err.error || text;
      } catch (_) { }
      throw new Error(`Retrieval failed: ${msg}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const resolvedCid = response.headers.get('X-CID') || cid;
    const type = response.headers.get('Content-Type') || 'application/octet-stream';
    const size = buffer.length;

    console.log('✅ Retrieval successful!');
    console.log(`   CID: ${resolvedCid}`);
    console.log(`   Size: ${size} bytes`);
    console.log(`   Type: ${type}`);
    console.log('');

    return { cid: resolvedCid, size, type, data: buffer };
  } catch (error) {
    console.error('❌ Retrieval failed:', error.message);
    throw error;
  }
}

/**
 * Test 4: Test without payment (should fail with 402)
 */
async function testWithoutPayment() {
  console.log('🚫 Test 4: Request Without Payment (should fail)');

  try {
    const response = await fetch(`${SERVER_URL}/retrieve?cid=test`);

    if (response.status === 402) {
      console.log('✅ Server correctly returned 402 Payment Required');

      const paymentHeader = response.headers.get('PAYMENT-REQUIRED');
      if (paymentHeader) {
        const paymentInfo = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
        console.log(`   Price: $${paymentInfo.accepts[0].price}`);
        console.log(`   Network: ${paymentInfo.accepts[0].network}`);
      }
      console.log('');
    } else {
      console.error('❌ Expected 402, got:', response.status);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('Starting x402 Storacha Integration Tests');
  console.log('='.repeat(60) + '\n');

  try {
    // Test 1: Health check
    await testHealth();

    // Test 2: Upload with payment
    const cid = await testUpload();

    // Test 3: Retrieve with payment
    await testRetrieve(cid);

    // Test 4: Request without payment
    await testWithoutPayment();

    console.log('='.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Tests failed:', error.message);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testHealth, testUpload, testRetrieve, testWithoutPayment };


/**
-----old---
═
🔄 Updating DataAnalyzer Agent Card
════════════════════════════════════════════════════════════
   New endpoint: https://rachax402-analyzer-service.up.railway.app/analyze
   📖 Current card CID: bafkreidvue5jvvuns5a3l3ygziw5z6arymfl3fjotv4o6wlqgsmxycpjze
   🔗 View: https://w3s.link/ipfs/bafkreidvue5jvvuns5a3l3ygziw5z6arymfl3fjotv4o6wlqgsmxycpjze

   📋 Card diff:
      endpoint: "http://localhost:8001/analyze" → "https://rachax402-analyzer-service.up.railway.app/analyze"
   📤 New card uploaded: bafkreih2b4ryeii2c5ygt3qvey4b3d45ueplemquwaun52q4n4ljr7f74u
   🔗 View: https://w3s.link/ipfs/bafkreih2b4ryeii2c5ygt3qvey4b3d45ueplemquwaun52q4n4ljr7f74u
   📎 Preserving 3 capability tags: [csv-analysis, statistics, data-transformation]
   📝 Submitting updateAgentCard for DataAnalyzer...
   📝 Transaction submitted: 0xa545890e5f287ce996c70558ffba112e5a4202cfa91d086d0e9a21459f044031
      Waiting for confirmation...
   ✅ Confirmed! Block: 38908460 | Gas: 130314
   🔍 BaseScan: https://sepolia.basescan.org/tx/0xa545890e5f287ce996c70558ffba112e5a4202cfa91d086d0e9a21459f044031

🎉 DataAnalyzer card updated!
   Old CID: bafkreidvue5jvvuns5a3l3ygziw5z6arymfl3fjotv4o6wlqgsmxycpjze
   New CID: bafkreih2b4ryeii2c5ygt3qvey4b3d45ueplemquwaun52q4n4ljr7f74u
   Tx:      0xa545890e5f287ce996c70558ffba112e5a4202cfa91d086d0e9a21459f044031



═
🔄 Updating StorachaAgent Card
════════════════════════════════════════════════════════════
   New endpoint: https://rachax402-storacha-service.up.railway.app/upload
   📖 Current card CID: bafkreiak4xhmuq3f46dqsy3cijnymhvvvjxjpjktebclo6tn7fixi3a5xm
   🔗 View: https://w3s.link/ipfs/bafkreiak4xhmuq3f46dqsy3cijnymhvvvjxjpjktebclo6tn7fixi3a5xm
   ⚠️ Could not fetch old card from IPFS: IPFS fetch failed for CID bafkreiak4xhmuq3f46dqsy3cijnymhvvvjxjpjktebclo6tn7fixi3a5xm: Gateway Timeout
   📎 Using known card template instead

   📋 Card diff:
      endpoint: "http://localhost:8000/upload" → "https://rachax402-storacha-service.up.railway.app/upload"
   📤 New card uploaded: bafkreicrjhvscge4c3io63m3kdl6sf5dejyha5qtqsm4gy7vkguqzc3cte
   🔗 View: https://w3s.link/ipfs/bafkreicrjhvscge4c3io63m3kdl6sf5dejyha5qtqsm4gy7vkguqzc3cte
   📎 Preserving 4 capability tags: [Storacha, file-storage, ipfs, decentralized-storage]
   📝 Submitting updateAgentCard for StorachaAgent...
   📝 Transaction submitted: 0x6bc8589dadd09f462ca1eeea2f46abc6f3c891a742699a9cf397e09c376fe1c4
      Waiting for confirmation...
   ✅ Confirmed! Block: 38908545 | Gas: 160203
   🔍 BaseScan: https://sepolia.basescan.org/tx/0x6bc8589dadd09f462ca1eeea2f46abc6f3c891a742699a9cf397e09c376fe1c4

🎉 StorachaAgent card updated!
   Old CID: unknown
   New CID: bafkreicrjhvscge4c3io63m3kdl6sf5dejyha5qtqsm4gy7vkguqzc3cte
   Tx:      0x6bc8589dadd09f462ca1eeea2f46abc6f3c891a742699a9cf397e09c376fe1c4


════════════════════════════════════════════════════════════
✅ All agent cards updated successfully!
════════════════════════════════════════════════════════════

Verification steps:
  1. curl https://rachax402-analyzer-service.up.railway.app/health
  2. curl https://rachax402-storacha-service.up.railway.app/health
  3. Restart AgentA — discoverService() will now resolve Railway URLs
  4. Verify registry:
     https://sepolia.basescan.org/address/0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb





     --------latest new----


     ═
🔄 Updating DataAnalyzer Agent Card
════════════════════════════════════════════════════════════
   New endpoint: https://rachax402-analyzer-service.up.railway.app/analyze
   📖 Current card CID: bafkreih2b4ryeii2c5ygt3qvey4b3d45ueplemquwaun52q4n4ljr7f74u
   🔗 View: https://w3s.link/ipfs/bafkreih2b4ryeii2c5ygt3qvey4b3d45ueplemquwaun52q4n4ljr7f74u

   📋 Card diff:
      endpoint: "https://rachax402-analyzer-service.up.railway.app/analyze" → "https://rachax402-analyzer-service.up.railway.app/analyze"
      pricing.baseRate: 0.0001 → 0.01
   📤 New card uploaded: bafkreibsmzmoizg6f2de2fknkx4nthvn7tuhn3yf37wh77c4cczg3ej7oi
   🔗 View: https://w3s.link/ipfs/bafkreibsmzmoizg6f2de2fknkx4nthvn7tuhn3yf37wh77c4cczg3ej7oi
   📎 Preserving 3 capability tags: [csv-analysis, statistics, data-transformation]
   📝 Submitting updateAgentCard for DataAnalyzer...
   📝 Transaction submitted: 0x98e1b6e0c29bfd5ae96aa5863535da8899cb1a1da01b66321094ac40a5a2b862
      Waiting for confirmation...
   ✅ Confirmed! Block: 38961582 | Gas: 130314
   🔍 BaseScan: https://sepolia.basescan.org/tx/0x98e1b6e0c29bfd5ae96aa5863535da8899cb1a1da01b66321094ac40a5a2b862

🎉 DataAnalyzer card updated!
   Old CID: bafkreih2b4ryeii2c5ygt3qvey4b3d45ueplemquwaun52q4n4ljr7f74u
   New CID: bafkreibsmzmoizg6f2de2fknkx4nthvn7tuhn3yf37wh77c4cczg3ej7oi
   Tx:      0x98e1b6e0c29bfd5ae96aa5863535da8899cb1a1da01b66321094ac40a5a2b862


═
═
═
🔄 Updating StorachaAgent Card
════════════════════════════════════════════════════════════
   New endpoint: https://rachax402-storacha-service.up.railway.app/upload
   📖 Current card CID: bafkreicrjhvscge4c3io63m3kdl6sf5dejyha5qtqsm4gy7vkguqzc3cte
   🔗 View: https://w3s.link/ipfs/bafkreicrjhvscge4c3io63m3kdl6sf5dejyha5qtqsm4gy7vkguqzc3cte

   📋 Card diff:
      endpoint: "https://rachax402-storacha-service.up.railway.app/upload" → "https://rachax402-storacha-service.up.railway.app/upload"
   📤 New card uploaded: bafkreia6fnecdubrf7zc7sjzpff5lxrvvgcxt2b7whjs2wgc3wwxpl53gi
   🔗 View: https://w3s.link/ipfs/bafkreia6fnecdubrf7zc7sjzpff5lxrvvgcxt2b7whjs2wgc3wwxpl53gi
   📎 Preserving 4 capability tags: [Storacha, file-storage, ipfs, decentralized-storage]
   📝 Submitting updateAgentCard for StorachaAgent...
   📝 Transaction submitted: 0xb9c9a0c0489f7b591fab46558f571b279b520f8ad3139cfa121a0ebdd27db2a5
      Waiting for confirmation...
   ✅ Confirmed! Block: 38961589 | Gas: 160203
   🔍 BaseScan: https://sepolia.basescan.org/tx/0xb9c9a0c0489f7b591fab46558f571b279b520f8ad3139cfa121a0ebdd27db2a5

🎉 StorachaAgent card updated!
   Old CID: bafkreicrjhvscge4c3io63m3kdl6sf5dejyha5qtqsm4gy7vkguqzc3cte
   New CID: bafkreia6fnecdubrf7zc7sjzpff5lxrvvgcxt2b7whjs2wgc3wwxpl53gi
   Tx:      0xb9c9a0c0489f7b591fab46558f571b279b520f8ad3139cfa121a0ebdd27db2a5


════════════════════════════════════════════════════════════
✅ All agent cards updated successfully!
════════════════════════════════════════════════════════════

Verification steps:
  1. curl https://rachax402-analyzer-service.up.railway.app/health
  2. curl https://rachax402-storacha-service.up.railway.app/health
  3. Restart AgentA — discoverService() will now resolve Railway URLs
  4. Verify registry:
     https://sepolia.basescan.org/address/0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb

  */