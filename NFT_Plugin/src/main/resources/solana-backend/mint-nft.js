#!/usr/bin/env node

/**
 * Solana NFT Minting Script
 *
 * This script mints an NFT on the Solana blockchain and transfers it to a recipient.
 * It uses the Metaplex SDK to create the NFT with metadata.
 *
 * Usage:
 * node mint-nft.js --network devnet --rpc-url https://api.devnet.solana.com --private-key <PRIVATE_KEY> --recipient <RECIPIENT_ADDRESS> --name "NFT Name" --description "NFT Description" --image "https://example.com/image.png" --player "PlayerName" --achievement "achievement_key"
 */

const { program } = require('commander');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { Metaplex, keypairIdentity, bundlrStorage } = require('@metaplex-foundation/js');
const bs58 = require('bs58');
const fs = require('fs');
const fetch = require('node-fetch');

// Parse command line arguments
program
  .option('--network <network>', 'Solana network (mainnet, testnet, devnet)', 'devnet')
  .option('--rpc-url <url>', 'RPC URL', 'https://api.devnet.solana.com')
  .option('--private-key <key>', 'Private key of the server wallet (base58 encoded)')
  .option('--recipient <address>', 'Recipient wallet address')
  .option('--name <n>', 'NFT name')
  .option('--symbol <symbol>', 'NFT symbol', '')
  .option('--description <description>', 'NFT description')
  .option('--image <url>', 'NFT image URL')
  .option('--player <n>', 'Player name')
  .option('--achievement <key>', 'Achievement key')
  .option('--attributes <json>', 'NFT attributes as JSON array', '[]')
  .option('--metadata-uri <url>', 'Complete metadata URI (if provided, other metadata options are ignored)')
  .option('--confirmation-timeout <ms>', 'Timeout for transaction confirmation in milliseconds', '60000')
  .option('--retry-count <n>', 'Number of retries for failed operations', '5')
  .parse(process.argv);

const options = program.opts();

// Check for .env file and load environment variables
try {
  // Try to load .env from current directory
  if (fs.existsSync('.env')) {
    require('dotenv').config();
    console.log('Loaded .env file from current directory');
  }
  // Try to load .env from script directory
  else {
    const scriptDir = __dirname;
    const envPath = `${scriptDir}/.env`;

    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      console.log(`Loaded .env file from script directory: ${envPath}`);
    } else {
      console.log('No .env file found. Using command line arguments or environment variables.');
    }
  }
} catch (error) {
  console.log(`Error loading .env file: ${error.message}. Using command line arguments only.`);
}

// Use environment variables as fallback for command line arguments
options.privateKey = options.privateKey || process.env.SOLANA_PRIVATE_KEY;
options.network = options.network || process.env.SOLANA_NETWORK || 'devnet';
options.rpcUrl = options.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
options.confirmationTimeout = parseInt(options.confirmationTimeout || process.env.CONFIRMATION_TIMEOUT || '60000');
options.retryCount = parseInt(options.retryCount || process.env.RETRY_COUNT || '5');

// Validate required options
if (!options.privateKey) {
  console.error('Error: Private key is required. Provide it via --private-key or SOLANA_PRIVATE_KEY environment variable.');
  process.exit(1);
}

if (!options.recipient) {
  console.error('Error: Recipient address is required');
  process.exit(1);
}

// Check if we have either metadata URI or all required metadata fields
if (!options.metadataUri && (!options.name || !options.description || !options.image)) {
  console.error('Error: Either metadata URI or all metadata fields (name, description, image) are required');
  process.exit(1);
}

// Validate Solana addresses
try {
  new PublicKey(options.recipient);
} catch (error) {
  console.error('Error: Invalid recipient address');
  process.exit(1);
}

