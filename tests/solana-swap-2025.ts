import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { SolanaSwap2025 } from "../target/types/solana_swap_2025";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo, 
  TOKEN_PROGRAM_ID, 
  Account as TokenAccount 
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("solana-swap-2025", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaSwap2025 as Program<SolanaSwap2025>;

  let initializer: Keypair;
  let user: Keypair;
  let mintA: PublicKey;
  let mintB: PublicKey;
  let vaultA: PublicKey;
  let vaultB: PublicKey;
  let market: PublicKey;
  let bump: number;
  let userTokenAAccount: TokenAccount;
  let userTokenBAccount: TokenAccount;
  let initializerTokenAAccount: TokenAccount;
  let initializerTokenBAccount: TokenAccount;
  const DECIMALS_MINT_A = 6;
  const DECIMALS_MINT_B = 6;

  before(async () => {
    // Generate keypairs
    const wallet = new anchor.Wallet(Keypair.generate());
    initializer = wallet.payer;
    user = Keypair.generate();

    // Airdrop SOL to initializer and user
    const connection = anchor.getProvider().connection;

    // Airdrop 200 SOL to initializer
    const initializerAirdropSignature = await connection.requestAirdrop(
      initializer.publicKey,
      200 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction({
      signature: initializerAirdropSignature,
      blockhash: (await connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
    });

    // Airdrop 200 SOL to user
    const userAirdropSignature = await connection.requestAirdrop(
      user.publicKey,
      200 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction({
      signature: userAirdropSignature,
      blockhash: (await connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
    });

    // Create Mints
    mintA = await createMint(
      connection,
      initializer,
      initializer.publicKey,
      null,
      DECIMALS_MINT_A,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    mintB = await createMint(
      connection,
      initializer,
      initializer.publicKey,
      null,
      DECIMALS_MINT_B,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Derive market PDA
    const [m, b] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), mintA.toBuffer(), mintB.toBuffer()],
      program.programId
    );
    market = m;
    bump = b;

    // Derive vault_a PDA
    const [v1] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_a"), market.toBuffer()],
      program.programId
    );
    vaultA = v1;

    // Derive vault_b PDA
    const [v2] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_b"), market.toBuffer()],
      program.programId
    );
    vaultB = v2;

    // Get or create associated token accounts
    userTokenAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      initializer,
      mintA,
      user.publicKey
    );

    userTokenBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      initializer,
      mintB,
      user.publicKey
    );

    initializerTokenAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      initializer,
      mintA,
      initializer.publicKey
    );

    initializerTokenBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      initializer,
      mintB,
      initializer.publicKey
    );

    // Mint tokens to initializer and user for testing
    await mintTo(
      connection,
      initializer,
      mintA,
      initializerTokenAAccount.address,
      initializer.publicKey,
      1000000 * Math.pow(10, DECIMALS_MINT_A) // 1M tokens
    );

    await mintTo(
      connection,
      initializer,
      mintB,
      initializerTokenBAccount.address,
      initializer.publicKey,
      1000000 * Math.pow(10, DECIMALS_MINT_B) // 1M tokens
    );

    await mintTo(
      connection,
      initializer,
      mintA,
      userTokenAAccount.address,
      initializer.publicKey,
      1000000 * Math.pow(10, DECIMALS_MINT_A) // 1M tokens
    );

    await mintTo(
      connection,
      initializer,
      mintB,
      userTokenBAccount.address,
      initializer.publicKey,
      1000000 * Math.pow(10, DECIMALS_MINT_B) // 1M tokens
    );
  });

  it("Should initialize market", async () => {
    const tx = await program.methods
      .initializeMarket(new anchor.BN(1000000), DECIMALS_MINT_A, DECIMALS_MINT_B, bump)
      .accounts({
        market: market,
        vaultA: vaultA,
        vaultB: vaultB,
        tokenMintA: mintA,
        tokenMintB: mintB,
        authority: initializer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([initializer])
      .rpc();

    expect(tx).to.not.be.null;

    const marketAccount = await program.account.marketAccount.fetch(market);

    expect(marketAccount.price.eq(new anchor.BN(1000000)), "Price should be 1000000").to.be.true;
    expect(marketAccount.decimalsA).to.equal(DECIMALS_MINT_A, "Decimals A should be 6");
    expect(marketAccount.decimalsB).to.equal(DECIMALS_MINT_B, "Decimals B should be 6");
    expect(marketAccount.bump).to.equal(bump, "Bump should be " + bump);
    expect(marketAccount.tokenMintA.toString()).to.equal(mintA.toString(), "Token Mint A should be " + mintA.toString());
    expect(marketAccount.tokenMintB.toString()).to.equal(mintB.toString(), "Token Mint B should be " + mintB.toString());
    console.log("Initialize market tx:", tx);
  });

  it("Sets the exchange rate!", async () => {
    const newPrice = new anchor.BN(1500000); // e.g. 1.5 scaled
    const tx = await program.methods
      .setExchangeRate(newPrice)
      .accounts({
        market: market,
        authority: initializer.publicKey,
      })
      .signers([initializer])
      .rpc();

    console.log("Set Exchange Rate TX:", tx);

    const marketAccount = await program.account.marketAccount.fetch(market);
    expect(marketAccount.price.toString()).to.equal(newPrice.toString());
  });

  it("Adds liquidity!", async () => {
    const tx = await program.methods
      .addLiquidity(new anchor.BN(500_000_000), true) // amount: 500, addToA: true
      .accounts({
        authority: user.publicKey,
        sourceTokenAccount: userTokenAAccount.address,
        market: market,
        vaultA: vaultA,
        vaultB: vaultB,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Add Liquidity TX:", tx);
  });

  it("Swaps tokens!", async () => {
    const tx = await program.methods
      .swap(new anchor.BN(100_000_000), true) // amountIn: 100, swapAToB: true
      .accounts({
        user: user.publicKey,
        userTokenAAccount: userTokenAAccount.address,
        userTokenBAccount: userTokenBAccount.address,
        market: market,
        vaultA: vaultA,
        vaultB: vaultB,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Swap TX:", tx);
  });
});
