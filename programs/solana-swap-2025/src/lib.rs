use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("EEyf5eniXACGtctsYLEVzu1LHYFPCPdd4ZoFSQ3VsLF6");

#[program]
pub mod solana_swap_2025 {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        price: u64,
        decimals_a: u8,
        decimals_b: u8,
        bump: u8,
    ) -> Result<()> {
        msg!("Initializing market...");
        let market = &mut ctx.accounts.market;
        market.authority = ctx.accounts.authority.key();
        market.token_mint_a = ctx.accounts.token_mint_a.key();
        market.token_mint_b = ctx.accounts.token_mint_b.key();
        market.price = price;
        market.decimals_a = decimals_a;
        market.decimals_b = decimals_b;
        market.bump = bump;
        
        Ok(())
    }

    pub fn set_exchange_rate(
        ctx: Context<SetExchangeRate>,
        new_price: u64,
    ) -> Result<()> {
        msg!("Setting exchange rate to: {}", new_price);
        let market = &mut ctx.accounts.market;
        market.price = new_price;
        Ok(())
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount: u64,
        add_to_a: bool,
    ) -> Result<()> {
        msg!("Adding liquidity: amount={}, add_to_a={}", amount, add_to_a);
        Ok(())
    }

    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        swap_a_to_b: bool,
    ) -> Result<()> {
        msg!("Performing swap: amount_in={}, swap_a_to_b={}", amount_in, swap_a_to_b);
        Ok(())
    }
}

/// Estructura para almacenar la configuración de nuestro mercado de swap.
#[account]
#[derive(InitSpace)]
pub struct MarketAccount {
    pub authority: Pubkey,      // Clave pública de la autoridad del market
    pub token_mint_a: Pubkey,   // Dirección del mint del Token A
    pub token_mint_b: Pubkey,   // Dirección del mint del Token B
    pub price: u64,             // El precio de 1 Token A en Token B (escalado)
    pub decimals_a: u8,         // Decimales del Token A
    pub decimals_b: u8,         // Decimales del Token B
    pub bump: u8,               // Bump de la PDA para MarketAccount
}

#[derive(Accounts)]
#[instruction(price: u64, decimals_a: u8, decimals_b: u8, bump: u8)]
pub struct InitializeMarket<'info> {
    pub token_mint_a: Account<'info, Mint>,
    pub token_mint_b: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + MarketAccount::INIT_SPACE, // 8 bytes para el discriminador de Anchor + longitud autocalculada
        seeds = [b"market".as_ref(), token_mint_a.key().as_ref(), token_mint_b.key().as_ref()],
        bump,
    )]
    pub market: Account<'info, MarketAccount>,

    #[account(mut)]
    pub authority: Signer<'info>, // La clave que inicializa el market y será la autoridad

    #[account(
        init,
        payer = authority,
        token::mint = token_mint_a,
        token::authority = market, // La PDA del market es la autoridad del vault
        seeds = [b"vault_a".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub vault_a: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        token::mint = token_mint_b,
        token::authority = market, // La PDA del market es la autoridad del vault
        seeds = [b"vault_b".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub vault_b: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetExchangeRate<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub market: Account<'info, MarketAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        mut,
        has_one = token_mint_a,
        has_one = token_mint_b,
    )]
    pub market: Account<'info, MarketAccount>,

    pub token_mint_a: Account<'info, Mint>,
    pub token_mint_b: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault_a", market.key().as_ref()],
        bump,
    )]
    pub vault_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_b", market.key().as_ref()],
        bump,
    )]
    pub vault_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,

    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        mut,
        has_one = token_mint_a,
        has_one = token_mint_b,
    )]
    pub market: Account<'info, MarketAccount>,

    pub token_mint_a: Account<'info, Mint>,
    pub token_mint_b: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault_a", market.key().as_ref()],
        bump,
    )]
    pub vault_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_b", market.key().as_ref()],
        bump,
    )]
    pub vault_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,

    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}