// Display information about the minting process
console.log('===================================');
console.log('Solana NFT Minting');
console.log('===================================');
console.log(`Network: ${options.network}`);
console.log(`RPC URL: ${options.rpcUrl}`);
console.log(`Recipient: ${options.recipient}`);
console.log(`NFT Name: ${options.name}`);
console.log(`Player: ${options.player || 'Not specified'}`);
console.log(`Achievement: ${options.achievement || 'Not specified'}`);
console.log(`Confirmation Timeout: ${options.confirmationTimeout}ms`);
console.log(`Retry Count: ${options.retryCount}`);
console.log('===================================');
console.log('Starting minting process...');

// Helper function to retry operations
async function withRetry(operation, maxRetries = options.retryCount) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);

      if (attempt < maxRetries) {
        // Exponential backoff with jitter: 2s, 4s, 8s, 16s, 32s, ...
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.floor(Math.random() * 1000); // Add up to 1 second of random jitter
        const delay = baseDelay + jitter;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Helper function to download an image from a URL and upload it to Arweave
async function uploadImageFromUrl(metaplex, imageUrl) {
  try {
    console.log(`Downloading image from URL: ${imageUrl}`);

    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    // Get the image as a buffer
    const imageBuffer = await response.buffer();

    // Get the content type
    const contentType = response.headers.get('content-type') || 'image/png';

    console.log(`Image downloaded, size: ${imageBuffer.length} bytes, type: ${contentType}`);

    // Upload the image to Arweave
    console.log('Uploading image to Arweave...');
    const { uri } = await metaplex.storage().upload(imageBuffer);

    console.log(`Image uploaded to Arweave: ${uri}`);
    return uri;
  } catch (error) {
    console.error('Error uploading image from URL:', error.message);
    return null;
  }
}

// Check Metaplex version
try {
  const metaplexVersion = require('@metaplex-foundation/js/package.json').version;
  console.log(`Using Metaplex version: ${metaplexVersion}`);

  // Warn if using an old version
  const [major, minor] = metaplexVersion.split('.').map(Number);
  if (major < 0 || (major === 0 && minor < 17)) {
    console.warn('WARNING: You are using an older version of Metaplex. Consider upgrading to at least 0.17.x');
    console.warn('Run: npm install @metaplex-foundation/js@latest');
  }
} catch (error) {
  console.warn('Could not determine Metaplex version:', error.message);
}

// Main function
async function mintNft() {
  try {
    // Connect to Solana
    const connection = new Connection(options.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: options.confirmationTimeout
    });

    // Create wallet from private key
    const privateKeyBytes = bs58.decode(options.privateKey);
    const wallet = Keypair.fromSecretKey(privateKeyBytes);

    // Initialize Metaplex
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(wallet))
      .use(bundlrStorage({
        address: options.network === 'mainnet' ? 'https://node1.bundlr.network' : 'https://devnet.bundlr.network',
        providerUrl: options.rpcUrl,
        timeout: options.confirmationTimeout,
      }));

    // Prepare NFT metadata
    console.log('Preparing metadata...');
    let uri;

    // Check if a complete metadata URI is provided
    if (options.metadataUri) {
      console.log(`Using provided metadata URI: ${options.metadataUri}`);
      uri = options.metadataUri;

      // Log additional metadata information if provided with metadata URI
      if (options.name) console.log(`NFT Name override: ${options.name}`);
      if (options.description) console.log(`NFT Description override: ${options.description}`);
      if (options.image) console.log(`NFT Image override: ${options.image}`);
      if (options.player) console.log(`Player: ${options.player}`);
      if (options.achievement) console.log(`Achievement: ${options.achievement}`);
    } else {
      // First, try to upload the image to Arweave if it's a URL
      let imageUri = options.image;
      try {
        if (options.image && options.image.startsWith('http')) {
          console.log('Trying to upload image from URL to Arweave:', options.image);

          // Try to upload the image directly from the URL using our helper function
          const uploadedImageUri = await withRetry(async () => {
            return await uploadImageFromUrl(metaplex, options.image);
          });

          if (uploadedImageUri) {
            imageUri = uploadedImageUri;
            console.log('Successfully uploaded image to Arweave:', imageUri);
          } else {
            console.log('Failed to upload image to Arweave, using original URL');
          }
        }
      } catch (error) {
        console.error('Error in image upload process:', error.message);
        console.log('Continuing with original image URL:', options.image);
      }

      // Generate and upload metadata
      console.log('Generating and uploading metadata...');
      const result = await withRetry(async () => {
        // Parse attributes from JSON string
        let customAttributes = [];
        try {
          if (options.attributes && options.attributes !== '[]') {
            customAttributes = JSON.parse(options.attributes);
            console.log('Parsed custom attributes:', customAttributes);
          }
        } catch (error) {
          console.error('Error parsing attributes JSON:', error.message);
          console.error('Using default attributes instead');
          customAttributes = [];
        }

        // Add default attributes if not present in custom attributes
        const defaultAttributes = [
          { trait_type: 'Player', value: options.player },
          { trait_type: 'Achievement', value: options.achievement },
          { trait_type: 'Date', value: new Date().toISOString() }
        ];

        // Combine custom and default attributes, avoiding duplicates
        const traitTypes = customAttributes.map(attr => attr.trait_type);
        const combinedAttributes = [
          ...customAttributes,
          ...defaultAttributes.filter(attr => !traitTypes.includes(attr.trait_type))
        ];

        // Create metadata object following Metaplex standards
        const metadata = {
          name: options.name,
          symbol: options.symbol || '',
          description: options.description,
          image: imageUri, // Use the potentially uploaded image URI
          external_url: '', // Optional
          attributes: combinedAttributes,
          properties: {
            files: [
              {
                uri: imageUri, // Use the potentially uploaded image URI
                type: 'image/png'
              }
            ],
            category: 'image'
          },
          collection: {
            name: 'Minecraft NFT Collection',
            family: 'NFT Plugin'
          },
          seller_fee_basis_points: 0, // No royalties (0%)
          creators: [
            {
              address: wallet.publicKey.toString(),
              share: 100
            }
          ]
        };

        console.log('Metadata to upload:', JSON.stringify(metadata, null, 2));
        return await metaplex.nfts().uploadMetadata(metadata);
      });

      uri = result.uri;
    }

    console.log(`Metadata uploaded: ${uri}`);

    // Create the NFT with confirmation
    console.log('Creating NFT...');
    const { nft } = await withRetry(async () => {
      const createInput = {
        uri,
        name: options.name,
        symbol: options.symbol || '',
        sellerFeeBasisPoints: 0, // No royalties
        maxSupply: 1, // Unique NFT
        isMutable: false, // Cannot be changed
        creators: [{ address: wallet.publicKey, share: 100 }],
        tokenOwner: wallet.publicKey, // Use the server wallet as the initial token owner
        tokenStandard: 0, // Non-fungible token
        updateAuthority: wallet, // The wallet that can update the metadata
        collection: null, // No collection for now
        uses: null // No uses for now
      };

      console.log('NFT creation parameters:', JSON.stringify({
        ...createInput,
        updateAuthority: wallet.publicKey.toString(),
      }, null, 2));

      return await metaplex.nfts().create(createInput, { commitment: 'confirmed' }); // Wait for confirmation
    });

    // Log NFT details
    console.log(`NFT created: ${nft.address.toString()}`);

    // Handle mint address correctly
    let mintPublicKey;
    if (nft.mint instanceof PublicKey) {
      mintPublicKey = nft.mint;
      console.log(`Mint address (PublicKey): ${mintPublicKey.toString()}`);
    } else if (typeof nft.mint === 'object' && nft.mint !== null) {
      // If mint is an object, try to get the address property
      if (nft.mint.address && nft.mint.address instanceof PublicKey) {
        mintPublicKey = nft.mint.address;
        console.log(`Mint address (from object): ${mintPublicKey.toString()}`);
      } else {
        // Create a new PublicKey from the string representation
        const mintAddressStr = nft.mint.toString();
        console.log(`Mint address (string): ${mintAddressStr}`);
        mintPublicKey = new PublicKey(mintAddressStr);
      }
    } else {
      throw new Error(`Invalid mint address type: ${typeof nft.mint}`);
    }

    // Log owner information if available
    if (nft.token && nft.token.ownerAddress) {
      console.log(`Owner: ${nft.token.ownerAddress.toString()}`);
    }

    // Wait for a moment to ensure the NFT is properly created on the blockchain
    console.log('Waiting for transaction confirmation...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Increased wait time to 10 seconds

    // Fetch the NFT to ensure it exists before transferring
    console.log('Verifying NFT...');
    const fetchedNft = await withRetry(async () => {
      return await metaplex.nfts().findByMint({ mintAddress: mintPublicKey }, { commitment: 'confirmed' });
    });
    console.log(`Verified NFT: ${fetchedNft.address.toString()}`);

    // Transfer the NFT to the recipient
    console.log('Transferring NFT...');
    const recipientAddress = new PublicKey(options.recipient);
    await withRetry(async () => {
      await metaplex.nfts().transfer({
        nftOrSft: fetchedNft,
        authority: wallet,
        fromOwner: wallet.publicKey,
        toOwner: recipientAddress,
      }, { commitment: 'confirmed' }); // Wait for confirmation
    });

    console.log(`NFT transferred to: ${recipientAddress.toString()}`);

    // Output the result in a format that can be parsed by the Java code
    // Use the verified NFT information
    const finalMintAddress = mintPublicKey.toString();
    const finalNftAddress = fetchedNft.address.toString();

    console.log(`SUCCESS:${finalNftAddress}:${finalMintAddress}`);

    process.exit(0);
  } catch (error) {
    console.error('Error minting NFT:', error);

    // Provide more specific error messages based on the error type
    if (error.message && error.message.includes('insufficient funds')) {
      console.error('The server wallet does not have enough SOL to pay for the transaction.');
      console.error('Please add more SOL to the wallet using the Solana Faucet: https://solfaucet.com/');
    } else if (error.message && error.message.includes('network')) {
      console.error('Network error. Please check your internet connection and the RPC URL.');
    } else if (error.message && error.message.includes('timeout')) {
      console.error('Request timed out. The Solana network might be congested or the RPC endpoint is slow.');
    } else if (error.name === 'AccountNotFoundError' || (error.message && error.message.includes('not found'))) {
      console.error('Account not found error. This usually happens when the NFT was not properly created or confirmed on the blockchain.');
      console.error('Possible solutions:');
      console.error('1. Make sure your server wallet has enough SOL (at least 0.05 SOL)');
      console.error('2. Try again later as Solana DevNet might be experiencing delays');
      console.error('3. Check if the RPC endpoint is responsive');
    } else if (error.message && error.message.includes('Cannot read properties of null')) {
      console.error('Null reference error. This usually happens when there is an issue with the token owner or wallet configuration.');
      console.error('Possible solutions:');
      console.error('1. Make sure your server wallet private key is valid');
      console.error('2. Check if the recipient wallet address is valid');
      console.error('3. Try reinstalling the Metaplex dependencies: npm install @metaplex-foundation/js@latest');
    } else if (error.message && (error.message.includes('toBuffer is not a function') || error.message.includes('is not a function'))) {
      console.error('Function not found error. This usually happens when there is a type mismatch or incompatible Metaplex version.');
      console.error('Possible solutions:');
      console.error('1. Update to the latest version of Metaplex: npm install @metaplex-foundation/js@latest');
      console.error('2. Clear node_modules and reinstall: rm -rf node_modules && npm install');
      console.error('3. Check for compatibility issues between Metaplex and Solana Web3.js');
    }

    process.exit(1);
  }
}

// Run the main function
mintNft();
