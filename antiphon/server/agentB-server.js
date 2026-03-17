/**
 * Agent B Server
 * 
 * This server acts as a PAYMENT GATEWAY + PROCESSOR
 * 
 * Flow:
 * 1. Receives HTTP POST from Agent A
 * 2. x402 middleware returns 402 Payment Required
 * 3. Agent A retries with payment header
 * 4. x402 middleware validates payment
 * 5. This handler processes the CSV analysis
 * 6. Returns resultCID to Agent A
 * 
 */

import express from 'express';
import cors from 'cors';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { facilitator as cdpFacilitator } from '@coinbase/x402';
import Papa from 'papaparse';
import { uploadFileToStoracha } from './initStoracha.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.PROVIDER_PORT || 8001;

app.use(cors({
  exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE']
}));
app.use(express.json());

// Configuration
const RECIPIENT_ADDRESS = process.env.PROVIDER_WALLET_ADDRESS;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.xpay.sh';
const NETWORK = process.env.X402_NETWORK || 'eip155:84532';

// CDP facilitator supports Base mainnet + Base Sepolia, and Permit2 (smart wallet compatible). xpay is EIP-3009 only.
const useCdp = !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);

console.log('🔧 Initializing Agent B Server...');
console.log(`   Recipient: ${RECIPIENT_ADDRESS}`);
console.log(`   Facilitator: ${useCdp ? 'CDP (production)' : FACILITATOR_URL}`);
console.log(`   Network: ${NETWORK}`);

const facilitatorClient = useCdp
  ? new HTTPFacilitatorClient(cdpFacilitator)
  : new HTTPFacilitatorClient({ url: FACILITATOR_URL });

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

const routes = {
  'POST /analyze': {
    accepts: [
      {
        scheme: 'exact',
        price: '$0.01',
        network: NETWORK,
        payTo: RECIPIENT_ADDRESS,
        extra: { assetTransferMethod: 'permit2', name: 'USDC', version: '2' },
      },
    ],
    description: 'Analyze CSV dataset with statistical computation. Accepts an IPFS CID pointing to CSV data, returns resultCID with analysis.',
    mimeType: 'application/json',
    extensions: {
      ...declareDiscoveryExtension({
        input: {
          contentType: 'application/json',
          bodyParams: {
            inputCID: {
              type: 'string',
              description: 'IPFS Content Identifier (CID) of the CSV dataset to analyze',
              required: true,
              example: 'bafkreig6xv5nwphfmvcnektpnojts33jqcuam7bmye2pb54adnrtccjlsu',
            },
            requirements: {
              type: 'string',
              description: 'Analysis requirements or focus area',
              required: false,
              example: 'statistical analysis',
            },
          },
        },
        output: {
          example: {
            status: 'success',
            message: 'Analysis complete',
            resultCID: 'bafkreidvue5jvvuns5a3l3ygziw5z6arymfl3fjotv4o6wlqgsmxycpjze',
            summary: 'Analyzed 100 rows across 5 columns. Found 3 numerical columns.',
            statistics: {
              rowCount: 100,
              columnCount: 5,
              columns: ['id', 'name', 'value', 'score', 'category'],
              numericalStats: {
                value: { mean: 50.5, median: 50, stdDev: 28.87, min: 1, max: 100 },
              },
            },
            insights: ['High variance detected in value (σ=28.87)'],
          },
          schema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['success'] },
              resultCID: { type: 'string', description: 'IPFS CID of the analysis results file' },
              summary: { type: 'string', description: 'Human-readable analysis summary' },
              statistics: {
                type: 'object',
                properties: {
                  rowCount: { type: 'number' },
                  columnCount: { type: 'number' },
                  columns: { type: 'array', items: { type: 'string' } },
                  numericalStats: { type: 'object' },
                },
              },
              insights: { type: 'array', items: { type: 'string' } },
            },
            required: ['status', 'resultCID', 'summary', 'statistics'],
          },
        },
      }),
    },
  },
};

