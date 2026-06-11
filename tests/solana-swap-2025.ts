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

  it("Should set price", async () => {
    const tx = await program.methods
      .setPrice(new anchor.BN(2500000))
      .accounts({
        market: market,
        tokenMintA: mintA,
        tokenMintB: mintB,
        authority: initializer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([initializer])
      .rpc();

    const marketAccount = await program.account.marketAccount.fetch(market);
    expect(marketAccount.price.eq(new anchor.BN(2500000))).to.be.true;
    expect(tx).to.not.be.null;
  });

  it("Should add liquidity", async () => {
    const connection = anchor.getProvider().connection;
    const balanceAuthorityTokenABefore = await connection.getTokenAccountBalance(initializerTokenAAccount.address);
    const balanceAuthorityTokenBBefore = await connection.getTokenAccountBalance(initializerTokenBAccount.address);
    console.log("Authority Token A balance before:", balanceAuthorityTokenABefore.value.uiAmount);
    console.log("Authority Token B balance before:", balanceAuthorityTokenBBefore.value.uiAmount);
    const amountA = new anchor.BN(1000 * Math.pow(10, DECIMALS_MINT_A));
    const amountB = new anchor.BN(1000 * Math.pow(10, DECIMALS_MINT_B));
    const tx = await program.methods.addLiquidity(
      amountA,
      amountB,
    ).accounts({
      market: market,
      tokenMintA: mintA,
      tokenMintB: mintB,
      autorityTokenA: initializerTokenAAccount.address,
      autorityTokenB: initializerTokenBAccount.address,
      vaultA: vaultA,
      vaultB: vaultB,
      authority: initializer.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([initializer]).rpc();

    expect(tx).to.not.be.null;

    const balanceAuthorityTokenAfter = await connection.getTokenAccountBalance(initializerTokenAAccount.address);
    console.log("Authority Token A balance after:", balanceAuthorityTokenAfter.value.uiAmount);
    expect(balanceAuthorityTokenAfter.value.uiAmount).to.equal(balanceAuthorityTokenABefore.value.uiAmount - amountA.toNumber() / Math.pow(10, DECIMALS_MINT_A));

    const balanceAuthorityTokenBAfter = await connection.getTokenAccountBalance(initializerTokenBAccount.address);
    console.log("Authority Token B balance after:", balanceAuthorityTokenBAfter.value.uiAmount);
    expect(balanceAuthorityTokenBAfter.value.uiAmount).to.equal(balanceAuthorityTokenBBefore.value.uiAmount - amountB.toNumber() / Math.pow(10, DECIMALS_MINT_B));

    const balanceVaultA = await connection.getTokenAccountBalance(vaultA);
    console.log("Vault A balance after:", balanceVaultA.value.uiAmount);
    expect(balanceVaultA.value.uiAmount).to.equal(amountA.toNumber() / Math.pow(10, DECIMALS_MINT_A), "Vault A should have 100 tokens");

    const balanceVaultB = await connection.getTokenAccountBalance(vaultB);
    console.log("Vault B balance after:", balanceVaultB.value.uiAmount);
    expect(balanceVaultB.value.uiAmount).to.equal(amountB.toNumber() / Math.pow(10, DECIMALS_MINT_B), "Vault B should have 100 tokens");
  });

  it("Should swap", async () => {
    const connection = anchor.getProvider().connection;
    const balanceUserTokenABefore = (await connection.getTokenAccountBalance(userTokenAAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_A);
    const balanceUserTokenBBefore = (await connection.getTokenAccountBalance(userTokenBAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_B);
    console.log("User Token A balance before:", balanceUserTokenABefore);
    console.log("User Token B balance before:", balanceUserTokenBBefore);

    const amount = new anchor.BN(100 * Math.pow(10, DECIMALS_MINT_A));

    const tx = await program.methods.swap(
      amount,
      true,
    ).accounts({
      market: market,
      tokenMintA: mintA,
      tokenMintB: mintB,
      vaultA: vaultA,
      vaultB: vaultB,
      userTokenA: userTokenAAccount.address,
      userTokenB: userTokenBAccount.address,
      user: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([user]).rpc();

    console.log("Swap tx:", tx);
    expect(tx).to.not.be.null;

    const balanceUserTokenAAfter = (await connection.getTokenAccountBalance(userTokenAAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_A);
    const balanceUserTokenBAfter = (await connection.getTokenAccountBalance(userTokenBAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_B);
    console.log("User Token A balance after:", balanceUserTokenAAfter);
    console.log("User Token B balance after:", balanceUserTokenBAfter);

    expect(balanceUserTokenAAfter).to.equal(balanceUserTokenABefore - amount.toNumber(), "User should have 90 tokens after swapping");
    expect(balanceUserTokenBAfter).to.equal(balanceUserTokenBBefore + amount.toNumber() * 2.5, "User should have 110 tokens after swap...");
  });

  it("Should swap Token B to A", async () => {
    const connection = anchor.getProvider().connection;
    const balanceUserTokenABefore = (await connection.getTokenAccountBalance(userTokenAAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_A);
    const balanceUserTokenBBefore = (await connection.getTokenAccountBalance(userTokenBAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_B);

    const amountIn = new anchor.BN(250 * Math.pow(10, DECIMALS_MINT_B));

    const tx = await program.methods.swap(
      amountIn,
      false,
    ).accounts({
      market: market,
      tokenMintA: mintA,
      tokenMintB: mintB,
      vaultA: vaultA,
      vaultB: vaultB,
      userTokenA: userTokenAAccount.address,
      userTokenB: userTokenBAccount.address,
      user: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([user]).rpc();

    expect(tx).to.not.be.null;

    const balanceUserTokenAAfter = (await connection.getTokenAccountBalance(userTokenAAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_A);
    const balanceUserTokenBAfter = (await connection.getTokenAccountBalance(userTokenBAccount.address)).value.uiAmount * Math.pow(10, DECIMALS_MINT_B);

    expect(balanceUserTokenAAfter).to.equal(balanceUserTokenABefore + 100 * Math.pow(10, DECIMALS_MINT_A));
    expect(balanceUserTokenBAfter).to.equal(balanceUserTokenBBefore - amountIn.toNumber());
  });
});
