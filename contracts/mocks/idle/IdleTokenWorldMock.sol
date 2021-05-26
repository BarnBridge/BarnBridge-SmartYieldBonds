// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

// used by the cream provider tests

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../Erc20Mock.sol";

import "../../external-interfaces/idle/IIdleToken.sol";

contract IdleTokenWorldMock is IIdleToken, ERC20 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 private constant ONE_18 = 10**18;

    // Idle rebalancer current implementation address
    address public rebalancer;
    // Address collecting underlying fees
    address public feeAddress;
    // eg. 18 for DAI

    uint256 private tokenDecimals;

    // Current fee on interest gained
    uint256 public fee;
    //address public override token;
    mapping(address => uint256) public override userAvgPrices;
    address[] private _govTokens;

    address public _underlying;
    uint256 public _tokenPrice;
    uint256 public _avgAPR;
    // array with last balance recorded for each gov tokens
    mapping (address => uint256) public govTokensLastBalances;

    // govToken -> user_address -> user_index eg. usersGovTokensIndexes[govTokens[0]][msg.sender] = 1111123;
    mapping (address => mapping (address => uint256)) public usersGovTokensIndexes;

    // global indices for each gov tokens used as a reference to calculate a fair share for each user
    mapping (address => uint256) public govTokensIndexes;

    // oracle used for calculating the avgAPR with gov tokens
    address public oracle;

    uint256 public mintCalled;
    uint256 public redeemCalled;
    uint256 public redeemUnderlyingCalled;

    constructor(uint256 tokenPrice_, uint8 underlyingDecimals_, uint256 avgAPR_)
      ERC20("IdleToken mock", "IdleToken") {
      //_setupDecimals(18);
      _underlying = address(new Erc20Mock("DAI Mock", "DAIMOCK", underlyingDecimals_));
     //_comp = address(new Erc20Mock("COMP mock", "COMP", 18));
     _tokenPrice = tokenPrice_;
     _avgAPR = avgAPR_;

    }

    function mintMock(address to_, uint256 amount_) external {
      _mint(to_, amount_);
    }

    function burnMock(address to_, uint256 amount_) external {
      _burn(to_, amount_);
    }

    /* function underlying() external view returns (address) {
        return token();
    } */
    function mintIdleToken(uint256 _amount, bool _skipWholeRebalance, address _referral) external override returns (uint256) {
      IERC20(_underlying).safeTransferFrom(msg.sender, address(this), _amount);
      _mint(msg.sender, _amount/this.tokenPrice());
      mintCalled++;
      return 0;
    }

    function redeemIdleToken(uint256 redeemAmount) external override returns (uint256) {
      uint256 cTokenAmount = redeemAmount * 1e18 / (this.tokenPrice());
      _transfer(msg.sender, address(this), cTokenAmount);
      Erc20Mock(_underlying).mintMock(msg.sender, redeemAmount);
      _burn(address(this), cTokenAmount);
      redeemUnderlyingCalled++;
      return 0;
    }

    function redeemInterestBearingTokens(uint256 _amount) external override {
        Erc20Mock(_underlying).mint(msg.sender, _amount);
    }

    function rebalance() external override returns (bool) {
        return false;
    }

    /* function rebalanceWithGST() external override returns (bool) {
        return false;
    } */

    function tokenPrice() external view override returns (uint256 price) {
        return _tokenPrice;
    }

    function token() external override returns (address underlying) {
        return _underlying;
    }

    function getAPRs() external view override returns (address[] memory, uint256[] memory) {
        address[] memory addresses;
        uint256[] memory aprs;
        return (addresses, aprs);
    }

    function getAvgAPR() external view override returns (uint256 avgApr) {
        return _avgAPR;
    }

    function getGovTokensAmounts(address _usr) external view override returns (uint256[] memory amounts) {
        /* uint256[] memory govTokensAmounts = new uint256[](3);
        govTokensAmounts = [uint256(0), uint256(0), uint256(0)];
        return govTokensAmounts; */
        amounts = new uint256[](3);
        amounts[0] = 0;
        amounts[0] = 0;
        amounts[0] = 0;
    }

    /* function openRebalance(uint256[] calldata _newAllocations) external override returns (bool, uint256 avgApr) {
        return (false, _avgAPR);
    } */

    function flashLoanFee() external override view returns (uint256) {
        return 0;
    }

    function flashFee(address _token, uint256 _amount) external override view returns (uint256) {
        return 0;
    }

    function maxFlashLoan(address _token) external override view returns (uint256) {
        return 0;
    }

    /* function flashLoan(IERC3156FlashBorrower _receiver, address _token, uint256 _amount, bytes calldata _params) external override returns (bool) {
        return false;
    } */

    function getAllocations() external override view returns (uint256[] memory) {
        uint256[] memory allocs = new uint256[](1);
        allocs[0] = 0;
        return allocs;
    }

    function govTokens(uint256) external override returns (address govToken) {
        return address(0);

    }

    function getGovTokens() external override view returns (address[] memory) {
        return _govTokens;
    }

    function getAllAvailableTokens() external override view returns (address[] memory) {
        address[] memory availableTokens = new address[](1);
        availableTokens[0] = address(0);
        return availableTokens;

    }

    function getProtocolTokenToGov(address _protocolToken) external override view returns (address) {
        return address(0);
    }

    function tokenPriceWithFee(address user) external view override returns (uint256 priceWFee) {
        return 0;
    }
}
