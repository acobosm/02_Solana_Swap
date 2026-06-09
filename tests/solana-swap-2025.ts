import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { SolanaSwap2025 } from "../target/types/solana_swap_2025";
import { createMint } from "@solana/spl-token";
import { expect } from "chai";

describe("solana-swap-2025", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaSwap2025 as Program<SolanaSwap2025>;

  let mintA: anchor.web3.Keypair;
  let mintB: anchor.web3.Keypair;
  let marketPDA: anchor.web3.PublicKey;
  let marketBump: number;
  let vaultAPDA: anchor.web3.PublicKey;
  let vaultBPDA: anchor.web3.PublicKey;

  const decimalsA = 6;
  const decimalsB = 6;

  before(async () => {
    // Generate keypairs for mints
    mintA = anchor.web3.Keypair.generate();
    mintB = anchor.web3.Keypair.generate();

    // Create Mints using SPL Token
    const payer = (provider.wallet as anchor.Wallet).payer;
    await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      decimalsA,
      mintA
    );

    await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      decimalsB,
      mintB
    );

    // Derive market PDA
    [marketPDA, marketBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("market"),
        mintA.publicKey.toBuffer(),
        mintB.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Derive vault_a PDA
    [vaultAPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_a"), marketPDA.toBuffer()],
      program.programId
    );

    // Derive vault_b PDA
    [vaultBPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_b"), marketPDA.toBuffer()],
      program.programId
    );
  });

  it("Initializes the market and verifies initial state!", async () => {
    const tx = await program.methods
      .initializeMarket(new anchor.BN(0), decimalsA, decimalsB, marketBump)
      .accounts({
        authority: provider.wallet.publicKey,
        tokenMintA: mintA.publicKey,
        tokenMintB: mintB.publicKey,
        market: marketPDA,
        vaultA: vaultAPDA,
        vaultB: vaultBPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Initialize Market TX:", tx);

    // Fetch the market account state
    const marketAccount = await program.account.marketAccount.fetch(marketPDA);

    expect(marketAccount.authority.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(marketAccount.tokenMintA.toBase58()).to.equal(mintA.publicKey.toBase58());
    expect(marketAccount.tokenMintB.toBase58()).to.equal(mintB.publicKey.toBase58());
    expect(marketAccount.decimalsA).to.equal(decimalsA);
    expect(marketAccount.decimalsB).to.equal(decimalsB);
    expect(marketAccount.price.toString()).to.equal("0");
    expect(marketAccount.bump).to.equal(marketBump);
  });

  it("Sets the exchange rate!", async () => {
    const newPrice = new anchor.BN(1500000); // e.g. 1.5 scaled
    const tx = await program.methods
      .setExchangeRate(newPrice)
      .accounts({
        market: marketPDA,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    console.log("Set Exchange Rate TX:", tx);

    const marketAccount = await program.account.marketAccount.fetch(marketPDA);
    expect(marketAccount.price.toString()).to.equal(newPrice.toString());
  });
});
