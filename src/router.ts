// import { TradeType } from './constants'
import invariant from 'tiny-invariant'
import { validateAndParseAddress } from './utils'
import { CurrencyAmount, Percent, Trade } from './entities'

/**
 * Options for producing the arguments to send call to the router.
 */
export interface TradeOptions {
  /**
   * How much the execution price is allowed to move unfavorably from the trade execution price.
   */
  allowedSlippage: Percent
  /**
   * How long the swap is valid until it expires, in seconds.
   * This will be used to produce a `deadline` parameter which is computed from when the swap call parameters
   * are generated.
   */
  ttl: number
  /**
   * The account that should receive the output of the swap.
   */
  recipient: string

  /**
   * Whether any of the tokens in the path are fee on transfer tokens, which should be handled with special methods
   */
  feeOnTransfer?: boolean
}

/**
 * The parameters to use in the call to the Uniswap V2 Router to execute a trade.
 */
export interface SwapParameters {
  /**
   * The method to call on the Uniswap V2 Router.
   */
  methodName: string
  /**
   * The arguments to pass to the method, all hex encoded.
   */
  args: (string | string[])[]
  /**
   * The amount of wei to send in hex.
   */
  value: string
}

function toHex(currencyAmount: CurrencyAmount) {
  return `0x${currencyAmount.raw.toString(16)}`
}

const ZERO_HEX = '0x0'

/**
 * Represents the Uniswap V2 Router, and has static methods for helping execute trades.
 */
export abstract class Router {
  /**
   * Cannot be constructed.
   */
  private constructor() {}
  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
   * @param trade to produce call parameters for
   * @param options options for the call parameters
   */
  public static swapCallParameters(trade: Trade, options: TradeOptions, routerMode: number, pathArr: string[], isBNB: boolean, isExactIn: boolean): SwapParameters {

    // let etherIn = trade.inputAmount.currency === ETHER
    // let etherOut = trade.outputAmount.currency === ETHER

    let etherIn = false
    let etherOut = false


    if (isBNB){
      if(isExactIn){
        if (trade.inputAmount.currency.symbol == 'WBNB') {
          etherIn = true
        }
  
        if (trade.outputAmount.currency.symbol == 'WBNB') {
          etherOut = true
        }
      }else{
        if (trade.inputAmount.currency.symbol == 'WBNB') {
          etherOut = true
        }
  
        if (trade.outputAmount.currency.symbol == 'WBNB') {
          etherIn = true
        }
      }
    }

    
    // the router does not support both ether in and out
    invariant(!(etherIn && etherOut), 'ETHER_IN_OUT')
    invariant(options.ttl > 0, 'TTL')

    const to: string = validateAndParseAddress(options.recipient)

    let amountIn: string = toHex(trade.maximumAmountIn(options.allowedSlippage))
    let amountOut: string = toHex(trade.minimumAmountOut(options.allowedSlippage))


    if (!isExactIn) {
      // amountIn = toHex(trade.minimumAmountOutWithExactIn(options.allowedSlippage))
      // amountOut = toHex(trade.inputAmount)

      amountIn = toHex(trade.outputAmount)
      amountOut =  toHex(trade.maximumAmountInWithExactIn(options.allowedSlippage))
    }

    
    // const path: string[] = trade.route.path.map(token => token.address)
    const deadline = `0x${(Math.floor(new Date().getTime() / 1000) + options.ttl).toString(16)}`
    const _routerMode: string = `0x0${routerMode.toString(16)}`
    const useFeeOnTransfer = Boolean(options.feeOnTransfer)

    let methodName: string
    let args: (string | string[])[]
    let value: string


    if (isExactIn){
      if (etherIn) {
        methodName = useFeeOnTransfer ? 'swapExactETHForTokensSupportingFeeOnTransferTokens' : 'swapExactETHForTokens'
        // (uint amountOutMin, address[] calldata path, address to, uint deadline)
        args = [amountOut, pathArr, _routerMode, to, deadline]
        value = amountIn
      } else if (etherOut) {
        methodName = useFeeOnTransfer ? 'swapExactTokensForETHSupportingFeeOnTransferTokens' : 'swapExactTokensForETH'
        // (uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        args = [amountIn, amountOut, pathArr, _routerMode, to, deadline]
        value = ZERO_HEX
      } else {
        methodName = useFeeOnTransfer
          ? 'swapExactTokensForTokensSupportingFeeOnTransferTokens'
          : 'swapExactTokensForTokens'
        // (uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        args = [amountIn, amountOut, pathArr, _routerMode, to, deadline]
        value = ZERO_HEX
      }
    }else{
      if (etherIn) {
        methodName = 'swapExactETHForTokensSupportingFeeOnTransferTokens'
        // (uint amountOut, address[] calldata path, address to, uint deadline)
        args = [amountOut, pathArr, _routerMode, to, deadline]
        value = amountIn
      } else if (etherOut) {
        methodName = 'swapExactTokensForETHSupportingFeeOnTransferTokens'
        // (uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        args = [amountIn, amountOut, pathArr, _routerMode, to, deadline]
        value = ZERO_HEX
      } else {
        methodName = 'swapExactTokensForTokensSupportingFeeOnTransferTokens'
        // (uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        args = [amountIn, amountOut, pathArr, _routerMode, to, deadline]
        value = ZERO_HEX
      }
    }


    // switch (trade.tradeType) {
    //   case TradeType.EXACT_INPUT:
    //     if (etherIn) {
    //       methodName = useFeeOnTransfer ? 'swapExactETHForTokensSupportingFeeOnTransferTokens' : 'swapExactETHForTokens'
    //       // (uint amountOutMin, address[] calldata path, address to, uint deadline)
    //       args = [amountOut, pathArr, _routerMode, to, deadline]
    //       value = amountIn
    //     } else if (etherOut) {
    //       methodName = useFeeOnTransfer ? 'swapExactTokensForETHSupportingFeeOnTransferTokens' : 'swapExactTokensForETH'
    //       // (uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
    //       args = [amountIn, amountOut, pathArr, _routerMode, to, deadline]
    //       value = ZERO_HEX
    //     } else {
    //       methodName = useFeeOnTransfer
    //         ? 'swapExactTokensForTokensSupportingFeeOnTransferTokens'
    //         : 'swapExactTokensForTokens'
    //       // (uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
    //       args = [amountIn, amountOut, pathArr, _routerMode, to, deadline]
    //       value = ZERO_HEX
    //     }
    //     break
    //   case TradeType.EXACT_OUTPUT:
    //     invariant(!useFeeOnTransfer, 'EXACT_OUT_FOT')
    //     if (etherIn) {
    //       methodName = 'swapExactETHForTokensSupportingFeeOnTransferTokens'
    //       // (uint amountOut, address[] calldata path, address to, uint deadline)
    //       args = [amountOut, pathArr, _routerMode, to, deadline]
    //       value = amountIn
    //     } else if (etherOut) {
    //       methodName = 'swapExactTokensForETHSupportingFeeOnTransferTokens'
    //       // (uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
    //       args = [amountOut, amountIn, pathArr, _routerMode, to, deadline]
    //       value = ZERO_HEX
    //     } else {
    //       methodName = 'swapExactTokensForTokensSupportingFeeOnTransferTokens'
    //       // (uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
    //       args = [amountOut, amountIn, pathArr, _routerMode, to, deadline]
    //       value = ZERO_HEX
    //     }
    //     break
    // }

    return {
      methodName,
      args,
      value
    }
  }
}