// Health check — registered before payment middleware so it's always accessible.
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Agent B Provider (DataAnalyzer)',
    recipient: RECIPIENT_ADDRESS,
    network: NETWORK,
    facilitator: useCdp ? 'CDP (production)' : FACILITATOR_URL,
    bazaarEnabled: true,
    storachaReady: true,
    endpoints: {
      analyze: {
        method: 'POST',
        path: '/analyze',
        price: '$0.01',
        discoverable: true,
      },
    },
  });
});

// syncFacilitatorOnStart = false → defer facilitator validation to first request.
// The default (true) fires httpServer.initialize() eagerly, which fetches from
// x402.org/facilitator. If that fetch fails (transient DNS/network on Railway),
// the promise rejects unhandled and crashes the process before any request arrives.
// Passing false stores initPromise = null, so validation runs inside the middleware's
// own await on the first matching request — where errors are caught properly.
app.use(paymentMiddleware(routes, resourceServer, undefined, undefined, false));

console.log('✅ Payment middleware configured (Bazaar discovery enabled, lazy init)');

async function analyzeCSV(csvContent) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = results.data;
          const columns = results.meta.fields || [];

          // Calculate statistics for numerical columns
          const numericalStats= {};
          const insights = [];

          columns.forEach((column) => {
            const values = data
              .map(row => row[column])
              .filter(val => typeof val === 'number' && !isNaN(val));

            if (values.length > 0) {
              const sorted = values.sort((a, b) => a - b);
              const sum = values.reduce((a, b) => a + b, 0);
              const mean = sum / values.length;
              const median = sorted[Math.floor(sorted.length / 2)];
              
              // Calculate standard deviation
              const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
              const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
              const stdDev = Math.sqrt(variance);

              numericalStats[column] = {
                mean: Number(mean.toFixed(2)),
                median: Number(median.toFixed(2)),
                stdDev: Number(stdDev.toFixed(2)),
                min: sorted[0],
                max: sorted[sorted.length - 1],
              };

              // Generate insights
              if (stdDev > mean * 0.5) {
                insights.push(`High variance detected in ${column} (σ=${stdDev.toFixed(2)})`);
              }
              if (sorted[sorted.length - 1] > mean + 2 * stdDev) {
                insights.push(`Potential outliers detected in ${column}`);
              }
            }
          });

          const summary = `Analyzed ${data.length} rows across ${columns.length} columns. ` +
            `Found ${Object.keys(numericalStats).length} numerical columns.`;

          resolve({
            summary,
            statistics: {
              rowCount: data.length,
              columnCount: columns.length,
              columns,
              numericalStats,
            },
            insights,
          });
        } catch (error) {
          reject(new Error(`Analysis failed: ${error.message}`));
        }
      },
      error: (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      },
    });
  });
}

function formatAnalysisResults(result) {
  let output = `${result.summary}\n\n`;

  output += '📊 Statistical Summary:\n';
  Object.entries(result.statistics.numericalStats).forEach(([column, stats]) => {
    output += `\n${column}:\n`;
    output += `  Mean: ${stats.mean}\n`;
    output += `  Median: ${stats.median}\n`;
    output += `  Std Dev: ${stats.stdDev}\n`;
    output += `  Range: ${stats.min} - ${stats.max}\n`;
  });

  if (result.insights.length > 0) {
    output += `\n💡 Insights:\n`;
    result.insights.forEach((insight, i) => {
      output += `${i + 1}. ${insight}\n`;
    });
  }

  return output;
}

/**
 * Main processing function
 * Called after payment is verified
 */
