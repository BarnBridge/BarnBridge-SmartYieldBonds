// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "./../Erc20Mock.sol";
import "./../../external-interfaces/uniswap/IUniswapV2Router.sol";

contract UniswapMock is IUniswapV2Router {

    address public tokenIn;
    address public tokenOut;
    uint256 public price;

    uint256 public amountIn;
    uint256 public amountOutMin;
    address[] public path;
    address public to;
    uint256 public deadline;

    uint256 public swapExactTokensForTokensCalled;

    function setup(
      address tokenIn_,
      address tokenOut_,
      uint256 price_
    )
      external
    {
      tokenIn = tokenIn_;
      tokenOut = tokenOut_;
      price = price_;
    }

    function expectCallSwapExactTokensForTokens(
      uint256 amountIn_,
      uint256 amountOutMin_,
      address[] calldata path_,
      address to_
    ) external {
        amountIn = amountIn_;
        amountOutMin = amountOutMin_;
        path = path_;
        to = to_;

        swapExactTokensForTokensCalled = 0;
    }

    function swapExactTokensForTokens(
      uint256 amountIn_,
      uint256 amountOutMin_,
      address[] calldata path_,
      address to_,
      uint256 deadline_
    )
      external override
    returns (uint256[] memory amounts)
    {
      require(amountIn_ == amountIn, "UniswapMock: amountIn_");
      require(amountOutMin_ == amountOutMin, "UniswapMock: amountOutMin_");
      require(to_ == to, "UniswapMock: to_");
      require(deadline_ == block.timestamp, "UniswapMock: deadline_");
      require(path_.length == path.length, "UniswapMock: path_ len");
      require(path_.length >= 2, "UniswapMock: path_ len min 2");
      require(tokenIn == path_[0], "UniswapMock: incorect tokenIn");
      require(tokenOut == path_[path_.length - 1], "UniswapMock: incorect tokenOut");

      for (uint256 f = 0; f < path_.length; f++) {
        require(path[f] == path_[f], "UniswapMock: path_ mismatch");
      }

      Erc20Mock(tokenIn).transferFrom(msg.sender, address(this), amountIn_);
      Erc20Mock(tokenIn).burnMock(address(this), amountIn_);
      Erc20Mock(tokenOut).mintMock(to_, amountIn_ * price / 1e18);

      swapExactTokensForTokensCalled++;
    }

}
