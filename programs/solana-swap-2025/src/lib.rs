use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

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

    pub fn set_price(ctx: Context<SetPrice>, price: u64) -> Result<()> {
        let market: &mut Account<'_, MarketAccount> = &mut ctx.accounts.market;
        market.price = price;
        Ok(())
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<()> {
        msg!("Adding liquidity: amount_a={}, amount_b={}", amount_a, amount_b);

        // Transfer Token A
        let cpi_accounts_a = token::Transfer {
            from: ctx.accounts.autority_token_a.to_account_info(),
            to: ctx.accounts.vault_a.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx_a = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts_a);
        token::transfer(cpi_ctx_a, amount_a)?;

        // Transfer Token B
        let cpi_accounts_b = token::Transfer {
            from: ctx.accounts.autority_token_b.to_account_info(),
            to: ctx.accounts.vault_b.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx_b = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts_b);
        token::transfer(cpi_ctx_b, amount_b)?;

        Ok(())
    }

    pub fn swap(ctx: Context<Swap>, amount: u64, a_to_b: bool) -> Result<()> {
        let market: &mut Account<'_, MarketAccount> = &mut ctx.accounts.market;

        if a_to_b {
            // Transfer Token A from user to vault A
            let cpi_accounts = token::Transfer {
                from: ctx.accounts.user_token_a.to_account_info(),
                to: ctx.accounts.vault_a.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
                amount,
            )?;

            // Calculate amount_b to send to user
            const PRICE_DECIMAL_FACTOR: u128 = 10_u128.pow(6);
            let amount_b: u64 = ((amount as u128)
                .checked_mul(market.price as u128)
                .ok_or(MySwapError::CalculationOverflow)?
                .checked_mul(10_u128.pow(market.decimals_b as u32))
                .ok_or(MySwapError::CalculationOverflow)?
                .checked_div(PRICE_DECIMAL_FACTOR)
                .ok_or(MySwapError::CalculationOverflow)?
                .checked_div(10_u128.pow(market.decimals_b as u32))
                .ok_or(MySwapError::CalculationOverflow)?) as u64;

            // Transfer Token B from vault B to user
            let cpi_account2 = token::Transfer {
                from: ctx.accounts.vault_b.to_account_info(),
                to: ctx.accounts.user_token_b.to_account_info(),
                authority: market.to_account_info(),
            };
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"market",
                market.token_mint_a.as_ref(),
                market.token_mint_b.as_ref(),
                &[market.bump],
            ]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    cpi_account2,
                    signer_seeds,
                ),
                amount_b,
            )?;
        } else {
            // Transfer Token B from user to vault B
            let cpi_accounts = token::Transfer {
                from: ctx.accounts.user_token_b.to_account_info(),
                to: ctx.accounts.vault_b.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
                amount,
            )?;

            // Calculate amount_a to send to user (amount_a = amount_b * PRICE_DECIMAL_FACTOR / price)
            const PRICE_DECIMAL_FACTOR: u128 = 10_u128.pow(6);
            let amount_a: u64 = ((amount as u128)
                .checked_mul(PRICE_DECIMAL_FACTOR)
                .ok_or(MySwapError::CalculationOverflow)?
                .checked_mul(10_u128.pow(market.decimals_a as u32))
                .ok_or(MySwapError::CalculationOverflow)?
                .checked_div(market.price as u128)
                .ok_or(MySwapError::CalculationOverflow)?
                .checked_div(10_u128.pow(market.decimals_a as u32))
                .ok_or(MySwapError::CalculationOverflow)?) as u64;

            // Transfer Token A from vault A to user
            let cpi_account2 = token::Transfer {
                from: ctx.accounts.vault_a.to_account_info(),
                to: ctx.accounts.user_token_a.to_account_info(),
                authority: market.to_account_info(),
            };
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"market",
                market.token_mint_a.as_ref(),
                market.token_mint_b.as_ref(),
                &[market.bump],
            ]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    cpi_account2,
                    signer_seeds,
                ),
                amount_a,
            )?;
        }

        Ok(())
    }
}

/// Estructura para almacenar la configuración de nuestro mercado de swap.
#[account]
#[derive(InitSpace)]
pub struct MarketAccount {
    pub authority: Pubkey,    // Clave pública de la autoridad del market
    pub token_mint_a: Pubkey, // Dirección del mint del Token A
    pub token_mint_b: Pubkey, // Dirección del mint del Token B
    pub price: u64,           // El precio de 1 Token A en Token B (escalado)
    pub decimals_a: u8,       // Decimales del Token A
    pub decimals_b: u8,       // Decimales del Token B
    pub bump: u8,             // Bump de la PDA para MarketAccount
}

#[derive(Accounts)]
#[instruction(price: u64, decimals_a: u8, decimals_b: u8, bump: u8)]
pub struct InitializeMarket<'info> {
    pub token_mint_a: Account<'info, Mint>, // <-- Public Key del Mint A, necesaria para crear las cuentas de vault A y B
    pub token_mint_b: Account<'info, Mint>, // <-- Public Key del Mint B, necesaria para crear las cuentas de vault A y B

    #[account(
        init,
        payer = authority,
        space = 8 + MarketAccount::INIT_SPACE, // 8 bytes para el discriminador de Anchor + longitud autocalculada
        seeds = [b"market".as_ref(), token_mint_a.key().as_ref(), token_mint_b.key().as_ref()], // <-- Public Key de MarketAccount creada a partir de los tokens a y b, mas la palabra market
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
pub struct SetPrice<'info> {
    pub token_mint_a: Account<'info, Mint>,
    pub token_mint_b: Account<'info, Mint>,
    #[account(
        mut,
        has_one = authority @ MySwapError::Unauthorized, // Verifica que la autoridad firme
        seeds = [b"market".as_ref(), token_mint_a.key().as_ref(), token_mint_b.key().as_ref()],
        bump,
    )]
    pub market: Account<'info, MarketAccount>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    pub token_mint_a: Account<'info, Mint>,
    pub token_mint_b: Account<'info, Mint>,
    #[account(mut,
        seeds = [b"market".as_ref(), token_mint_a.key().as_ref(), token_mint_b.key().as_ref()],
        bump
    )]
    pub market: Account<'info, MarketAccount>,

    #[account(mut,
        seeds = [b"vault_a".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub vault_a: Account<'info, TokenAccount>,

    #[account(mut,
        seeds = [b"vault_b".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub vault_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub autority_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub autority_token_b: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub token_mint_a: Account<'info, Mint>,
    pub token_mint_b: Account<'info, Mint>,
    #[account(mut,
        seeds = [b"market".as_ref(), token_mint_a.key().as_ref(), token_mint_b.key().as_ref()],
        bump
    )]
    pub market: Account<'info, MarketAccount>,

    #[account(mut,
        seeds = [b"vault_a".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub vault_a: Account<'info, TokenAccount>,

    #[account(mut,
        seeds = [b"vault_b".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub vault_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[error_code]
pub enum MySwapError {
    #[msg("La cuenta provista no está autorizada para realizar esta operación.")]
    Unauthorized,
    #[msg("Operación aritmética causó desbordamiento.")]
    CalculationOverflow,
}
