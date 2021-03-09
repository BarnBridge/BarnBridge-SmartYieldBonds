import "./../../external-interfaces/compound-finance/IUniswapAnchoredOracle.sol";

contract CompOracleMock is IUniswapAnchoredOracle {

  uint256 public _price;
  uint256 public _underlyingPrice;

  function price(string memory symbol) external view override returns (uint256) {
    return _price;
  }

  function getUnderlyingPrice(address cToken) external view override returns (uint256) {
    return _underlyingPrice;
  }

  function setMockReturns(uint256 price_, uint256 underlyingPrice_) public {
    _price = price_;
    _underlyingPrice = underlyingPrice_;
  }

}
