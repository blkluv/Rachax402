/**
 * Storacha x402 Agent Server with Bazaar Discovery
 * Implements x402 protocol for Storacha Storage services with enhanced discovery
 * https://bafkreiak4xhmuq3f46dqsy3cijnymhvvvjxjpjktebclo6tn7fixi3a5xm.ipfs.w3s.link/
 * 
 * Test:
 * curl -X POST -F "file=@test.txt" http://localhost:8000/upload
 * curl http://localhost:8000/retrieve?cid=bafkreig6xv5nwphfmvcnektpnojts33jqcuam7bmye2pb54adnrtccjlsu
 */

import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { facilitator as cdpFacilitator } from '@coinbase/x402';
import { uploadFileToStoracha, retrieveFileFromStoracha } from './initStoracha.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({
  exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE']
}));
app.use(express.json());

// Configuration
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
const USE_CDP = !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
const NETWORK = process.env.X402_NETWORK || (USE_CDP ? 'eip155:8453' : 'eip155:84532');

// CDP facilitator for production, x402.org for testnet
const facilitatorClient = USE_CDP
  ? new HTTPFacilitatorClient(cdpFacilitator)
  : new HTTPFacilitatorClient({ url: FACILITATOR_URL });

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

console.log('✅ x402 resource server initialized');

// Define route configurations with Bazaar discovery extension
const routes = {
  'POST /upload': {
    accepts: [
      {
        scheme: 'exact',
        price: '$0.1',
        network: NETWORK,
        payTo: RECIPIENT_ADDRESS,
      },
    ],
    description: 'Upload files to decentralized IPFS storage via Storacha. Returns CID and IPFS gateway URL.',
    mimeType: 'application/json',
    extensions: {
      // Bazaar discovery extension
      ...declareDiscoveryExtension({
        input: {
          contentType: 'multipart/form-data',
          bodyParams: {
            file: {
              type: 'file',
              description: 'File to upload to IPFS storage',
              required: true,
            },
          },
        },
        output: {
          example: {
            status: 'success',
            data: {
              cid: 'bafybeig6xv5nwphfmvcnektpnojts33jqcuam7bmye2pb54adnrtccjlsu',
              filename: 'document.pdf',
              size: 524288,
              type: 'application/pdf',
              url: 'https://w3s.link/ipfs/bafybeig6xv5nwphfmvcnektpnojts33jqcuam7bmye2pb54adnrtccjlsu',
              uploadedAt: '2025-01-31T12:00:00.000Z',
            },
          },
          schema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['success'] },
              data: {
                type: 'object',
                properties: {
                  cid: { type: 'string', description: 'IPFS Content Identifier' },
                  filename: { type: 'string', description: 'Original filename' },
                  size: { type: 'number', description: 'File size in bytes' },
                  type: { type: 'string', description: 'MIME type' },
                  url: { type: 'string', description: 'IPFS gateway URL' },
                  uploadedAt: { type: 'string', format: 'date-time' },
                },
                required: ['cid', 'filename', 'size', 'url'],
              },
            },
            required: ['status', 'data'],
          },
        },
      }),
    },
  },

  'GET /retrieve': {
    accepts: [
      {
        scheme: 'exact',
        price: '$0.005',
        network: NETWORK,
        payTo: RECIPIENT_ADDRESS,
      },
    ],
    description: 'Retrieve files from IPFS storage using CID. Returns file data and metadata.',
    mimeType: 'application/json',
    extensions: {
      ...declareDiscoveryExtension({
        input: {
          queryParams: {
            cid: {
              type: 'string',
              description: 'IPFS Content Identifier (CID) of the file to retrieve',
              required: true,
              example: 'bafybeig6xv5nwphfmvcnektpnojts33jqcuam7bmye2pb54adnrtccjlsu',
            },
          },
        },
        output: {
          example: {
            status: 'success',
            data: {
              name: 'document.pdf',
              size: 524288,
              type: 'application/pdf',
              // File content would be included here
            },
          },
          schema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['success'] },
              data: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  size: { type: 'number' },
                  type: { type: 'string' },
                },
              },
            },
            required: ['status', 'data'],
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
    service: 'Storacha x402 Agent',
    recipient: RECIPIENT_ADDRESS,
    network: NETWORK,
    facilitator: USE_CDP ? 'CDP (production)' : FACILITATOR_URL,
    bazaarEnabled: true,
    endpoints: {
      upload: {
        method: 'POST',
        path: '/upload',
        price: '$0.1',
        discoverable: true,
      },
      retrieve: {
        method: 'GET',
        path: '/retrieve',
        price: '$0.005',
        discoverable: true,
      },
    },
  });
});

// syncFacilitatorOnStart = false → defer facilitator validation to first request.
// Prevents unhandled promise rejection crash when x402.org is transiently unreachable.
app.use(paymentMiddleware(routes, resourceServer, undefined, undefined, false));

console.log('✅ Payment middleware registered with Bazaar discovery (lazy init)');

// Upload endpoint - protected by x402 (multer errors caught by error handler below)
app.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: 'Invalid multipart body',
        message: err.message || 'Unexpected end of form or malformed multipart',
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Missing required parameter: file',
        message: 'Please upload a file using multipart/form-data',
      });
    }

    // Convert buffer to File-like object for Storacha
    const file = new File([req.file.buffer], req.file.originalname, {
      type: req.file.mimetype,
    });

    console.log(`📤 Uploading file: ${file.name} (${file.size} bytes)`);

    const storeData = await uploadFileToStoracha(file);

    res.json({
      status: 'success',
      data: storeData,
      link: `https://w3s.link/ipfs/${storeData.cid}`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file to Storacha',
      message: error.message,
    });
  }
});

// Retrieve endpoint - protected by x402
app.get('/retrieve', async (req, res) => {
  try {
    const { cid } = req.query;

    if (!cid) {
      return res.status(400).json({
        error: 'Missing required parameter: cid',
        message: 'Please provide a CID in the query string: ?cid=bafybei...',
      });
    }

    console.log(`📥 Retrieving file with CID: ${cid}`);

    const file = await retrieveFileFromStoracha(cid);

    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Length', file.size);
    res.setHeader('X-CID', file.cid);
    res.send(file.data);
  } catch (error) {
    console.error('Retrieve error:', error);
    res.status(500).json({
      error: 'Failed to retrieve file',
      message: error.message,
    });
  }
});

async function warmFacilitator(url, maxAttempts = 5) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      console.log(`✅ Facilitator reachable (${res.status})`);
      return true;
    } catch (err) {
      console.warn(`⏳ Facilitator check ${i}/${maxAttempts} failed: ${err.message}`);
      if (i < maxAttempts) await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
  console.warn('⚠️ Facilitator not reachable after retries — first request will attempt init');
  return false;
}

async function start() {
  try {
    const facilitatorUrl = USE_CDP ? null : FACILITATOR_URL;
    if (facilitatorUrl) await warmFacilitator(facilitatorUrl);

    app.listen(PORT, () => {
      console.log(`🚀 Storacha x402 Agent server running on http://localhost:${PORT}`);
      console.log(`💰 Recipient: ${RECIPIENT_ADDRESS}`);
      console.log(`🌐 Network: ${NETWORK}`);
      console.log(`📡 Facilitator: ${USE_CDP ? 'CDP (production)' : FACILITATOR_URL}`);
      console.log(`🔍 Bazaar Discovery: ENABLED`);
      console.log(`\n📋 Available endpoints:`);
      console.log(`   POST /upload  - $0.1 per upload`);
      console.log(`   GET /retrieve - $0.005 per retrieval`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

start();