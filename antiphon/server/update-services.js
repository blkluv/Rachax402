/**
 * Updates ERC-8004 agent card metadata for both deployed Railway services.
 *
 * What this does:
 *   1. Fetches the current agent card CID from the on-chain registry
 *   2. Resolves + reads the old card from IPFS
 *   3. Patches ONLY the endpoint URL (preserves all other metadata)
 *   4. Re-uploads the updated card to Storacha → gets a new CID
 *   5. Calls updateAgentCard(newCID) on the ERC-8004 IdentityRegistry
 *
 * Usage:
 *   # Update both services (default)
 *   node update-services.js
 *
 *   # Update only the analyzer
 *   ANALYZER_URL=https://your-analyzer.up.railway.app node update-services.js --service=analyzer
 *
 *   # Update only storacha
 *   node update-services.js --service=storacha
 *
 * Environment variables (set in .env or pass inline):
 *   ANALYZER_URL          Railway URL for the DataAnalyzer service
 *   STORAGE_URL           Railway URL for the StorachaStorage service (known: rachax402-storacha-service.up.railway.app)
 *   BASE_RPC_URL          Optional RPC override
 *   DATA_ANALYZER_PRIVATE_KEY   AgentA EOA private key (used for DataAnalyzer card — same registrant)
 *   STORACHA_PROVIDER_PRIVATE_KEY  StorachaAgent registrant private key
 *
 * Confirmed deployed URLs (from Railway logs):
 *   StorachaStorage → https://rachax402-storacha-service.up.railway.app
 *   DataAnalyzer    → https://rachax402-analyzer-service.up.railway.app
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';
import { AgentIdentityABI } from './ABI/AgentIdentityABI.js';
import { initStorachaClient } from './initStoracha.js';

dotenv.config();

const IDENTITY_REGISTRY = '0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb';
const RPC_URL = 'https://sepolia.base.org';

const DATA_ANALYZER_ADDRESS = '0xEAB418143643557C74479d38E773A64E35B5f6c9';
const STORACHA_AGENT_ADDRESS = '0x9D48b65Bb45f144CBC5662Fd3Fd011659371D0f8';
//unchanged seems like we have to delete previous cards for both services and register them afresh with railway deployed urls
const ANALYZER_URL = 'https://rachax402-analyzer-service.up.railway.app'; // https://bafkreidvue5jvvuns5a3l3ygziw5z6arymfl3fjotv4o6wlqgsmxycpjze.ipfs.w3s.link/
const STORAGE_URL = 'https://rachax402-storacha-service.up.railway.app'; // https://w3s.link/ipfs/bafkreiak4xhmuq3f46dqsy3cijnymhvvvjxjpjktebclo6tn7fixi3a5xm

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
});

async function fetchCurrentCard(agentAddress) {
    const cid = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: AgentIdentityABI,
        functionName: 'getAgentCard',
        args: [agentAddress],
    });

    if (!cid) throw new Error(`No agent card CID found on-chain for ${agentAddress}`);
    console.log(`   📖 Current card CID: ${cid}`);
    console.log(`   🔗 View: https://w3s.link/ipfs/${cid}`);

    const res = await fetch(`https://w3s.link/ipfs/${cid}`);
    if (!res.ok) throw new Error(`IPFS fetch failed for CID ${cid}: ${res.statusText}`);

    return { oldCID: cid.toString(), card: await res.json() };
}

async function uploadUpdatedCard(storachaClient, card, filename) {
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
    const file = new File([blob], filename);
    const newCID = await storachaClient.uploadFile(file);
    const cidStr = newCID.toString();
    console.log(`   📤 New card uploaded: ${cidStr}`);
    console.log(`   🔗 View: https://w3s.link/ipfs/${cidStr}`);
    return cidStr;
}

async function submitUpdate(privateKey, newCID, agentAddress, label) {
    const account = privateKeyToAccount(privateKey);

    if (account.address.toLowerCase() !== agentAddress.toLowerCase()) {
        console.warn(`   ⚠️  Signer address ${account.address} does not match registered agent ${agentAddress}`);
        console.warn('      The transaction will likely revert — ensure you are using the correct private key.');
    }

    // Read existing capability tags so we preserve them in the update
    const existingTags = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: AgentIdentityABI,
        functionName: 'getAgentCapabilities',
        args: [agentAddress],
    });
    console.log(`   📎 Preserving ${existingTags.length} capability tags: [${existingTags.join(', ')}]`);

    const walletClient = createWalletClient({
        chain: baseSepolia,
        transport: http(RPC_URL),
        account,
    });

    console.log(`   📝 Submitting updateAgentCard for ${label}...`);

    const hash = await walletClient.writeContract({
        address: IDENTITY_REGISTRY,
        abi: AgentIdentityABI,
        functionName: 'updateAgentCard',
        args: [newCID, existingTags],
        account,
        chain: baseSepolia,
    });

    console.log(`   📝 Transaction submitted: ${hash}`);
    console.log('      Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   ✅ Confirmed! Block: ${receipt.blockNumber} | Gas: ${receipt.gasUsed}`);
    console.log(`   🔍 BaseScan: https://sepolia.basescan.org/tx/${receipt.transactionHash}`);

    return receipt.transactionHash;
}

// ── Update DataAnalyzer ───────────────────────────────────────────────────────

async function updateDataAnalyzer(storachaClient) {
    console.log('\n═'.repeat(60));
    console.log('🔄 Updating DataAnalyzer Agent Card');
    console.log('═'.repeat(60));
    console.log(`   New endpoint: ${ANALYZER_URL}/analyze`);

    const privateKey = process.env.DATA_ANALYZER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error(
            'DATA_ANALYZER_PRIVATE_KEY not set in .env\n' +
            '  This is the EOA private key used when registerDataAnalyzer() was called\n' +
            '  (the account that owns 0xEAB418... on the registry)'
        );
    }

    // 1. Fetch current card
    const { oldCID, card } = await fetchCurrentCard(DATA_ANALYZER_ADDRESS);

    // 2. Patch endpoint + pricing (server expects $0.01)
    const baseUrl = ANALYZER_URL.replace(/\/$/, '');
    const updatedCard = {
        ...card,
        endpoint: `${baseUrl}/analyze`,
        pricing: { ...(card.pricing || {}), baseRate: 0.01, currency: 'USDC', network: 'base-sepolia' },
        updatedAt: new Date().toISOString(),
        metadata: {
            ...(card.metadata || {}),
            railwayUrl: baseUrl,
            previousEndpoint: card.endpoint,
        },
    };

    console.log('\n   📋 Card diff:');
    console.log(`      endpoint: "${card.endpoint}" → "${updatedCard.endpoint}"`);
    if ((card.pricing?.baseRate ?? -1) !== 0.01) {
        console.log(`      pricing.baseRate: ${card.pricing?.baseRate ?? 'undefined'} → 0.01`);
    }

    // 3. Upload updated card
    const newCID = await uploadUpdatedCard(storachaClient, updatedCard, 'agentcard-data-analyzer.json');

    if (newCID === oldCID) {
        console.log('   ⏭️  CID unchanged (endpoint was already up to date). Skipping on-chain update.');
        return;
    }

    // 4. Submit on-chain update
    const txHash = await submitUpdate(privateKey, newCID, DATA_ANALYZER_ADDRESS, 'DataAnalyzer');

    console.log(`\n🎉 DataAnalyzer card updated!`);
    console.log(`   Old CID: ${oldCID}`);
    console.log(`   New CID: ${newCID}`);
    console.log(`   Tx:      ${txHash}\n`);
}

// ── Update StorachaAgent ──────────────────────────────────────────────────────

async function updateStorachaService(storachaClient) {
    console.log('\n═'.repeat(60));
    console.log('🔄 Updating StorachaAgent Card');
    console.log('═'.repeat(60));
    console.log(`   New endpoint: ${STORAGE_URL}/upload`);

    const privateKey = process.env.STORACHA_PROVIDER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error(
            'STORACHA_PROVIDER_PRIVATE_KEY not set in .env\n' +
            '  This is the key that registered 0x9D48b65B... on the ERC-8004 registry'
        );
    }

    // 1. Fetch current card (fallback to known card if IPFS is unreachable)
    let oldCID, card;
    try {
        ({ oldCID, card } = await fetchCurrentCard(STORACHA_AGENT_ADDRESS));
    } catch (err) {
        console.warn(`   ⚠️ Could not fetch old card from IPFS: ${err.message}`);
        console.log('   📎 Using known card template instead');
        oldCID = 'unknown';
        card = {
            name: "StorachaAgent",
            version: "1.0.0",
            description: "Decentralized IPFS file storage service",
            capabilities: ["Storacha", "file-storage", "ipfs", "decentralized-storage"],
            pricing: { upload: 0.1, retrieve: 0.005, currency: "USDC", network: "base-sepolia" },
            endpoint: "http://localhost:8000/upload",
            walletAddress: STORACHA_AGENT_ADDRESS,
        };
    }

    // 2. Patch endpoint + pricing (server: $0.1 upload, $0.005 retrieve)
    const baseUrl = STORAGE_URL.replace(/\/$/, '');
    const updatedCard = {
        ...card,
        endpoint: `${baseUrl}/upload`,
        pricing: { ...(card.pricing || {}), upload: 0.1, retrieve: 0.005, currency: 'USDC', network: 'base-sepolia' },
        updatedAt: new Date().toISOString(),
        metadata: {
            ...(card.metadata || {}),
            railwayUrl: baseUrl,
            uploadEndpoint: `${baseUrl}/upload`,
            retrieveEndpoint: `${baseUrl}/retrieve`,
            previousEndpoint: card.endpoint,
        },
    };

    console.log('\n   📋 Card diff:');
    console.log(`      endpoint: "${card.endpoint}" → "${updatedCard.endpoint}"`);
    if ((card.pricing?.upload ?? -1) !== 0.1 || (card.pricing?.retrieve ?? -1) !== 0.005) {
        console.log(`      pricing: upload ${card.pricing?.upload ?? 'undefined'}, retrieve ${card.pricing?.retrieve ?? 'undefined'} → upload 0.1, retrieve 0.005`);
    }

    // 3. Upload updated card
    const newCID = await uploadUpdatedCard(storachaClient, updatedCard, 'agentcard-storacha.json');

    if (newCID === oldCID) {
        console.log('   ⏭️  CID unchanged (endpoint was already up to date). Skipping on-chain update.');
        return;
    }

    // 4. Submit on-chain update
    const txHash = await submitUpdate(privateKey, newCID, STORACHA_AGENT_ADDRESS, 'StorachaAgent');

    console.log(`\n🎉 StorachaAgent card updated!`);
    console.log(`   Old CID: ${oldCID}`);
    console.log(`   New CID: ${newCID}`);
    console.log(`   Tx:      ${txHash}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const serviceArg = args.find(a => a.startsWith('--service='));
    const service = serviceArg ? serviceArg.split('=')[1] : 'both';

    console.log('═'.repeat(60));
    console.log('ERC-8004 Agent Card Updater — Railway URLs');
    console.log('═'.repeat(60));
    console.log(`\n  Analyzer URL: ${ANALYZER_URL}`);
    console.log(`  Storage URL:  ${STORAGE_URL}`);
    console.log(`  Updating:     ${service}\n`);

    // Single Storacha client shared by both updates
    const storachaClient = await initStorachaClient();

    try {
        if (service === 'analyzer' || service === 'both') {
            await updateDataAnalyzer(storachaClient);
        }

        if (service === 'storacha' || service === 'both') {
            await updateStorachaService(storachaClient);
        }

        console.log('\n' + '═'.repeat(60));
        console.log('✅ All agent cards updated successfully!');
        console.log('═'.repeat(60));
        console.log('\nVerification steps:');
        console.log(`  1. curl ${ANALYZER_URL}/health`);
        console.log(`  2. curl ${STORAGE_URL}/health`);
        console.log('  3. Restart AgentA — discoverService() will now resolve Railway URLs');
        console.log('  4. Verify registry:');
        console.log(`     https://sepolia.basescan.org/address/${IDENTITY_REGISTRY}\n`);
    } catch (err) {
        console.error('\n❌ Update failed:', err.message);
        if (err.message.includes('updateAgentCard')) {
            console.error('\n  The ERC-8004 contract may expose this function under a different name.');
            console.error('  Check the ABI for: updateAgentCard / setAgentCard / updateCard / updateMetadata');
            console.error('  Then edit the functionName field in submitUpdate() above.');
        }
        process.exit(1);
    }
}

main();