async function processAnalysisTask(inputCID, requirements) {
  console.log(`\n📊 Starting analysis for CID: ${inputCID}`);
  console.log(`   Requirements: ${requirements}`);

  try {
    // Step 1: Download CSV data from Storacha
    console.log('   📥 Downloading data from Storacha...');
    const response = await fetch(`https://w3s.link/ipfs/${inputCID}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data from Storacha: ${response.statusText}`);
    }
    
    const csvContent = await response.text();
    console.log(`   ✅ Downloaded ${csvContent.length} bytes`);

    // Step 2: Analyze CSV
    console.log('   🔬 Analyzing data...');
    const analysisResult = await analyzeCSV(csvContent);
    const formattedResults = formatAnalysisResults(analysisResult);
    console.log(`   ✅ Analysis complete: ${analysisResult.statistics.rowCount} rows processed`);

    // Step 3: Upload results to Storacha
    console.log('   📤 Uploading results to Storacha...');
    const resultsBlob = new Blob([formattedResults], { type: 'text/plain' });
    const resultsFile = new File([resultsBlob], 'analysis-results.txt', { 
      type: 'text/plain' 
    });
    const uploadResult = await uploadFileToStoracha(resultsFile);
    const resultCID = uploadResult.cid;
    console.log(`   ✅ Results uploaded: ${resultCID}`);

    return {
      resultCID: resultCID.toString(),
      summary: analysisResult.summary,
      statistics: analysisResult.statistics,
      insights: analysisResult.insights,
    };
  } catch (error) {
    console.error('   ❌ Processing error:', error.message);
    throw error;
  }
}

/**
 * /analyze endpoint
 * 
 * IMPORTANT: This is only reached AFTER payment is verified by x402 middleware
 * The middleware has already:
 * 1. Checked for payment header
 * 2. Validated the signature
 * 3. Verified the payment amount matches
 * 
 * If you're in this function, payment was successful!
 */
app.post('/analyze', async (req, res) => {
  try {
    const { inputCID, requirements } = req.body;

    if (!inputCID) {
      return res.status(400).json({ 
        error: 'Missing inputCID',
        message: 'Please provide the CID of the data to analyze'
      });
    }

    console.log(`\n✅ Payment verified. Processing analysis...`);

    // Process the task
    const result = await processAnalysisTask(
      inputCID, 
      requirements || 'statistical analysis'
    );

    res.json({
      status: 'success',
      message: 'Analysis complete',
      resultCID: result.resultCID,
      summary: result.summary,
      statistics: result.statistics,
      insights: result.insights,
    });

    console.log(`✅ Analysis completed and returned to client\n`);
  } catch (error) {
    console.error('Analysis error:', error.message);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
    });
  }
});

async function warmAndInitialize(maxAttempts = 5) {
  const facilitatorUrl = useCdp ? null : FACILITATOR_URL;
  if (facilitatorUrl) {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const res = await fetch(`${facilitatorUrl}/health`, { signal: AbortSignal.timeout(8000) });
        console.log(`✅ Facilitator reachable (${res.status})`);
        break;
      } catch (err) {
        console.warn(`⏳ Facilitator ping ${i}/${maxAttempts}: ${err.message}`);
        if (i === maxAttempts) {
          console.warn('⚠️ Facilitator not reachable — will retry initialize on first request');
          break;
        }
        await new Promise(r => setTimeout(r, 3000 * i));
      }
    }
  }

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await resourceServer.initialize();
      console.log('✅ Resource server initialized (payment kinds loaded)');
      return;
    } catch (err) {
      console.warn(`⏳ initialize() attempt ${i}/${maxAttempts}: ${err.message}`);
      if (i < maxAttempts) await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
  console.warn('⚠️ initialize() failed after retries — first request may fail');
}

async function start() {
  try {
    await warmAndInitialize();

    app.listen(PORT, () => {
      console.log(`\n🤖 Agent B Provider running on http://localhost:${PORT}`);
      console.log(`💰 Recipient: ${RECIPIENT_ADDRESS}`);
      console.log(`🌐 Network: ${NETWORK}`);
      console.log(`📡 Facilitator: ${useCdp ? 'CDP (production)' : FACILITATOR_URL}`);
      console.log(`🔍 Bazaar Discovery: ENABLED`);
      console.log(`\n📋 Protected endpoints:`);
      console.log(`   POST /analyze - $0.01 per analysis`);
      console.log(`\n💡 Ready to process data analysis requests!\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

start();